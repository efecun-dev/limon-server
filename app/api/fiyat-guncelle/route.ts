import { NextResponse } from "next/server";
import {
  normalizePriceUpdatePayload,
  executeTrendyolPriceUpdate,
  queryBatchRequestStatus,
} from "@/lib/price-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/fiyat-guncelle
 * Desteklenen Formatlar:
 * Format A: { items: [ { barcode, sellingPrice, quantity?, storeId? } ] } veya doğrudan dizi [ { ... } ]
 * Format B: { barcodes: [...], targetPrice: 65.00, storeIds?: [...] } (storeIds boşsa 12 şubenin tamamı)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: "Geçersiz JSON gövdesi." },
        { status: 400 }
      );
    }

    // 1. İstek yükünü standartlaştır (Format A ve Format B ayrıştırma)
    const { normalizedItems, storesInvolved, uniqueBarcodes } = normalizePriceUpdatePayload(body);

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Güncellenecek geçerli ürün veya fiyat bulunamadı. Lütfen barkod ve satış fiyatını kontrol edin.",
        },
        { status: 400 }
      );
    }

    if (normalizedItems.length > 2500) {
      return NextResponse.json(
        {
          success: false,
          error: "Tek seferde en fazla 2500 adet ürün/şube fiyat güncellemesi yapılabilir.",
        },
        { status: 400 }
      );
    }

    console.log(
      `[FiyatGuncelle] İstek alındı: ${uniqueBarcodes.length} farklı barkod, ${storesInvolved.length} şube, toplam ${normalizedItems.length} kayıt.`
    );

    // 2. Trendyol GO API'ye gönder (Chunking, Rate Limit Retry & Cache Invalidation)
    const result = await executeTrendyolPriceUpdate(normalizedItems, storesInvolved);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[FiyatGuncelle] Hata oluştu:", error?.response?.data || error.message);
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.errors?.[0]?.message ||
      error.message ||
      "Fiyat güncelleme sırasında beklenmeyen bir hata oluştu.";

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
 * GET /api/fiyat-guncelle?batchRequestId=...
 * Trendyol GO Batch Request durumunu sorgular.
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
    console.error("[FiyatGuncelle] Batch sorgu hatası:", error?.response?.data || error.message);
    return NextResponse.json(
      {
        success: false,
        error: error?.response?.data?.message || "Batch durumu sorgulanamadı.",
      },
      { status: error?.response?.status || 500 }
    );
  }
}
