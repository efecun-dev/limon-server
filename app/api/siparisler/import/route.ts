import { NextRequest, NextResponse } from "next/server";
import { OrderStorage } from "@/lib/order-storage";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? body : [];

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "İçe aktarılacak sipariş satırı bulunamadı." }, { status: 400 });
    }

    console.log(`[Import] ${rows.length} adet geçmiş sipariş Supabase'e kaydediliyor...`);
    const result = await OrderStorage.importExcelRows(rows);

    // Sipariş önbelleklerini temizle ki panelde hemen görünsün
    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    if (supplierId) {
      await redis.del(`orders:${supplierId}`).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `${result.imported} yeni sipariş eklendi, ${result.updated} sipariş güncellendi.${result.errors > 0 ? ` (${result.errors} satırda hata oluştu)` : ""}`,
      stats: result,
    });
  } catch (err: any) {
    console.error("[Import] Hata:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

