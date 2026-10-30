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
  const cleanOrderNumber = orderNumber ? orderNumber.trim().replace(/^#/, "") : "";

  // 1. Doğrudan Veritabanı Sorgusu İstenmişse (source=db veya all=true ve Trendyol atlanmak isteniyorsa)
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

  // 2. Canlı Trendyol Entegrasyonu ve Hibrit Supabase Birleştirmesi
  if (supplierId && agentName && executorUser) {
    try {
      // Önbellek Anahtarı (Canlı veri için kısa süreli)
      const cacheKey = cleanOrderNumber
        ? `orders:${supplierId}:${cleanOrderNumber}:store:${storeIdParam || "all"}:status:${statusParam || "all"}`
        : fetchDays > 0
        ? `orders:${supplierId}:days:${fetchDays}:all:${allParam}`
        : `orders:${supplierId}:p:${pageParam}:s:${sizeParam}:store:${storeIdParam || "all"}:status:${statusParam || "all"}`;
      
      const cachedData = await redis.get(cacheKey).catch(() => null);
      if (cachedData) {
        return NextResponse.json(JSON.parse(cachedData));
      }

      let filteredContent: any[] = [];
      let totalPages = 1;
      let totalElements = 0;

      if (fetchDays > 0 || allParam) {
        const effectiveDays = allParam ? 3650 : fetchDays; // all ise 10 yıllık havuz
        const cutoffDate = Date.now() - effectiveDays * 24 * 60 * 60 * 1000;
        let keepFetching = true;
        let page = 0;

        // a. Trendyol'dan son 30-35 günün canlı paketlerini çek
        while (keepFetching && page < totalPages) {
          const response = await axios.get(
            `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
            {
              headers: {
                Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
                "x-agentname": agentName,
                "x-executor-user": executorUser,
              },
              params: { size: 200, page },
            }
          );

          if (response.data?.content && response.data.content.length > 0) {
            filteredContent = filteredContent.concat(response.data.content);
            const lastItem = response.data.content[response.data.content.length - 1];
            if (lastItem && lastItem.orderDate < cutoffDate) {
              keepFetching = false;
            }
          } else {
            keepFetching = false;
          }

          totalPages = response.data?.totalPages || 1;
          page++;
        }

        // Sadece istenen süre içindeki siparişleri tut
        filteredContent = filteredContent.filter((pkg: any) => pkg.orderDate >= cutoffDate);

        // b. Çekilen canlı paketleri Supabase'e kaydet (Arka planda kalıcı hale getir)
        if (filteredContent.length > 0) {
          OrderStorage.upsertPackages(filteredContent, "trendyol_api").catch((err) => {
            console.warn("[Siparisler] Supabase arka plan upsert hatası:", err.message);
          });
        }

        // c. Trendyol'un canlı havuzundan düşmüş eski siparişleri Supabase'den tamamla
        // (Trendyol 35 günden eskisini vermez, o yüzden Supabase'deki eski siparişleri ekliyoruz)
        try {
          const dbOlderOrders = await OrderStorage.queryOrders({
            storeId: storeIdParam,
            status: statusParam,
            startDate: cutoffDate,
            endDate: Date.now(),
            all: true,
          });

          if (dbOlderOrders.content && dbOlderOrders.content.length > 0) {
            const seenIds = new Set(filteredContent.map((p) => String(p.id || p.orderNumber)));
            for (const oldPkg of dbOlderOrders.content) {
              const id = String(oldPkg.id || oldPkg.orderNumber);
              if (!seenIds.has(id)) {
                seenIds.add(id);
                filteredContent.push(oldPkg);
              }
            }
            // Tarihe göre yeniden sırala (en yeniden en eskiye)
            filteredContent.sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0));
          }
        } catch (dbErr: any) {
          console.warn("[Siparisler] Supabase tamamlayıcı okuma hatası:", dbErr.message);
        }

        totalElements = filteredContent.length;
        totalPages = 1;
      } else if (cleanOrderNumber) {
        // Tek sipariş araması: Önce Supabase'e bak
        try {
          const dbSearch = await OrderStorage.queryOrders({ orderNumber: cleanOrderNumber, all: true });
          if (dbSearch.content && dbSearch.content.length > 0) {
            filteredContent = dbSearch.content;
            totalPages = 1;
            totalElements = dbSearch.content.length;
          }
        } catch {}

        // Eğer Supabase'de yoksa Trendyol API'sinde ara
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
              headers: {
                Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
                "x-agentname": agentName,
                "x-executor-user": executorUser,
              },
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
            headers: {
              Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
              "x-agentname": agentName,
              "x-executor-user": executorUser,
            },
            params: queryParams,
          }
        );

        filteredContent = response.data?.content || [];
        totalPages = response.data?.totalPages || 1;
        totalElements = response.data?.totalElements || filteredContent.length;

        // Arka planda Supabase'e yaz
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

      // Kısa süreli Redis Cache
      await redis.set(cacheKey, JSON.stringify(responseData), "EX", 10).catch(() => null);

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
