import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    if (body.type === 'order') {
      const { orderNumber, totalPrice, currencyCode, customer, storeId, lines, note } = body;
      
      // Aynı sipariş için birden fazla uygulamanın bildirim atmasını engelle
      if (orderNumber) {
        try {
          // Redis.setnx (Set if Not eXists) kullanarak atomic kontrol yapıyoruz
          const lockKey = `telegram_notified_order_${orderNumber}`;
          const isSet = await redis.setnx(lockKey, "1");
          if (!isSet) {
            // Eğer isSet 0 ise (false), bu sipariş daha önce başka bilgisayar tarafından işlenmiş demektir.
            return NextResponse.json({ success: true, message: "Bildirim zaten gönderildi" });
          }
          // 24 saat sonra kilidi kaldır (Redis hafızası dolmasın)
          await redis.expire(lockKey, 86400);
        } catch (e) {
          console.error("Redis kilidi alınamadı:", e);
        }
      }

      const BRANCHES: Record<string, string> = {
        "479045": "Atakum Gross",
        "479052": "Barış",
        "479048": "Denizevleri",
        "479063": "Duruşehir",
        "479042": "Kanije",
        "479054": "Körfez 2",
        "479061": "Liman",
        "479064": "Nikah",
        "157108": "Limon 1",
        "156829": "Limon 2",
        "157111": "Limon 3",
        "157109": "Limon 5"
      };

      const branchName = storeId && BRANCHES[storeId.toString()] ? BRANCHES[storeId.toString()] : storeId;

      let itemsStr = "";
      if (lines && Array.isArray(lines)) {
        lines.forEach((line: any) => {
          const qty = line.items?.length || 1;
          const name = line.product?.name || "Bilinmeyen Ürün";
          itemsStr += `▪️ ${qty}x ${name}\n`;
        });
      }

      let msg = `🚨 <b>YENİ SİPARİŞ GELDİ!</b>\n\n` +
                  `📦 <b>Sipariş No:</b> ${orderNumber}\n` +
                  `🏪 <b>Şube:</b> ${branchName || "Bilinmiyor"}\n` +
                  `💰 <b>Tutar:</b> ${totalPrice} ${currencyCode}\n` +
                  `👤 <b>Müşteri:</b> ${customer?.firstName || ""} ${customer?.lastName || ""}\n`;
                  
      if (note) {
        msg += `📝 <b>Müşteri Notu:</b> <i>"${note}"</i>\n`;
      }
      
      if (itemsStr) {
        msg += `\n🛒 <b>Ürünler:</b>\n${itemsStr}`;
      }
                  
      const success = await sendTelegramMessage(msg);
      
      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({ success: false, error: "Telegram API failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Telegram API Error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
