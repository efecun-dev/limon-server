import { NextResponse } from "next/server";
import {
  normalizeSaleOffPayload,
  executeTrendyolSaleOff,
} from "@/lib/sale-service";
import { queryBatchRequestStatus } from "@/lib/price-service";

export const dynamic = "force-dynamic";

/**
 * PUT or POST /api/sale-off
 * Body: { items: [ { barcode, saleOffReason?: "ARCHIVED", storeId?: 123 } ] }
 * or:   { products: [...], storeIds: [...], reason?: "ARCHIVED" }
 */
export async function PUT(request: Request) {
  return handleSaleOff(request);
}

export async function POST(request: Request) {
  return handleSaleOff(request);
}

async function handleSaleOff(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON gövdesi." },
        { status: 400 }
      );
    }

    const items = normalizeSaleOffPayload(body);

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Satıştan kaldırılacak geçerli ürün veya barkod bulunamadı." },
        { status: 400 }
      );
    }

    console.log(`[SaleOff] İstek alındı: ${items.length} kayıt satıştan kaldırılıyor (sale-off).`);

    const result = await executeTrendyolSaleOff(items);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[SaleOff] Hata oluştu:", error?.response?.data || error.message);
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.errors?.[0]?.message ||
      error.message ||
      "Satıştan kaldırma işlemi sırasında beklenmeyen bir hata oluştu.";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error?.response?.data || null,
      },
      { status: error?.response?.status || 500 }
    );
  }
}

/**
 * GET /api/sale-off?batchRequestId=...
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchRequestId = searchParams.get("batchRequestId");

  if (!batchRequestId) {
    return NextResponse.json(
      { success: false, error: "batchRequestId parametresi gereklidir." },
      { status: 400 }
    );
  }

  try {
    const data = await queryBatchRequestStatus(batchRequestId);
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("[SaleOff] Batch sorgu hatası:", error?.response?.data || error.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.response?.data?.message || "Batch durumu sorgulanamadı.",
      },
      { status: error?.response?.status || 500 }
    );
  }
}
