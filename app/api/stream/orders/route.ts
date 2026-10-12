import { NextRequest } from "next/server";
import { getEventBroadcaster } from "@/lib/event-broadcaster";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId") || "all";
  const clientId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const broadcaster = getEventBroadcaster();
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "Local Client";

  const stream = new ReadableStream({
    start(controller) {
      broadcaster.registerClient({
        id: clientId,
        storeId,
        ip: clientIp,
        userAgent,
        connectedAt: Date.now(),
        controller,
      });

      // İstemci bağlantıyı kapattığında (sayfa yenileme, çıkış vb.) temizle
      req.signal.addEventListener("abort", () => {
        broadcaster.removeClient(clientId);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      broadcaster.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders,
    },
  });
}
