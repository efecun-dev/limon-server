import { NextRequest, NextResponse } from "next/server";
import { getApiLogs, clearApiLogs } from "@/lib/logger";
import { withCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const method = searchParams.get("method") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const search = searchParams.get("search") || "";

    const allLogs = getApiLogs({ limit: 500 });
    const filteredLogs = getApiLogs({ limit, method, status, search });

    // Calculate live telemetry statistics
    const totalRequests = allLogs.length;
    const success2xx = allLogs.filter((l) => l.status >= 200 && l.status < 300).length;
    const error4xx = allLogs.filter((l) => l.status >= 400 && l.status < 500).length;
    const error5xx = allLogs.filter((l) => l.status >= 500).length;
    const totalDuration = allLogs.reduce((acc, l) => acc + l.durationMs, 0);
    const avgDuration = totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0;

    // Unique IPs
    const uniqueIps = Array.from(new Set(allLogs.map((l) => l.ip))).length;

    return withCors(
      NextResponse.json({
        success: true,
        logs: filteredLogs,
        total: filteredLogs.length,
        stats: {
          totalRequests,
          success2xx,
          error4xx,
          error5xx,
          avgDuration,
          uniqueIps,
        },
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Loglar alınamadı.", error: error.message },
        { status: 500 }
      )
    );
  }
}

export async function DELETE() {
  try {
    clearApiLogs();
    return withCors(
      NextResponse.json({
        success: true,
        message: "Tüm API günlükleri başarıyla temizlendi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Loglar temizlenemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}
