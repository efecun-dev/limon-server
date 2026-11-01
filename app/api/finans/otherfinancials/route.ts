import { NextResponse } from "next/server";
import { FinansService, OTHER_TRANSACTION_TYPES, OtherType } from "@/lib/finans-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = Date.now();
    const startDate = searchParams.get("startDate") ? parseInt(searchParams.get("startDate")!, 10) : now - 14 * 24 * 60 * 60 * 1000;
    const endDate = searchParams.get("endDate") ? parseInt(searchParams.get("endDate")!, 10) : now;
    const type = (searchParams.get("transactionType") || "PaymentOrder") as OtherType;
    const domain = (searchParams.get("domain") || "grocery") as "grocery" | "meal";

    if (!OTHER_TRANSACTION_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Geçersiz transactionType. Desteklenenler: ${OTHER_TRANSACTION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const records = await FinansService.fetchOtherFinancialsForType(type, startDate, endDate, domain);

    return NextResponse.json({
      success: true,
      transactionType: type,
      count: records.length,
      records,
    });
  } catch (error: any) {
    console.error("[Finans API] OtherFinancials Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Otherfinancials alınamadı." },
      { status: 500 }
    );
  }
}
