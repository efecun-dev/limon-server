import { NextResponse } from "next/server";
import { FinansService } from "@/lib/finans-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = Date.now();
    const defaultStart = now - 30 * 24 * 60 * 60 * 1000;

    const startDate = searchParams.get("startDate") ? parseInt(searchParams.get("startDate")!, 10) : defaultStart;
    const endDate = searchParams.get("endDate") ? parseInt(searchParams.get("endDate")!, 10) : now;
    const refresh = searchParams.get("refresh") === "true";

    const summary = await FinansService.getFinancialSummary(startDate, endDate, refresh);

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (error: any) {
    console.error("[Finans API] Summary Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Finansal özet alınamadı." },
      { status: 500 }
    );
  }
}
