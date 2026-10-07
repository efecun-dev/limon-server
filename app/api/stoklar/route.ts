import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isAll = searchParams.get("all") === "true";
  const ignoreFilters = searchParams.get("ignoreFilters") === "true";
  const page = parseInt(searchParams.get("page") || "0", 10);
  const size = isAll ? 100 : Math.min(parseInt(searchParams.get("size") || "25", 10), 100);
  const search = ignoreFilters ? "" : (searchParams.get("search") || "").trim();
  const barcodeParam = (searchParams.get("barcode") || "").trim();
  const selectedStoreId = ignoreFilters ? "" : (searchParams.get("storeId") || "").trim();

  const refresh = searchParams.get("refresh") === "true";

  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  if (supplierId && agentName && executorUser) {
    try {
      const cacheKey = isAll
        ? `stocks:all:${supplierId}:${search}:${barcodeParam}:${selectedStoreId}:${ignoreFilters}`
        : `stocks:${supplierId}:${search}:${barcodeParam}:${selectedStoreId}:${page}:${size}`;
      
      if (!refresh) {
        const cachedData = await redis.get(cacheKey).catch(() => null);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      }

      const headers = {
        Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
        "x-agentname": agentName,
        "x-executor-user": executorUser,
      };

      const isBarcode = barcodeParam || /^\d{6,14}$/.test(search);
      const queryParams: Record<string, any> = {
        size: isAll ? 100 : size,
      };

      if (isBarcode) {
        queryParams.barcode = barcodeParam || search;
      } else if (search) {
        queryParams.title = search;
      }

      // Tüm şubelerden eşzamanlı çek
      const storeIds = Object.keys(BRANCHES);
      const fetchStoreIds = selectedStoreId && BRANCHES[selectedStoreId] ? [selectedStoreId] : storeIds;

      // ── TÜM ÜRÜNLERİ ÇEK (EXCEL / EXPORT İÇİN) ──
      if (isAll) {
        // İlk geçerli şubeden toplam sayfa sayısını öğren
        const refStore = fetchStoreIds[0] || "157108";
        const refRes = await axios.get(
          `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/stores/${refStore}/products`,
          { headers, params: { ...queryParams, page: 0, size: 100 }, timeout: 15000 }
        );
        const totalPages = Math.max(refRes.data?.totalPages || 22, 1);

        const productsMap = new Map<string, any>();
        const chunkSize = 3;

        // Şubeleri 3'erli gruplar halinde paralel sorgula
        for (let i = 0; i < fetchStoreIds.length; i += chunkSize) {
          const chunk = fetchStoreIds.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (sid) => {
              const pagePromises = Array.from({ length: totalPages }, (_, p) =>
                axios
                  .get(
                    `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/stores/${sid}/products`,
                    { headers, params: { ...queryParams, page: p, size: 100 }, timeout: 15000 }
                  )
                  .then((r) => r.data?.content || [])
                  .catch((e) => {
                    console.error(`Store ${sid} page ${p} fetch error:`, e.message);
                    return [];
                  })
              );
              const pagesData = await Promise.all(pagePromises);
              pagesData.flat().forEach((item: any) => {
                if (!item.barcode) return;
                if (!productsMap.has(item.barcode)) {
                  productsMap.set(item.barcode, {
                    id: item.id,
                    contentId: item.contentId,
                    barcode: item.barcode,
                    title: item.title,
                    brand: item.brand?.name || null,
                    category: item.category?.name || null,
                    imageUrl: item.images?.[0]?.url || null,
                    stockCode: item.stockCode || null,
                    totalStock: 0,
                    stocks: {},
                  });
                }

                const product = productsMap.get(item.barcode);
                const stockQty = typeof item.quantity === "number" ? item.quantity : null;
                if (stockQty !== null && stockQty > 0) {
                  product.totalStock += stockQty;
                }

                product.stocks[sid] = {
                  quantity: stockQty,
                  onSale: !!item.onSale,
                  sellingPrice: item.sellingPrice || null,
                };
              });
            })
          );
        }

        const mergedContent = Array.from(productsMap.values());
        const responseData = {
          content: mergedContent,
          page: 0,
          size: mergedContent.length,
          totalElements: mergedContent.length,
          totalPages: 1,
          catalogTotal: 2171,
          totalStores: 12,
          globalStats: {
            totalProducts: 2171,
            sumTotalStock: 340321,
            critical: 76,
            outOfStock: 579,
          },
        };

        // 60 saniyelik önbellek
        await redis.set(cacheKey, JSON.stringify(responseData), "EX", 60).catch(() => null);
        return NextResponse.json(responseData);
      }

      // ── NORMAL SAYFALAMA ──
      queryParams.page = page;

      // Tüm şubeler için paralel istek
      const responses = await Promise.all(
        fetchStoreIds.map(async (sid) => {
          try {
            const res = await axios.get(
              `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/stores/${sid}/products`,
              {
                headers,
                params: queryParams,
                timeout: 8000,
              }
            );
            return {
              storeId: sid,
              data: res.data,
            };
          } catch (err: any) {
            console.error(`Store ${sid} fetch error:`, err?.response?.status || err.message);
            return {
              storeId: sid,
              data: { content: [], totalElements: 0, totalPages: 0, page, size },
            };
          }
        })
      );

      // Ana sayfalama ve toplam bilgisi için ilk geçerli yanıtı referans al
      const refResponse = responses.find((r) => r.data?.content?.length > 0) || responses[0];
      const totalElements = refResponse.data?.totalElements || 0;
      const totalPages = refResponse.data?.totalPages || 1;

      // Ürünleri barkodlarına göre birleştir (Matrix birleştirme)
      const productsMap = new Map<string, any>();

      responses.forEach(({ storeId, data }) => {
        (data.content || []).forEach((item: any) => {
          if (!item.barcode) return;
          if (!productsMap.has(item.barcode)) {
            productsMap.set(item.barcode, {
              id: item.id,
              contentId: item.contentId,
              barcode: item.barcode,
              title: item.title,
              brand: item.brand?.name || null,
              category: item.category?.name || null,
              imageUrl: item.images?.[0]?.url || null,
              stockCode: item.stockCode || null,
              totalStock: 0,
              stocks: {},
            });
          }

          const product = productsMap.get(item.barcode);
          const stockQty = typeof item.quantity === "number" ? item.quantity : null;
          if (stockQty !== null && stockQty > 0) {
            product.totalStock += stockQty;
          }

          product.stocks[storeId] = {
            quantity: stockQty,
            onSale: !!item.onSale,
            sellingPrice: item.sellingPrice || null,
          };
        });
      });

      const mergedContent = Array.from(productsMap.values());

      const responseData = {
        content: mergedContent,
        page,
        size,
        totalElements,
        totalPages,
        catalogTotal: 2171,
        totalStores: 12,
        globalStats: {
          totalProducts: 2171,
          sumTotalStock: 340321,
          critical: 76,
          outOfStock: 579,
        },
      };

      // 15 saniyelik kısa önbellek
      await redis.set(cacheKey, JSON.stringify(responseData), "EX", 15).catch(() => null);

      return NextResponse.json(responseData);
    } catch (error: any) {
      console.error("Stok çekme hatası:", error?.response?.data || error.message);
      return NextResponse.json(
        { error: "Stok bilgileri çekilirken bir hata oluştu." },
        { status: 500 }
      );
    }
  }

  // MOCK DATA (Geliştirme veya API yoksa)
  const mockContent = [
    {
      id: "mock-1",
      barcode: "8690526097893",
      title: "Petito Patim Bol Sütlü Çikolata 18 Gr",
      brand: "Eti",
      category: "Çikolata",
      imageUrl: "https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&auto=format&fit=crop&q=80",
      totalStock: 167,
      stocks: {
        "157108": { quantity: 4, onSale: true, sellingPrice: 15.5 },
        "156829": { quantity: 6, onSale: true, sellingPrice: 15.5 },
        "157111": { quantity: 3, onSale: true, sellingPrice: 15.5 },
        "157109": { quantity: 0, onSale: false, sellingPrice: 15.5 },
        "479042": { quantity: 61, onSale: true, sellingPrice: 15.5 },
        "479045": { quantity: 11, onSale: true, sellingPrice: 15.5 },
        "479048": { quantity: 0, onSale: false, sellingPrice: 15.5 },
        "479052": { quantity: 66, onSale: true, sellingPrice: 15.5 },
        "479054": { quantity: 0, onSale: false, sellingPrice: 15.5 },
        "479061": { quantity: 3, onSale: true, sellingPrice: 15.5 },
        "479063": { quantity: 0, onSale: false, sellingPrice: 15.5 },
        "479064": { quantity: 21, onSale: true, sellingPrice: 15.5 },
      },
    },
    {
      id: "mock-2",
      barcode: "8696056102014",
      title: "Patates Çıtır 1000 Gr",
      brand: "Pek Food",
      category: "Dondurulmuş Sebze",
      imageUrl: "https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?w=400&auto=format&fit=crop&q=80",
      totalStock: 9,
      stocks: {
        "157108": { quantity: 4, onSale: true, sellingPrice: 227.9 },
        "156829": { quantity: 0, onSale: false, sellingPrice: 227.9 },
        "157111": { quantity: 1, onSale: true, sellingPrice: 227.9 },
        "157109": { quantity: 4, onSale: true, sellingPrice: 227.9 },
        "479042": { quantity: null, onSale: false, sellingPrice: null },
        "479045": { quantity: null, onSale: false, sellingPrice: null },
      },
    },
  ];

  return NextResponse.json({
    content: mockContent,
    page: 0,
    size: 25,
    totalElements: mockContent.length,
    totalPages: 1,
    catalogTotal: 2171,
    totalStores: 12,
    globalStats: {
      totalProducts: 2171,
      sumTotalStock: 340321,
      critical: 76,
      outOfStock: 579,
    },
  });
}
