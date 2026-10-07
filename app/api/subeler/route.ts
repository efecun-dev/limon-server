import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";

export interface DeliveryHour {
  dayOfWeek: string;
  openingTime: string;
  closingTime: string;
  deliveryType: string;
}

export interface StoreItem {
  id: number;
  status: "ACTIVE" | "PASSIVE" | string;
  name: string;
  shortName?: string;
  workingStatus: "OPEN" | "CLOSED" | string;
  sellerWorkingStatus?: "OPEN" | "CLOSED" | string;
  deliveryHours?: DeliveryHour[];
  averageDeliveryInterval?: string;
  minDeliveryTimeInMin?: number;
  maxDeliveryTimeInMin?: number;
  sellerId?: number;
  sellerName?: string;
  sellerType?: string;
  sellerSubType?: string;
  deliveryType?: string;
  scheduleType?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
  const token = process.env.TRENDYOL_TOKEN;

  if (!supplierId || !agentName || !executorUser || !token) {
    return NextResponse.json(
      { error: "Trendyol Go API kimlik bilgileri eksik." },
      { status: 500 }
    );
  }

  const cacheKey = `tg:stores:${supplierId}`;

  try {
    if (!refresh) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    }

    const storesRes = await axios.get(
      `https://api.tgoapis.com/integrator/store/grocery/suppliers/${supplierId}/stores`,
      {
        headers: {
          Authorization: `Basic ${token}`,
          "x-agentname": agentName,
          "x-executor-user": executorUser,
        },
        timeout: 10000,
      }
    );

    const rawItems: any[] = storesRes.data?.data?.items || [];

    // Şubeleri zenginleştir
    const enrichedStores: StoreItem[] = rawItems.map((store) => {
      const idStr = String(store.id);
      const shortName = BRANCHES[idStr] || store.name;

      return {
        id: store.id,
        status: store.status,
        name: store.name,
        shortName,
        workingStatus: store.workingStatus,
        sellerWorkingStatus: store.sellerWorkingStatus,
        deliveryHours: store.deliveryHours,
        averageDeliveryInterval: store.averageDeliveryInterval,
        minDeliveryTimeInMin: store.minDeliveryTimeInMin,
        maxDeliveryTimeInMin: store.maxDeliveryTimeInMin,
        sellerId: store.sellerId,
        sellerName: store.sellerName,
        deliveryType: store.deliveryType,
        scheduleType: store.scheduleType,
      };
    });

    // Sıralama
    const branchIdsOrder = Object.keys(BRANCHES);
    enrichedStores.sort((a, b) => {
      const idxA = branchIdsOrder.indexOf(String(a.id));
      const idxB = branchIdsOrder.indexOf(String(b.id));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.id - b.id;
    });

    const result = {
      stores: enrichedStores,
      totalCount: enrichedStores.length,
      openCount: enrichedStores.filter((s) => s.workingStatus === "OPEN").length,
      closedCount: enrichedStores.filter((s) => s.workingStatus !== "OPEN").length,
      updatedAt: new Date().toISOString(),
    };

    // 45 saniye redis cache
    await redis.set(cacheKey, JSON.stringify(result), "EX", 45).catch(() => null);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Şube bilgileri çekilirken hata:", err?.response?.data || err.message);
    return NextResponse.json(
      {
        error: "Şube bilgileri Trendyol Go API'den alınamadı.",
        details: err?.response?.data || err.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
  const token = process.env.TRENDYOL_TOKEN;

  if (!supplierId || !agentName || !executorUser || !token) {
    return NextResponse.json(
      { error: "Trendyol Go API kimlik bilgileri eksik." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { storeId, workingStatus } = body;

    if (!storeId || !["OPEN", "CLOSED"].includes(workingStatus)) {
      return NextResponse.json(
        { error: "Geçersiz parametreler. storeId ve workingStatus ('OPEN' | 'CLOSED') zorunludur." },
        { status: 400 }
      );
    }

    const response = await axios.put(
      `https://api.tgoapis.com/integrator/store/grocery/suppliers/${supplierId}/stores/${storeId}/working-status`,
      { workingStatus },
      {
        headers: {
          Authorization: `Basic ${token}`,
          "x-agentname": agentName,
          "x-executor-user": executorUser,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const cacheKey = `tg:stores:${supplierId}`;
    await redis.del(cacheKey).catch(() => null);

    return NextResponse.json({
      success: true,
      storeId,
      workingStatus,
      message: `Şube durumu başarıyla ${workingStatus === "OPEN" ? "AÇIK" : "KAPALI"} olarak güncellendi.`,
      data: response.data,
    });
  } catch (err: any) {
    console.error("Şube güncelleme hatası:", err?.response?.data || err.message);
    return NextResponse.json(
      {
        error: "İşlem gerçekleştirilemedi.",
        details: err?.response?.data || err.message,
      },
      { status: 500 }
    );
  }
}
