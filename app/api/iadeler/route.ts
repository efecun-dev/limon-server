import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { prisma as db } from "@/lib/prisma";
import { OrderStorage } from "@/lib/order-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("claimItemStatus") || "";
  const refresh = searchParams.get("refresh") === "true";

  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  if (supplierId && agentName && executorUser) {
    try {
      const cacheKey = `claims:${supplierId}:${statusFilter}`;
      
      if (!refresh) {
        const cachedData = await redis.get(cacheKey).catch(() => null);
        if (cachedData) {
          return NextResponse.json(JSON.parse(cachedData));
        }
      } else {
        await redis.del(cacheKey).catch(() => null);
      }

      // Tüm sayfaları çek
      let allContent: any[] = [];
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        const response = await axios.get(
          `https://api.tgoapis.com/integrator/claim/grocery/suppliers/${supplierId}/claims`,
          {
            headers: {
              "Authorization": `Basic ${process.env.TRENDYOL_TOKEN}`,
              "x-agentname": agentName,
              "x-executor-user": executorUser,
            },
            params: {
              claimItemStatus: statusFilter || undefined,
              size: 200,
              page: page,
            }
          }
        );

        if (response.data?.content) {
          allContent = allContent.concat(response.data.content);
        }
        totalPages = response.data?.totalPages || 1;
        page++;
      }

      // Her iade için bağlı olduğu paketi önce veritabanından, gerekirse Trendyol'dan bul
      const uniqueOrderNumbers = Array.from(new Set(allContent.map((c: any) => c.orderNumber).filter(Boolean)));
      const uniquePackageIds = Array.from(new Set(allContent.map((c: any) => String(c.orderShipmentPackageId)).filter(Boolean)));

      const orderPackageMap: Record<string, any> = {};

      try {
        const dbRecords = await db.order.findMany({
          where: {
            OR: [
              { orderNumber: { in: uniqueOrderNumbers } },
              { id: { in: uniquePackageIds } }
            ]
          }
        });
        for (const rec of dbRecords) {
          const pkg = OrderStorage.orderRecordToPackage(rec);
          if (pkg.orderNumber) orderPackageMap[pkg.orderNumber] = pkg;
          if (pkg.id) orderPackageMap[String(pkg.id)] = pkg;
        }
      } catch (dbErr: any) {
        console.warn("[Claims] DB lookup hatası:", dbErr.message);
      }

      // Veritabanında henüz bulunamayan siparişler için Trendyol API fallback
      const missingOrders = allContent.filter((c: any) => !orderPackageMap[c.orderNumber] && !orderPackageMap[String(c.orderShipmentPackageId)]);
      if (missingOrders.length > 0) {
        await Promise.all(
          missingOrders.slice(0, 10).map(async (c: any) => {
            const rawDate = c.orderDate || c.claimDate || Date.now();
            const orderDateMs = typeof rawDate === "number" ? rawDate : new Date(rawDate).getTime();
            try {
              const res = await axios.get(
                `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
                {
                  headers: {
                    "Authorization": `Basic ${process.env.TRENDYOL_TOKEN}`,
                    "x-agentname": agentName,
                    "x-executor-user": executorUser,
                  },
                  params: {
                    startDate: orderDateMs - 86400000,
                    endDate: orderDateMs + 86400000,
                    size: 50,
                  },
                }
              );
              const pkg = res.data?.content?.find((p: any) => p.orderNumber === c.orderNumber || p.id === c.orderShipmentPackageId);
              if (pkg) {
                orderPackageMap[c.orderNumber] = pkg;
                if (pkg.id) orderPackageMap[String(pkg.id)] = pkg;
                // Veritabanına kaydet (Arka planda)
                OrderStorage.upsertPackages([pkg]).catch(() => null);
              }
            } catch {}
          })
        );
      }

      for (const c of allContent) {
        const pkg = orderPackageMap[c.orderNumber] || orderPackageMap[String(c.orderShipmentPackageId)];
        c.storeId = pkg?.storeId || c.storeId || null;
        c.orderDetails = pkg || c.orderDetails || null;
      }

      const responseData = {
        content: allContent,
        totalElements: allContent.length,
      };
      
      // 180 saniyelik (3 dakika) önbellek
      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 180).catch(() => null);
      
      return NextResponse.json(responseData);
    } catch (error: any) {
      console.error("Trendyol İade Çekme Hatası:", error?.response?.data || error.message);
      return NextResponse.json(
        { error: "Gerçek iadeler çekilirken bir hata oluştu." }, 
        { status: 500 }
      );
    }
  }

  // MOCK DATA (Eğer env.local ayarlı değilse)
  let mockData = {
    "totalElements": 1,
    "totalPages": 1,
    "page": 0,
    "size": 1,
    "content": [
        {
            "id": "4f6ff075-3c84-48e9-bca8-836d7b1c7c0c",
            "orderNumber": "2048400330",
            "customerFirstName": "OMS",
            "customerLastName": "GROCERY",
            "orderShipmentPackageId": 1000000183132,
            "claimItems": [
                {
                    "id": "6699cbc2-cc85-4a22-bb4f-75a5dc1c1dea",
                    "orderLineItemId": 1000000438183,
                    "note": "",
                    "customerNote": "oczsmgypjyjp",
                    "claimItemStatus": {
                        "name": "Created"
                    },
                    "customerClaimItemReason": {
                        "id": 3000,
                        "name": "SKT - Geçmiş Ürün Teslimatı",
                        "code": "EXPIRATION_DATE"
                    },
                    "trendyolClaimItemReason": {
                        "id": 3000,
                        "name": "SKT - Geçmiş Ürün Teslimatı",
                        "code": "EXPIRATION_DATE"
                    },
                    "resolved": false,
                    "imageUrls": [
                        "https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&w=400&q=80",
                    ],
                    "lastActionDate": 1764077368124,
                    "objections": []
                }
            ],
            "claimDate": 1673727792442,
            "orderDate": 1673646351661,
            "storeId": 479045,
            "returnedSeller": true,
            "objectionableClaim": true
        }
    ]
  };

  // Basit filtreleme mock veride de çalışsın
  if (statusFilter) {
    mockData.content = mockData.content.map(claim => {
      const filteredItems = claim.claimItems.filter(item => item.claimItemStatus.name === statusFilter);
      return { ...claim, claimItems: filteredItems };
    }).filter(claim => claim.claimItems.length > 0);
  }

  return NextResponse.json(mockData);
}
