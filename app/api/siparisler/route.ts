import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { OrderStorage } from "@/lib/order-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("orderNumber") || searchParams.get("query") || searchParams.get("search");
  const storeIdParam = searchParams.get("storeId");
  const statusParam = searchParams.get("status");
  const allParam = searchParams.get("all") === "true";
  const sourceParam = searchParams.get("source"); // "db" to force Supabase only

  const startDateParam = searchParams.get("startDate") ? parseInt(searchParams.get("startDate")!, 10) : null;
  const endDateParam = searchParams.get("endDate") ? parseInt(searchParams.get("endDate")!, 10) : null;
  const sortKeyParam = searchParams.get("sortKey");
  const sortDirParam = (searchParams.get("sortDir") || "desc") as "asc" | "desc";

  // .env.local dosyasından gerçek bilgileri okuyoruz
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  const pageParam = parseInt(searchParams.get("page") || "0", 10);
  const sizeParam = parseInt(searchParams.get("size") || "25", 10);
  const fetchDays = parseInt(searchParams.get("fetchDays") || "0", 10);
  const refreshParam = searchParams.get("refresh") === "true";
  const cleanOrderNumber = orderNumber ? orderNumber.trim().replace(/^#/, "") : "";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const calculatedStartDate = startDateParam || (fetchDays > 0 ? (fetchDays === 1 ? startOfToday.getTime() : Date.now() - fetchDays * 24 * 60 * 60 * 1000) : null);
  const querySize = fetchDays > 0 && !searchParams.get("size") ? 1000 : sizeParam;

  // 1. Doğrudan Veritabanı Sorgusu İstenmişse (source=db)
  if (sourceParam === "db") {
    try {
      const dbResult = await OrderStorage.queryOrders({
        orderNumber: cleanOrderNumber,
        storeId: storeIdParam,
        status: statusParam,
        startDate: calculatedStartDate,
        endDate: endDateParam,
        page: pageParam,
        size: querySize,
        all: allParam,
        sortKey: sortKeyParam,
        sortDir: sortDirParam,
      });
      return NextResponse.json({
        ...dbResult,
        executorUser: executorUser || "supabase",
        source: "supabase",
      });
    } catch (e: any) {
      console.error("[Siparisler] Supabase sorgu hatası:", e.message);
    }
  }

  // 2. Canlı Trendyol Entegrasyonu ve Akıllı Artımlı (Incremental) Supabase Senkronizasyonu
  if (supplierId && agentName && executorUser) {
    try {
      // Önbellek Anahtarı
      const cacheKey = cleanOrderNumber
        ? `orders:${supplierId}:q:${cleanOrderNumber}:store:${storeIdParam || "all"}:st:${statusParam || "all"}:p:${pageParam}:s:${sizeParam}:sk:${sortKeyParam || "date"}:${sortDirParam}`
        : allParam
          ? `orders:${supplierId}:all:store:${storeIdParam || "all"}:st:${statusParam || "all"}:sd:${startDateParam || 0}:ed:${endDateParam || 0}`
          : fetchDays > 0
            ? `orders:${supplierId}:days:${fetchDays}:store:${storeIdParam || "all"}:st:${statusParam || "all"}`
            : `orders:${supplierId}:p:${pageParam}:s:${sizeParam}:store:${storeIdParam || "all"}:st:${statusParam || "all"}:sd:${startDateParam || 0}:ed:${endDateParam || 0}:sk:${sortKeyParam || "date"}:${sortDirParam}`;

      if (!refreshParam) {
        const cachedData = await redis.get(cacheKey).catch(() => null);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      } else {
        await redis.del(cacheKey).catch(() => null);
      }

      const headers = {
        Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
        "x-agentname": agentName,
        "x-executor-user": executorUser,
      };

      if (allParam) {
        let filteredContent: any[] = [];
        // ── AKILLI TÜM HAVUZ ÇEKME: Önce Supabase'den al (50ms), sadece bugünün deltasını Trendyol'dan besle ──
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        let dbResult: any = { content: [] };
        try {
          dbResult = await OrderStorage.queryOrders({
            storeId: storeIdParam,
            status: statusParam,
            startDate: startDateParam || ninetyDaysAgo,
            endDate: endDateParam,
            all: true,
          });
        } catch (dbErr: any) {
          console.warn("[Siparisler] Supabase allParam sorgusu:", dbErr.message);
        }

        const map = new Map<string, any>();
        if (dbResult.content && dbResult.content.length > 0) {
          dbResult.content.forEach((pkg: any) => map.set(String(pkg.id || pkg.orderNumber), pkg));

          // Canlı delta sorgusu (Son 24 saat veya en yeni 200 sipariş - 200ms)
          try {
            const deltaRes = await axios.get(
              `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
              {
                headers,
                params: { size: 200, page: 0 },
                timeout: 8000,
              }
            );
            const deltaItems: any[] = deltaRes.data?.content || [];
            if (deltaItems.length > 0) {
              deltaItems.forEach((pkg: any) => map.set(String(pkg.id || pkg.orderNumber), pkg));
              OrderStorage.upsertPackages(deltaItems, "trendyol_delta").catch(() => { });
            }
          } catch (e: any) {
            console.warn("[Siparisler] Canlı delta sorgusu hatası:", e.message);
          }

          filteredContent = Array.from(map.values()).sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0));
        } else {
          // Supabase tamamen boş -> İlk kurulum için Trendyol'dan son 90 günü paralel çek ve Supabase'e kalıcı kaydet
          const firstRes = await axios.get(
            `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
            {
              headers,
              params: { size: 200, page: 0 },
              timeout: 12000,
            }
          );
          const p0 = firstRes.data?.content || [];
          filteredContent.push(...p0);
          const tPages = Math.min(firstRes.data?.totalPages || 1, 15);

          if (tPages > 1) {
            const pagesToFetch = Array.from({ length: tPages - 1 }, (_, i) => i + 1);
            const chunkResults = await Promise.all(
              pagesToFetch.map((p) =>
                axios
                  .get(`https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`, {
                    headers,
                    params: { size: 200, page: p },
                    timeout: 10000,
                  })
                  .then((r) => r.data?.content || [])
                  .catch(() => [])
              )
            );
            for (const items of chunkResults) filteredContent.push(...items);
          }

          filteredContent = filteredContent.filter((pkg: any) => pkg.orderDate >= ninetyDaysAgo);
          if (filteredContent.length > 0) {
            OrderStorage.upsertPackages(filteredContent, "trendyol_initial_sync").catch(() => { });
          }
        }

        const responseData = {
          content: filteredContent,
          totalElements: filteredContent.length,
          totalPages: 1,
          page: 0,
          executorUser,
        };

        await redis.set(cacheKey, JSON.stringify(responseData), "EX", 600).catch(() => null);
        return NextResponse.json(responseData);
      }

      // ── SAYFALANDIRILMIŞ VE SUNUCUDA İŞLENMİŞ SORGULAMA (Server-Side Pagination) ──
      // Sayfa 0 veya yenileme isteğinde arka planda Trendyol API'sinden en yeni paketleri çek ve DB'ye besle
      if (pageParam === 0 || refreshParam) {
        axios
          .get(
            `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
            {
              headers,
              params: { size: 50, page: 0 },
              timeout: 5000,
            }
          )
          .then((r) => {
            const livePkgs = r.data?.content || [];
            if (livePkgs.length > 0) {
              OrderStorage.upsertPackages(livePkgs, "trendyol_live_delta").catch(() => { });
            }
          })
          .catch(() => { });
      }

      const dbResult = await OrderStorage.queryOrders({
        orderNumber: cleanOrderNumber,
        storeId: storeIdParam,
        status: statusParam,
        startDate: calculatedStartDate,
        endDate: endDateParam,
        page: pageParam,
        size: querySize,
        all: allParam,
        sortKey: sortKeyParam,
        sortDir: sortDirParam,
      });

      const responseData = {
        content: dbResult.content,
        totalElements: dbResult.totalElements,
        totalPages: dbResult.totalPages,
        page: dbResult.page,
        size: dbResult.size,
        tabCounts: dbResult.tabCounts,
        executorUser,
      };

      const ttl = pageParam > 0 ? 180 : (fetchDays === 1 ? 45 : 60);
      await redis.set(cacheKey, JSON.stringify(responseData), "EX", ttl).catch(() => null);

      return NextResponse.json(responseData);
    } catch (error: any) {
      console.error("Trendyol Sipariş Çekme Hatası:", error?.response?.data || error.message);

      // Trendyol API hatası alsa bile Supabase'den kurtar
      try {
        const fallback = await OrderStorage.queryOrders({
          storeId: storeIdParam,
          status: statusParam,
          page: pageParam,
          size: sizeParam,
          all: allParam,
        });
        return NextResponse.json({ ...fallback, executorUser: "supabase_fallback" });
      } catch { }

      return NextResponse.json({ error: "Gerçek siparişler çekilirken bir hata oluştu." }, { status: 500 });
    }
  }

  // BİLGİLER DOLDURULMAMIŞSA SUPABASE'DEN DÖN
  try {
    const dbFallback = await OrderStorage.queryOrders({
      storeId: storeIdParam,
      status: statusParam,
      page: pageParam,
      size: sizeParam,
      all: allParam,
    });
    return NextResponse.json({ ...dbFallback, executorUser: "supabase_direct" });
  } catch {
    return NextResponse.json({ content: [], totalElements: 0, totalPages: 1, page: 0 });
  }
}
