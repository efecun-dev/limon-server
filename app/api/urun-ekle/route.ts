import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

interface TrendyolCategory {
  id: number;
  name: string;
  leaf: boolean;
  parentId?: number | null;
}

interface TrendyolBrand {
  id: number;
  name: string;
}

let memoryCategoriesCache: TrendyolCategory[] | null = null;
let memoryCategoriesCacheTime = 0;

let memoryBrandsCache: TrendyolBrand[] | null = null;
let memoryBrandsCacheTime = 0;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

function normalizeTurkish(text: string): string {
  return (text || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

function cleanForSearch(text: string): string {
  return normalizeTurkish(text)
    .replace(/[-_.,\/&%+^'*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllTrendyolCategories(
  token: string,
  agentName: string,
  executorUser: string
): Promise<TrendyolCategory[]> {
  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName,
    "x-executor-user": executorUser,
  };

  const allCategories: any[] = [];
  let page = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore && page < 10) {
    const url = `https://api.tgoapis.com/integrator/product/grocery/categories?page=${page}&size=${size}`;
    const res = await axios.get(url, { headers, timeout: 12000 });
    const data = Array.isArray(res.data) ? res.data : [];
    if (data.length === 0) {
      hasMore = false;
    } else {
      allCategories.push(...data);
      if (data.length < size) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return allCategories.map((c: any) => ({
    id: Number(c.id),
    name: String(c.name || "").trim(),
    leaf: !!c.leaf,
    parentId: c.parentId != null ? Number(c.parentId) : null,
  }));
}

async function fetchAllTrendyolBrands(
  token: string,
  agentName: string,
  executorUser: string
): Promise<TrendyolBrand[]> {
  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName,
    "x-executor-user": executorUser,
  };

  const promises = [];
  for (let p = 0; p <= 22; p++) {
    promises.push(
      axios
        .get(`https://api.tgoapis.com/integrator/product/grocery/brands?page=${p}&size=1000`, {
          headers,
          timeout: 15000,
        })
        .then((r) => (Array.isArray(r.data) ? r.data : []))
        .catch((err) => {
          console.error(`Trendyol markalar sayfa ${p} hatası:`, err.message);
          return [];
        })
    );
  }

  const results = await Promise.all(promises);
  const flat = results.flat();

  const seen = new Set<number>();
  const unique: TrendyolBrand[] = [];
  for (const b of flat) {
    if (b && b.id != null && !seen.has(b.id)) {
      seen.add(b.id);
      unique.push({
        id: Number(b.id),
        name: String(b.name || "").trim(),
      });
    }
  }

  unique.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return unique;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";

  // 1. ACTION: BARKOD İLE GÖRSEL VE BİLGİ BUL (Açık Veritabanı)
  if (action === "lookup" || (!action && searchParams.has("barcode"))) {
    const rawBarcode = (searchParams.get("barcode") || "").trim();
    const cleanBarcode = rawBarcode.replace(/[^a-zA-Z0-9]/g, "");

    if (!cleanBarcode) {
      return NextResponse.json({ error: "Geçerli bir barkod girilmedi." }, { status: 400 });
    }

    try {
      // 1. ÖNCE TRENDYOL GO KATALOĞUNDA ARA (Resmi Trendyol Verisi & Fotoğrafı)
      const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
      const token = process.env.TRENDYOL_TOKEN;
      const agentName = process.env.TRENDYOL_GO_AGENTNAME;
      const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

      if (supplierId && token && agentName && executorUser) {
        try {
          const tgoRes = await axios.get(
            `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products`,
            {
              headers: {
                Authorization: `Basic ${token}`,
                "x-agentname": agentName,
                "x-executor-user": executorUser,
              },
              params: { barcode: cleanBarcode, size: 5 },
              timeout: 4000,
            }
          );
          const content = tgoRes.data?.content || (Array.isArray(tgoRes.data) ? tgoRes.data : []);
          const match = content.find((p: any) => p.barcode === cleanBarcode);
          if (match) {
            const imgUrl = match.images?.[0]?.url || null;
            return NextResponse.json({
              found: true,
              source: "trendyol",
              sourceLabel: "Trendyol GO Resmi Kataloğu",
              isWhiteBackground: true, // Trendyol CDN görselleri resmi stüdyo ve saf beyaz fondur (#FFFFFF)
              barcode: cleanBarcode,
              title: match.title || "",
              brand: match.brand?.name || "",
              brandId: match.brand?.id || null,
              category: match.category?.name || "",
              categoryId: match.category?.id || null,
              vatRate: match.vatRate ?? 1,
              imageUrl: imgUrl,
            });
          }
        } catch (tgoErr) {
          console.error("Trendyol GO ürün arama hatası:", tgoErr);
        }
      }

      // 2. TRENDYOL'DA YOKSA: Gıda, Kozmetik ve Temizlik Açık Veri Tabanlarında Ara
      const databases = [
        { url: `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, name: "Open Food Facts" },
        { url: `https://world.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`, name: "Open Food Facts" },
        { url: `https://world.openbeautyfacts.org/api/v0/product/${cleanBarcode}.json`, name: "Open Beauty Facts" },
        { url: `https://world.openproductsfacts.org/api/v0/product/${cleanBarcode}.json`, name: "Open Products Facts" },
      ];

      for (const db of databases) {
        const res = await axios.get(db.url, { timeout: 3500 }).catch(() => null);
        if (res?.data?.status === 1 && res.data.product) {
          const p = res.data.product;
          
          // En kaliteli ön yüz stüdyo/paket görselini seç
          let imageUrl =
            p.selected_images?.front?.display?.tr ||
            p.selected_images?.front?.display?.en ||
            p.image_front_url ||
            p.image_url ||
            p.image_front_small_url ||
            null;

          // Eğer 400px thumbnail ise ve full sürümü varsa full'e çevirmeyi dene
          if (imageUrl && imageUrl.includes(".400.jpg")) {
            imageUrl = imageUrl.replace(".400.jpg", ".full.jpg");
          }

          let title = (p.product_name_tr || p.product_name || "").trim();
          title = title.replace(/[?\/&%+^'*_]/g, " ").replace(/\s+/g, " ").slice(0, 100).trim();

          let brand = (p.brands || p.brand_owner || "").split(",")[0]?.trim() || "";
          brand = brand.replace(/[?\/&%+^'*_]/g, " ").replace(/\s+/g, " ").trim();

          if (imageUrl || title) {
            return NextResponse.json({
              found: true,
              source: "open_catalog",
              sourceLabel: `${db.name} Kataloğu`,
              isWhiteBackground: false, // Harici kaynak olduğu için istemci tarafında beyaz fon analizi yapılır
              barcode: cleanBarcode,
              title: title || "",
              brand: brand || "",
              imageUrl: imageUrl || null,
            });
          }
        }
      }

      return NextResponse.json({
        found: false,
        barcode: cleanBarcode,
        message: "Katalogda ve açık veri tabanlarında bu barkoda ait görsel bulunamadı.",
      });
    } catch (err: any) {
      return NextResponse.json({ found: false, error: err.message }, { status: 500 });
    }
  }

  // 2. ACTION: TRENDYOL GO MARKA LİSTESİ & ARAMA (Tüm 20.350+ Marka, Önbellekli ve Hızlı Arama)
  if (action === "brands") {
    const forceRefresh = searchParams.get("refresh") === "true";
    const brandQuery = (searchParams.get("name") || searchParams.get("q") || searchParams.get("search") || "").trim();

    let brands: TrendyolBrand[] | null = null;

    // 1. RAM Önbelleğini Kontrol Et
    if (
      !forceRefresh &&
      memoryBrandsCache &&
      Date.now() - memoryBrandsCacheTime < CACHE_TTL_MS &&
      memoryBrandsCache.length > 5000
    ) {
      brands = memoryBrandsCache;
    }

    // 2. Redis Önbelleğini Kontrol Et
    if (!brands && !forceRefresh) {
      try {
        const cached = await redis.get("tgo:brands");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 5000) {
            brands = parsed;
            memoryBrandsCache = parsed;
            memoryBrandsCacheTime = Date.now();
          }
        }
      } catch (err) {
        // Redis kapalıysa devam et
      }
    }

    // 3. Önbellekte yoksa Trendyol GO API'sinden Tüm Markaları Çek (20.350 adet)
    if (!brands) {
      const token = process.env.TRENDYOL_TOKEN;
      const agentName = process.env.TRENDYOL_GO_AGENTNAME;
      const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

      if (!token || !agentName || !executorUser) {
        return NextResponse.json({ error: "Trendyol GO API kimlik bilgileri eksik." }, { status: 500 });
      }

      try {
        brands = await fetchAllTrendyolBrands(token, agentName, executorUser);

        // RAM ve Redis'e yaz (24 saat)
        memoryBrandsCache = brands;
        memoryBrandsCacheTime = Date.now();
        await redis.set("tgo:brands", JSON.stringify(brands), "EX", 86400).catch(() => null);
      } catch (err: any) {
        console.error("Trendyol GO marka çekme hatası:", err);
        return NextResponse.json(
          { error: "Trendyol markaları çekilemedi: " + (err.message || "") },
          { status: 500 }
        );
      }
    }

    // 4. Eğer Arama Parametresi Varsa Akıllı Filtreleme Yap
    if (brandQuery) {
      const cleanQ = cleanForSearch(brandQuery);
      const isNumeric = /^\d+$/.test(brandQuery);

      const filtered = brands.filter((b) => {
        if (isNumeric && String(b.id).includes(brandQuery)) {
          return true;
        }
        const cleanName = cleanForSearch(b.name);
        return cleanName.includes(cleanQ);
      });

      // Akıllı sıralama: Tam eşleşen en üstte, sonra başlangıcı eşleşen
      filtered.sort((a, b) => {
        if (isNumeric) {
          if (String(a.id) === brandQuery) return -1;
          if (String(b.id) === brandQuery) return 1;
        }
        const aClean = cleanForSearch(a.name);
        const bClean = cleanForSearch(b.name);

        if (aClean === cleanQ && bClean !== cleanQ) return -1;
        if (bClean === cleanQ && aClean !== cleanQ) return 1;

        if (aClean.startsWith(cleanQ) && !bClean.startsWith(cleanQ)) return -1;
        if (bClean.startsWith(cleanQ) && !aClean.startsWith(cleanQ)) return 1;

        return a.name.localeCompare(b.name, "tr");
      });

      return NextResponse.json(filtered.slice(0, 50));
    }

    // Arama yoksa tüm markaları dön (20.350 adet)
    return NextResponse.json(brands);
  }

  // 3. ACTION: TRENDYOL GO KATEGORİ LİSTESİ (Tüm 1300+ Kategori, Önbellekli ve Arama Destekli)
  if (action === "categories") {
    const forceRefresh = searchParams.get("refresh") === "true";
    const searchQuery = (searchParams.get("q") || searchParams.get("search") || "").trim();

    let categories: TrendyolCategory[] | null = null;

    // 1. Önce RAM (In-Memory) Önbelleği Kontrol Et (Hızlı yanıt)
    if (
      !forceRefresh &&
      memoryCategoriesCache &&
      Date.now() - memoryCategoriesCacheTime < CACHE_TTL_MS &&
      memoryCategoriesCache.length > 500
    ) {
      categories = memoryCategoriesCache;
    }

    // 2. RAM'de yoksa Redis'ten Çek (Eski 20 elemanlı hatalı önbelleği es geçmek için > 500 kontrolü)
    if (!categories && !forceRefresh) {
      try {
        const cached = await redis.get("tgo:categories");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 500) {
            categories = parsed;
            memoryCategoriesCache = parsed;
            memoryCategoriesCacheTime = Date.now();
          }
        }
      } catch (err) {
        // Redis kapalıysa veya hata verirse devam et
      }
    }

    // 3. Önbellekte yoksa Trendyol GO API'sinden Tüm Sayfaları Çek (1.314 adet)
    if (!categories) {
      const token = process.env.TRENDYOL_TOKEN;
      const agentName = process.env.TRENDYOL_GO_AGENTNAME;
      const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

      if (!token || !agentName || !executorUser) {
        return NextResponse.json({ error: "Trendyol GO API kimlik bilgileri eksik." }, { status: 500 });
      }

      try {
        categories = await fetchAllTrendyolCategories(token, agentName, executorUser);

        // Hem RAM'e hem Redis'e yaz (24 saat TTL)
        memoryCategoriesCache = categories;
        memoryCategoriesCacheTime = Date.now();
        await redis.set("tgo:categories", JSON.stringify(categories), "EX", 86400).catch(() => null);
      } catch (err: any) {
        console.error("Trendyol GO kategori çekme hatası:", err);
        return NextResponse.json(
          { error: "Trendyol kategorileri çekilemedi: " + (err.message || "") },
          { status: 500 }
        );
      }
    }

    // 4. Eğer Arama Parametresi 'q' veya 'search' Varsa Akıllı Filtreleme Yap
    if (searchQuery) {
      const normQ = normalizeTurkish(searchQuery);
      const isNumeric = /^\d+$/.test(searchQuery);

      const filtered = categories.filter((c) => {
        if (isNumeric && String(c.id).includes(searchQuery)) {
          return true;
        }
        const normName = normalizeTurkish(c.name);
        return normName.includes(normQ);
      });

      // Akıllı sıralama: Tam eşleşen en üstte, sonra başlangıcı eşleşen, sonra leaf olanlar
      filtered.sort((a, b) => {
        if (isNumeric) {
          if (String(a.id) === searchQuery) return -1;
          if (String(b.id) === searchQuery) return 1;
        }
        const aNorm = normalizeTurkish(a.name);
        const bNorm = normalizeTurkish(b.name);
        if (aNorm === normQ && bNorm !== normQ) return -1;
        if (bNorm === normQ && aNorm !== normQ) return 1;
        if (aNorm.startsWith(normQ) && !bNorm.startsWith(normQ)) return -1;
        if (bNorm.startsWith(normQ) && !aNorm.startsWith(normQ)) return 1;
        if (a.leaf && !b.leaf) return -1;
        if (!a.leaf && b.leaf) return 1;
        return a.name.localeCompare(b.name, "tr");
      });

      return NextResponse.json(filtered.slice(0, 50));
    }

    // Arama yoksa tüm kategorileri dön (1314 kategori)
    return NextResponse.json(categories);
  }

  // 4. ACTION: BATCH REQUEST STATUS
  if (action === "batch" || searchParams.has("batchRequestId")) {
    const batchRequestId = searchParams.get("batchRequestId");
    if (!batchRequestId) {
      return NextResponse.json({ error: "batchRequestId gerekli" }, { status: 400 });
    }

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const token = process.env.TRENDYOL_TOKEN;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

    try {
      const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/batch-requests/${batchRequestId}`;
      const res = await axios.get(url, {
        headers: {
          Authorization: `Basic ${token}`,
          "x-agentname": agentName,
          "x-executor-user": executorUser,
        },
        timeout: 8000,
      });

      const data = res.data;
      const statusUpper = (data?.status || "").toUpperCase();
      const firstItem = data?.items?.[0];
      const itemStatus = (firstItem?.status || "").toUpperCase();
      const hasFailedItem = (data?.failedItemCount != null && data?.failedItemCount > 0) || itemStatus === "FAILED";

      let resolvedStatus: "PENDING" | "COMPLETED" | "FAILED" = "PENDING";
      let resolvedMessage = "";

      if (hasFailedItem) {
        resolvedStatus = "FAILED";
        const reasons = firstItem?.failureReasons || firstItem?.errors || data?.errors;
        resolvedMessage = Array.isArray(reasons) ? reasons.join(", ") : String(reasons || "Trendyol ürünü reddetti.");
      } else if (
        itemStatus === "SUCCESS" ||
        ((statusUpper === "COMPLETED" || statusUpper === "FINISHED" || statusUpper === "SUCCESS") &&
          data?.failedItemCount === 0)
      ) {
        resolvedStatus = "COMPLETED";
        resolvedMessage = "Ürün Trendyol GO sistemine başarıyla eklendi ve tüm şubelere tanımlandı.";
      } else if (statusUpper === "FAILED" || statusUpper === "ERROR") {
        resolvedStatus = "FAILED";
        const reasons = data?.errors || firstItem?.failureReasons;
        resolvedMessage = Array.isArray(reasons)
          ? reasons.join(", ")
          : String(reasons || data?.message || "Trendyol aktarım sırasında hata bildirdi.");
      } else {
        resolvedStatus = "PENDING";
        resolvedMessage = "Trendyol sistemi ürünü işliyor (IN_PROGRESS)...";
      }

      return NextResponse.json({
        ...data,
        resolvedStatus,
        resolvedMessage,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.response?.data?.message || err?.response?.data || "Durum sorgulanamadı." },
        { status: err?.response?.status || 500 }
      );
    }
  }

  // 5. ACTION: TRENDYOL GO KATALOĞUNDA CANLI DOĞRULAMA (12 Şube)
  if (action === "verify" || searchParams.has("verifyBarcode")) {
    const barcode = (searchParams.get("barcode") || searchParams.get("verifyBarcode") || "")
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "");
    if (!barcode) {
      return NextResponse.json({ exists: false, error: "Barkod gerekli" }, { status: 400 });
    }

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const token = process.env.TRENDYOL_TOKEN;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

    try {
      const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products?barcode=${barcode}`;
      const res = await axios.get(url, {
        headers: {
          Authorization: `Basic ${token}`,
          "x-agentname": agentName,
          "x-executor-user": executorUser,
        },
        timeout: 8000,
      });

      const content = res.data?.content || (Array.isArray(res.data) ? res.data : []);
      const matches = content.filter((p: any) => p.barcode === barcode);

      if (matches.length > 0) {
        const first = matches[0];
        return NextResponse.json({
          exists: true,
          storeCount: matches.length,
          product: {
            barcode: first.barcode,
            title: first.title,
            brand: first.brand?.name || "",
            category: first.category?.name || "",
            vatRate: first.vatRate,
            imageUrl: first.images?.[0]?.url || null,
            onSale: first.onSale,
            approved: first.approved,
          },
          message: `Ürün Trendyol GO kataloğunda onaylandı ve aktif! (${matches.length} şubede mevcut)`,
        });
      }

      return NextResponse.json({
        exists: false,
        message: "Ürün henüz Trendyol GO şube kataloğunda görünmüyor veya işleniyor.",
      });
    } catch (err: any) {
      return NextResponse.json({ exists: false, error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Geçersiz action." }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: "Eklenecek ürün bulunamadı." }, { status: 400 });
    }

    // Trendyol GO doğrulamaları
    for (const item of items) {
      if (!item.barcode || !item.barcode.trim()) {
        return NextResponse.json({ error: "Ürün barkodu zorunludur." }, { status: 400 });
      }
      if (!item.title || !item.title.trim()) {
        return NextResponse.json({ error: "Ürün ismi zorunludur." }, { status: 400 });
      }
      if (!item.brandId || typeof item.brandId !== "number") {
        return NextResponse.json({ error: `"${item.title}" için geçerli bir marka seçilmelidir.` }, { status: 400 });
      }
      if (!item.categoryId || typeof item.categoryId !== "number") {
        return NextResponse.json({ error: `"${item.title}" için geçerli bir kategori seçilmelidir.` }, { status: 400 });
      }
      if (typeof item.vatRate !== "number") {
        return NextResponse.json({ error: `"${item.title}" için KDV oranı (0, 1, 10, 20) zorunludur.` }, { status: 400 });
      }

      // Karakter kuralları
      item.barcode = item.barcode.replace(/[?\/&%+^'*_ ]/g, "").slice(0, 40);
      item.title = item.title.replace(/[?\/&%+^'*_]/g, " ").replace(/\s+/g, " ").slice(0, 100).trim();
    }

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const token = process.env.TRENDYOL_TOKEN;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

    if (!supplierId || !token || !agentName || !executorUser) {
      return NextResponse.json({ error: "Trendyol GO API kimlik bilgileri eksik." }, { status: 500 });
    }

    const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products`;

    const response = await axios.post(
      url,
      { items },
      {
        headers: {
          Authorization: `Basic ${token}`,
          "x-agentname": agentName,
          "x-executor-user": executorUser,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    return NextResponse.json({
      success: true,
      batchRequestId: response.data?.batchRequestId || null,
      message: "Ürün aktarım talebi Trendyol GO sistemine iletildi.",
    });
  } catch (error: any) {
    console.error("Ürün ekleme hatası:", error?.response?.data || error.message);
    const errMsg =
      error?.response?.data?.errors?.[0]?.message ||
      error?.response?.data?.message ||
      "Ürün aktarımı sırasında bir hata oluştu.";
    return NextResponse.json({ error: errMsg }, { status: error?.response?.status || 500 });
  }
}
