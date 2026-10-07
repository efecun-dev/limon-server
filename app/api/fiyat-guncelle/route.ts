import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Güncellenecek ürün (items) bulunamadı." }, { status: 400 });
    }

    if (items.length > 1000) {
      return NextResponse.json({ error: "Ürün Stok Fiyat değişikliği barkod sayısı 1000'den fazla olamaz." }, { status: 400 });
    }

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
    const token = process.env.TRENDYOL_TOKEN;

    if (!supplierId || !agentName || !executorUser || !token) {
      return NextResponse.json({ error: "Trendyol API kimlik bilgileri eksik." }, { status: 500 });
    }

    const headers = {
      Authorization: `Basic ${token}`,
      "x-agentname": agentName,
      "x-executor-user": executorUser,
      "Content-Type": "application/json",
    };

    const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/price-and-inventory`;

    // Trendyol GO Hızlı Market API'ye gönder
    const response = await axios.post(url, { items }, { headers, timeout: 20000 });

    // Başarılı olursa önbelleği (redis) temizleyebiliriz ki fiyatlar güncel gelsin
    // Örneğin, hangi barkodların güncellendiğini bularak
    const barcodes = [...new Set(items.map((item: any) => item.barcode))];
    for (const barcode of barcodes) {
      // Önbellek anahtarlarını bulup silmek için basit bir yöntem olarak tüm stocks önbelleğini temizleyebiliriz
      // veya belirli anahtarları silebiliriz. En güvenlisi keys kullanarak temizlemek (dikkat: çok büyükse yavaşlatabilir) ama biz basitleştirelim:
      try {
        const keys = await redis.keys(`stocks:*${barcode}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (redisErr) {
        console.error("Redis önbellek temizleme hatası:", redisErr);
      }
    }

    return NextResponse.json({
      success: true,
      batchRequestId: response.data?.batchRequestId || null,
      message: "Fiyat güncelleme isteği başarıyla alındı.",
    });
  } catch (error: any) {
    console.error("Fiyat güncelleme hatası:", error?.response?.data || error.message);
    const errorMessage = error?.response?.data?.message || error?.response?.data?.errors?.[0]?.message || "Fiyat güncelleme sırasında bir hata oluştu.";
    return NextResponse.json({ error: errorMessage }, { status: error?.response?.status || 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchRequestId = searchParams.get("batchRequestId");
  if (!batchRequestId) {
    return NextResponse.json({ error: "batchRequestId parametresi gerekli." }, { status: 400 });
  }

  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
  const token = process.env.TRENDYOL_TOKEN;

  if (!supplierId || !agentName || !executorUser || !token) {
    return NextResponse.json({ error: "Trendyol API kimlik bilgileri eksik." }, { status: 500 });
  }

  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName,
    "x-executor-user": executorUser,
  };

  try {
    const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/batch-requests/${batchRequestId}`;
    const response = await axios.get(url, { headers, timeout: 10000 });
    return NextResponse.json(response.data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.response?.data?.message || "Batch durumu sorgulanamadı." },
      { status: error?.response?.status || 500 }
    );
  }
}

