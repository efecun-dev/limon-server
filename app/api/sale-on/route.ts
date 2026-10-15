import { NextResponse } from "next/server";
import {
  normalizeSaleOnPayload,
  executeTrendyolSaleOn,
} from "@/lib/sale-service";
import { queryBatchRequestStatus } from "@/lib/price-service";

export const dynamic = "force-dynamic";

/**
 * PUT or POST /api/sale-on
 * Body: { items: [ { barcode, storeId?: 123 } ] }
 * or:   { products: [...], storeIds: [...] }
 */
export async function PUT(request: Request) {
  return handleSaleOn(request);
}

export async function POST(request: Request) {
  return handleSaleOn(request);
}

async function handleSaleOn(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON gövdesi." },
        { status: 400 }
      );
    }

    const items = normalizeSaleOnPayload(body);

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Satışa açılacak geçerli ürün veya barkod bulunamadı." },
        { status: 400 }
      );
    }

    console.log(`[SaleOn] İstek alındı: ${items.length} kayıt satışa açılıyor (sale-on).`);

    const result = await executeTrendyolSaleOn(items);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[SaleOn] Hata oluştu:", error?.response?.data || error.message);
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.errors?.[0]?.message ||
      error.message ||
      "Satışa açma işlemi sırasında beklenmeyen bir hata oluştu.";

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
 * GET /api/sale-on?batchRequestId=...
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
    console.error("[SaleOn] Batch sorgu hatası:", error?.response?.data || error.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.response?.data?.message || "Batch durumu sorgulanamadı.",
      },
      { status: error?.response?.status || 500 }
    );
  }
}
