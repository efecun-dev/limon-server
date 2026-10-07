import { NextResponse } from "next/server";
import { fetchDynamicLevelData } from "@/lib/level-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period"); // örn: "Kasım 2026", "Ekim 2026", "Eylül 2026"
  const refresh = searchParams.get("refresh") === "true";

  try {
    const data = await fetchDynamicLevelData(refresh);

    let stores = data.stores;
    if (period) {
      stores = stores.filter((s) => s.commissionPeriod === period);
    }

    return NextResponse.json({
      marketPeriods: data.marketPeriods,
      stores,
      thresholds: data.thresholds,
      commissionMatrix: data.commissionMatrix,
      lastSyncedAt: data.lastSyncedAt,
      isLive: data.isLive,
      message: data.message,
    });
  } catch (err: any) {
    console.error("API /api/seviyeler hata:", err);
    return NextResponse.json(
      {
        error: "Seviye ve komisyon verileri alınamadı.",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
