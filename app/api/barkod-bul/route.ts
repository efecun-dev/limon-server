import { NextResponse } from "next/server";
import axios from "axios";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawBarcode = (searchParams.get("barcode") || "").trim();

  // Barkod temizleme: Sadece alfanumerik / rakam karakterleri al
  const cleanBarcode = rawBarcode.replace(/[^a-zA-Z0-9]/g, "");

  if (!cleanBarcode) {
    return NextResponse.json({ error: "Geçerli bir barkod belirtilmedi." }, { status: 400 });
  }

  try {
    // 1. Open Food Facts API Sorgusu (Gıda, Temizlik, İçecek vb. Market Ürünleri)
    const offUrl = `https://world.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`;
    const offRes = await axios.get(offUrl, { timeout: 6000 }).catch(() => null);

    if (offRes?.data?.status === 1 && offRes.data.product) {
      const p = offRes.data.product;
      
      // En iyi fotoğrafı seç
      const imageUrl =
        p.image_front_url ||
        p.image_url ||
        p.image_front_small_url ||
        p.selected_images?.front?.display?.tr ||
        p.selected_images?.front?.display?.en ||
        null;

      // Temiz ürün başlığı (Trendyol kurallarına göre özel karakterleri ayıkla)
      let title = (p.product_name_tr || p.product_name || "").trim();
      title = title.replace(/[?\/&%+^'*_]/g, " ").replace(/\s+/g, " ").slice(0, 100).trim();

      // Marka
      let brand = (p.brands || p.brand_owner || "").split(",")[0]?.trim() || "";
      brand = brand.replace(/[?\/&%+^'*_]/g, " ").replace(/\s+/g, " ").trim();

      // Kategori
      const category = (p.categories_tags?.[0] || p.categories || "").split(",")[0]?.replace(/^en:/, "") || "";

      return NextResponse.json({
        found: true,
        source: "openfoodfacts",
        barcode: cleanBarcode,
        title: title || null,
        brand: brand || null,
        category: category || null,
        imageUrl: imageUrl,
        raw: {
          quantity: p.quantity || null,
          packaging: p.packaging || null,
        },
      });
    }

    return NextResponse.json({
      found: false,
      barcode: cleanBarcode,
      message: "Bu barkoda ait ürün fotoğrafı ve bilgisi açık veri tabanında bulunamadı.",
    });
  } catch (error: any) {
    console.error("Barkod sorgulama hatası:", error.message);
    return NextResponse.json(
      { found: false, barcode: cleanBarcode, error: "Görsel arama servisine bağlanılamadı." },
      { status: 500 }
    );
  }
}
