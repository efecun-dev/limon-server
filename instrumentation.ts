export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Sunucu başlatılıyor, Telegram bildirim motoru devreye alınıyor...");
    const { startTelegramNotifier } = await import("@/lib/telegram-notifier");
    startTelegramNotifier();
  }
}
