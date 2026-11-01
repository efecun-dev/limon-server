import { NextResponse } from "next/server";
import { FinansService, SETTLEMENT_TRANSACTION_TYPES, SettlementType } from "@/lib/finans-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = Date.now();
    const startDate = searchParams.get("startDate") ? parseInt(searchParams.get("startDate")!, 10) : now - 14 * 24 * 60 * 60 * 1000;
    const endDate = searchParams.get("endDate") ? parseInt(searchParams.get("endDate")!, 10) : now;
    const type = (searchParams.get("transactionType") || "Sale") as SettlementType;
    const domain = (searchParams.get("domain") || "grocery") as "grocery" | "meal";

    if (!SETTLEMENT_TRANSACTION_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Geçersiz transactionType. Desteklenenler: ${SETTLEMENT_TRANSACTION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const records = await FinansService.fetchSettlementsForType(type, startDate, endDate, domain);

    return NextResponse.json({
      success: true,
      transactionType: type,
      count: records.length,
      records,
    });
  } catch (error: any) {
    console.error("[Finans API] Settlements Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Settlements alınamadı." },
      { status: 500 }
    );
  }
}
