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

  // .env.local dosyasından gerçek bilgileri okuyoruz
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  const pageParam = parseInt(searchParams.get("page") || "0", 10);
  const sizeParam = parseInt(searchParams.get("size") || "50", 10);
  const fetchDays = parseInt(searchParams.get("fetchDays") || "0", 10);
  const refreshParam = searchParams.get("refresh") === "true";
  const cleanOrderNumber = orderNumber ? orderNumber.trim().replace(/^#/, "") : "";

  // 1. Doğrudan Veritabanı Sorgusu İstenmişse (source=db)
  if (sourceParam === "db") {
    try {
      const dbResult = await OrderStorage.queryOrders({
        orderNumber: cleanOrderNumber,
        storeId: storeIdParam,
        status: statusParam,
        startDate: startDateParam || (fetchDays > 0 ? Date.now() - fetchDays * 24 * 60 * 60 * 1000 : null),
        endDate: endDateParam,
        page: pageParam,
        size: sizeParam,
        all: allParam,
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
        ? `orders:${supplierId}:${cleanOrderNumber}:store:${storeIdParam || "all"}:status:${statusParam || "all"}`
        : allParam
        ? `orders:${supplierId}:all:store:${storeIdParam || "all"}:status:${statusParam || "all"}`
        : fetchDays > 0
        ? `orders:${supplierId}:days:${fetchDays}:store:${storeIdParam || "all"}:status:${statusParam || "all"}`
        : `orders:${supplierId}:p:${pageParam}:s:${sizeParam}:store:${storeIdParam || "all"}:status:${statusParam || "all"}`;

      if (!refreshParam) {
        const cachedData = await redis.get(cacheKey).catch(() => null);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      } else {
        await redis.del(cacheKey).catch(() => null);
      }

      let filteredContent: any[] = [];
      let totalPages = 1;
      let totalElements = 0;

      const headers = {
        Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
        "x-agentname": agentName,
        "x-executor-user": executorUser,
      };

      if (allParam) {
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
          // Supabase'de geçmiş siparişler var -> Trendyol'a 10 sayfa sorgu ATMA! Sadece canlı ilk sayfayı çek.
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
              OrderStorage.upsertPackages(deltaItems, "trendyol_delta").catch(() => {});
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
          const tPages = Math.min(firstRes.data?.totalPages || 1, 15); // Maksimum 15 sayfa (3.000 sipariş)

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
            OrderStorage.upsertPackages(filteredContent, "trendyol_initial_sync").catch(() => {});
          }
        }

        totalElements = filteredContent.length;
        totalPages = 1;
      } else if (fetchDays > 0) {
        // ── GÜNLÜK DELTA / fetchDays: Sadece gerekli gün penceresini çek ──
        const cutoffDate = Date.now() - fetchDays * 24 * 60 * 60 * 1000;
        
        // Eğer sadece 1 gün (Bugün) isteniyorsa sadece sayfa 0'ı çekip dön (Süper Hızlı: 200ms)
        const firstRes = await axios.get(
          `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
          {
            headers,
            params: { size: 200, page: 0 },
            timeout: 8000,
          }
        );
        const p0 = firstRes.data?.content || [];
        filteredContent = p0.filter((pkg: any) => pkg.orderDate >= cutoffDate);

        if (filteredContent.length > 0) {
          OrderStorage.upsertPackages(filteredContent, "trendyol_today").catch(() => {});
        }

        totalElements = filteredContent.length;
        totalPages = 1;
      } else if (cleanOrderNumber) {
        // Tek sipariş araması: Önce Supabase'e bak (5ms)
        try {
          const dbSearch = await OrderStorage.queryOrders({ orderNumber: cleanOrderNumber, all: true });
          if (dbSearch.content && dbSearch.content.length > 0) {
            filteredContent = dbSearch.content;
            totalPages = 1;
            totalElements = dbSearch.content.length;
          }
        } catch {}

        // Supabase'de yoksa Trendyol API'sinde ara
        if (filteredContent.length === 0) {
          const checkMatch = (pkg: any) => {
            if (storeIdParam && storeIdParam !== "all" && pkg.storeId?.toString() !== storeIdParam) return false;
            if (statusParam && statusParam !== "all" && pkg.packageStatus !== statusParam) return false;

            const q = cleanOrderNumber.toLowerCase();
            const num = (pkg.orderNumber || "").toString().toLowerCase();
            const pId = (pkg.id || "").toString().toLowerCase();
            const pkgNum = (pkg.packageNumber || "").toString().toLowerCase();
            if (num.includes(q) || pId.includes(q) || pkgNum.includes(q)) return true;

            const name = `${pkg.customer?.firstName || ""} ${pkg.customer?.lastName || ""}`.toLowerCase();
            if (name.includes(q)) return true;

            const hasLine = pkg.lines?.some(
              (l: any) =>
                (l.barcode || "").toLowerCase().includes(q) ||
                (l.product?.name || "").toLowerCase().includes(q)
            );
            return !!hasLine;
          };

          const scanParams: any = { size: 200, page: 0 };
          if (storeIdParam && storeIdParam !== "all") scanParams.storeId = storeIdParam;
          if (statusParam && statusParam !== "all") scanParams.status = statusParam;

          const res0 = await axios.get(
            `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
            {
              headers,
              params: scanParams,
            }
          );
          let matches = (res0.data?.content || []).filter(checkMatch);

          if (matches.length > 0) {
            OrderStorage.upsertPackages(matches, "trendyol_search").catch(() => {});
          }

          filteredContent = matches;
          totalPages = 1;
          totalElements = matches.length;
        }
      } else {
        // Normal sayfalandırma
        const queryParams: any = {
          size: sizeParam,
          page: pageParam,
        };
        if (storeIdParam && storeIdParam !== "all") queryParams.storeId = storeIdParam;
        if (statusParam && statusParam !== "all") queryParams.status = statusParam;

        const response = await axios.get(
          `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
          {
            headers,
            params: queryParams,
          }
        );

        filteredContent = response.data?.content || [];
        totalPages = response.data?.totalPages || 1;
        totalElements = response.data?.totalElements || filteredContent.length;

        if (filteredContent.length > 0) {
          OrderStorage.upsertPackages(filteredContent, "trendyol_page").catch(() => {});
        }
      }

      const responseData = {
        content: filteredContent,
        totalElements,
        totalPages,
        page: pageParam,
        executorUser,
      };

      // all=true için 600s, anlık bugün (fetchDays=1) için 45s, normal için 180s Redis önbelleği
      const ttl = allParam ? 600 : fetchDays === 1 ? 45 : 180;
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
      } catch {}

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
