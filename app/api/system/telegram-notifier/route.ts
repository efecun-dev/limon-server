import { NextResponse } from "next/server";
import { getTelegramNotifier } from "@/lib/telegram-notifier";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notifier = getTelegramNotifier();
    const status = notifier.getStatus();
    return NextResponse.json({ success: true, ...status }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const notifier = getTelegramNotifier();
    const { action, config } = body;

    if (action === "test") {
      const result = await notifier.sendTestNotification();
      return NextResponse.json(
        { success: result, message: result ? "Test bildirimi gönderildi" : "Mesaj gönderilemedi" },
        { headers: corsHeaders }
      );
    }

    if (action === "start") {
      await notifier.start();
      return NextResponse.json(
        { success: true, message: "Bildirim motoru başlatıldı" },
        { headers: corsHeaders }
      );
    }

    if (action === "stop") {
      notifier.stop();
      return NextResponse.json(
        { success: true, message: "Bildirim motoru durduruldu" },
        { headers: corsHeaders }
      );
    }

    if (action === "config" && config) {
      const updated = notifier.updateConfig(config);
      return NextResponse.json(
        { success: true, config: updated, message: "Ayarlar güncellendi" },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: false, error: "Geçersiz aksiyon. (test | start | stop | config)" },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
