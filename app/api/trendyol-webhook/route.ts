import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    // 1. Basic Auth Doğrulaması
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
    const [username, password] = credentials.split(":");

    const expectedUsername = process.env.WEBHOOK_USERNAME || "trendyol";
    const expectedPassword = process.env.WEBHOOK_PASSWORD || "limon_webhook_2026";

    if (username !== expectedUsername || password !== expectedPassword) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Webhook Verisini Okuma
    const body = await req.json();

    if (!body || !body.id || !body.packageStatus) {
      // Geçersiz payload olsa bile 200 dönmemiz Trendyol dokümanına göre daha sağlıklı olabilir
      // Ancak logluyoruz.
      console.warn("Geçersiz webhook payload alındı:", body);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const { id, packageStatus, orderNumber, sellerId, storeId } = body;

    // 3. Idempotency (Tekrarlayan İstekleri Engelleme)
    const idempotencyKey = `webhook_processed:${id}:${packageStatus}`;
    const isProcessed = await redis.get(idempotencyKey);

    if (isProcessed) {
      console.log(`[Webhook] Duplicate request ignored: ${idempotencyKey}`);
      return NextResponse.json({ success: true, message: "Already processed" }, { status: 200 });
    }

    // 24 saat boyunca işlenmiş olarak işaretle
    await redis.set(idempotencyKey, "1", "EX", 86400);

    // 4. Aksiyonlar (Cache Temizleme ve Telegram Bildirimi)
    
    // a. Frontend'in sipariş listesini hızlıca yenilemesi için Cache temizle
    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    if (supplierId) {
      await redis.del(`orders:${supplierId}`);
      if (orderNumber) {
        await redis.del(`orders:${supplierId}:${orderNumber}`);
      }
    }

    // b. Önemli durumlarda Telegram Bildirimi
    if (packageStatus === "Created") {
      const msg = `🚨 <b>YENİ SİPARİŞ (GO)</b>\n\n` +
                  `📦 Sipariş No: <b>${orderNumber}</b>\n` +
                  `🏪 Mağaza ID: ${storeId}\n` +
                  `💰 Tutar: ${body.totalPrice} ${body.currencyCode}\n` +
                  `👤 Müşteri: ${body.customer?.firstName} ${body.customer?.lastName}`;
      await sendTelegramMessage(msg);
    } else if (packageStatus === "Cancelled" || packageStatus === "UnSupplied") {
       const msg = `❌ <b>SİPARİŞ İPTAL EDİLDİ</b>\n\n` +
                   `📦 Sipariş No: <b>${orderNumber}</b>\n` +
                   `⚠️ Durum: ${packageStatus}`;
       await sendTelegramMessage(msg);
    }

    console.log(`[Webhook] Başarıyla işlendi: Sipariş ${orderNumber}, Durum: ${packageStatus}`);
    
    // Trendyol bizden daima 200 OK bekler.
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("Webhook işleme hatası:", error);
    // Hata olsa bile 500 dönersek Trendyol retry yapar. Geçici hatalar için 500 iyidir.
    // Ancak kod hatasıysa sürekli 500 dönüp DLQ'ye (Dead Letter Queue) düşer.
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
