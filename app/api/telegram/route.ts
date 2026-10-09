import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { getTelegramNotifier } from "@/lib/telegram-notifier";
import { corsHeaders } from "@/lib/cors";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const notifier = getTelegramNotifier();

    // 1. Yeni Sipariş Bildirimi
    if (body.type === "order") {
      const success = await notifier.sendNewOrderNotification(body);
      return NextResponse.json({ success }, { headers: corsHeaders });
    }

    // 2. İptal Sipariş Bildirimi
    if (body.type === "cancel") {
      const success = await notifier.sendCancelledOrderNotification(body);
      return NextResponse.json({ success }, { headers: corsHeaders });
    }

    // 3. Müşteri Yorumu Bildirimi
    if (body.type === "review") {
      const success = await notifier.sendReviewNotification(body.review || body, body.branchName || "Şube");
      return NextResponse.json({ success }, { headers: corsHeaders });
    }

    // 4. İade Talebi Bildirimi
    if (body.type === "claim") {
      const success = await notifier.sendClaimNotification(body.claim || body);
      return NextResponse.json({ success }, { headers: corsHeaders });
    }

    // 5. Doğrudan Özel Metin Gönderme
    if (body.text || body.message) {
      const text = body.text || body.message;
      const success = await sendTelegramMessage(text);
      return NextResponse.json({ success }, { headers: corsHeaders });
    }

    return NextResponse.json(
      { success: false, error: "Geçersiz istek tipi (type: order | cancel | review | claim | text)" },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Telegram API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
