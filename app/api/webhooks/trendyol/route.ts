import { NextResponse } from "next/server";
import { OrderStorage } from "@/lib/order-storage";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Trendyol Go Resmi Webhook Alıcı Servisi
 * Dökümantasyon: Sipariş Entegrasyonu - Webhook Entegrasyonu
 * Desteklenen Statüler: Created, Cancelled, Delivered, UnSupplied
 * Teknik Kural: Yalnızca 2xx HTTP status kodu beklenir, idempotent işleme (id + packageStatus).
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (!payload || (!payload.id && !payload.orderNumber)) {
      return NextResponse.json({ error: "Geçersiz payload" }, { status: 400 });
    }

    const pkgId = String(payload.id || payload.orderNumber);
    const status = String(payload.packageStatus || payload.status || "Created");

    // 1. Supabase PostgreSQL'e idempotent upsert
    await OrderStorage.upsertPackages([payload], "trendyol_webhook");

    // 2. Redis önbelleklerini temizle (İstemciler anında en güncel veriyi görsün)
    try {
      await Promise.all([
        redis.del("orders_full_35days"),
        redis.del("orders_full_90days"),
        redis.del("ciro_matrix_server_current"),
        redis.del("orders_today_cache"),
      ]);

      const sellerId = payload.sellerId || process.env.TRENDYOL_GO_SUPPLIER_ID;
      if (sellerId) {
        const keys = await redis.keys(`orders:${sellerId}:*`);
        if (keys && keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (redisErr: any) {
      console.warn("[Webhook] Redis önbellek temizleme uyarısı:", redisErr.message);
    }

    console.log(`[Trendyol Webhook] Paket başarıyla işlendi ve kaydedildi: ${pkgId} (${status})`);

    return NextResponse.json(
      {
        status: "SUCCESS",
        id: pkgId,
        packageStatus: status,
        receivedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Trendyol Webhook] İşleme hatası:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ACTIVE",
    endpoint: "/api/webhooks/trendyol",
    description: "Trendyol GO Resmi Webhook Alıcısı (Created, Cancelled, Delivered, UnSupplied)",
    idempotent: true,
    timestamp: new Date().toISOString(),
  });
}

