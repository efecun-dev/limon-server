import { NextResponse } from "next/server";
import {
  normalizeSaleOffPayload,
  normalizeSaleOnPayload,
  executeTrendyolSaleOff,
  executeTrendyolSaleOn,
} from "@/lib/sale-service";
import { queryBatchRequestStatus } from "@/lib/price-service";

export const dynamic = "force-dynamic";

/**
 * POST or PUT /api/sale-status
 * Body: { action: "sale-off" | "sale-on" | "ARCHIVE" | "UNARCHIVE", items: [...], ... }
 */
export async function POST(request: Request) {
  return handleSaleStatus(request);
}

export async function PUT(request: Request) {
  return handleSaleStatus(request);
}

async function handleSaleStatus(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON gövdesi." },
        { status: 400 }
      );
    }

    const action = String(body.action || "").toLowerCase();
    const isSaleOff = action === "sale-off" || action === "archive" || action === "delete" || body.onSale === false;
    const isSaleOn = action === "sale-on" || action === "unarchive" || body.onSale === true;

    if (!isSaleOff && !isSaleOn) {
      return NextResponse.json(
        { success: false, error: "Geçersiz action: 'sale-off' veya 'sale-on' belirtilmelidir." },
        { status: 400 }
      );
    }

    if (isSaleOff) {
      const items = normalizeSaleOffPayload(body);
      if (items.length === 0) {
        return NextResponse.json(
          { success: false, error: "Satıştan kaldırılacak ürün bulunamadı." },
          { status: 400 }
        );
      }
      const result = await executeTrendyolSaleOff(items);
      return NextResponse.json(result);
    } else {
      const items = normalizeSaleOnPayload(body);
      if (items.length === 0) {
        return NextResponse.json(
          { success: false, error: "Satışa açılacak ürün bulunamadı." },
          { status: 400 }
        );
      }
      const result = await executeTrendyolSaleOn(items);
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error("[SaleStatus] Hata oluştu:", error?.response?.data || error.message);
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.errors?.[0]?.message ||
      error.message ||
      "İşlem sırasında beklenmeyen bir hata oluştu.";

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
    return NextResponse.json(
      {
        success: false,
        error: error?.response?.data?.message || "Batch durumu sorgulanamadı.",
      },
      { status: error?.response?.status || 500 }
    );
  }
}
