import axios from "axios";
import { BRANCHES } from "@/lib/branches";
import { redis } from "@/lib/redis";

export interface PriceUpdateItem {
  barcode: string;
  storeId: string | number;
  salePrice: number;
  sellingPrice: number;
  listPrice: number;
  quantity?: number;
}

export interface StoreUpdateDetail {
  storeId: string;
  storeName: string;
  updatedCount: number;
  status: "COMPLETED" | "SUBMITTED" | "FAILED";
}

export interface PriceUpdateResult {
  success: boolean;
  batchRequestId: string | null;
  batchRequestIds: string[];
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  message: string;
  details: StoreUpdateDetail[];
  error?: string;
}

/**
 * Gelen isteği (Format A veya Format B) standart bir PriceUpdateItem dizisine dönüştürür.
 */
export function normalizePriceUpdatePayload(body: any): {
  normalizedItems: PriceUpdateItem[];
  uniqueBarcodes: string[];
  storesInvolved: StoreUpdateDetail[];
} {
  const allStoreIds = Object.keys(BRANCHES);
  const rawList: any[] = [];

  // 1. Doğrudan Dizi Formatı: [ { barcode, sellingPrice, ... } ]
  if (Array.isArray(body)) {
    rawList.push(...body);
  }
  // 2. Format A (Mevcut Satır Bazlı Dizi): { items: [ ... ] }
  else if (body?.items && Array.isArray(body.items)) {
    rawList.push(...body.items);
  }
  // 3. Format B (Marka / Toplu Eşitleme Kolaylık Formatı): { barcodes: [...], targetPrice: 65.00, storeIds: [...] }
  else if (body?.barcodes || body?.barcode) {
    const barcodes: string[] = Array.isArray(body.barcodes)
      ? body.barcodes.map((b: any) => String(b).trim()).filter(Boolean)
      : [String(body.barcode).trim()].filter(Boolean);

    const price = Number(body.targetPrice ?? body.sellingPrice ?? body.salePrice ?? body.price);
    const listPrice = Number(body.listPrice ?? price);

    let storeIds: string[] = [];
    if (Array.isArray(body.storeIds) && body.storeIds.length > 0 && !body.storeIds.includes("all")) {
      storeIds = body.storeIds.map((s: any) => String(s).trim());
    } else if (body.storeId && body.storeId !== "all") {
      storeIds = [String(body.storeId).trim()];
    } else {
      storeIds = allStoreIds; // 12 şubenin tamamı
    }

    const qty = typeof body.quantity === "number" && body.quantity >= 0 ? body.quantity : undefined;

    barcodes.forEach((barcode) => {
      storeIds.forEach((sid) => {
        rawList.push({
          barcode,
          storeId: sid,
          salePrice: price,
          sellingPrice: price,
          listPrice: Math.max(listPrice, price),
          quantity: qty,
        });
      });
    });
  }
  // 4. Tek Ürün Objesi Formatı: { barcode: "...", sellingPrice: 65, storeId?: 157108 }
  else if (body?.barcode && (body?.sellingPrice !== undefined || body?.salePrice !== undefined || body?.targetPrice !== undefined)) {
    const barcode = String(body.barcode).trim();
    const price = Number(body.targetPrice ?? body.sellingPrice ?? body.salePrice ?? body.price);
    const listPrice = Number(body.listPrice ?? price);
    const qty = typeof body.quantity === "number" && body.quantity >= 0 ? body.quantity : undefined;
    const storeId = body.storeId !== undefined && body.storeId !== null ? String(body.storeId).trim() : "all";

    if (storeId === "all" || !storeId) {
      allStoreIds.forEach((sid) => {
        rawList.push({ barcode, storeId: sid, salePrice: price, sellingPrice: price, listPrice, quantity: qty });
      });
    } else {
      rawList.push({ barcode, storeId, salePrice: price, sellingPrice: price, listPrice, quantity: qty });
    }
  }

  // Öğeleri temizle, doğrula ve standartlaştır
  const normalizedItems: PriceUpdateItem[] = [];

  for (const item of rawList) {
    if (!item || !item.barcode) continue;
    const barcode = String(item.barcode).trim();
    if (!barcode) continue;

    const salePrice = Number(item.salePrice ?? item.sellingPrice ?? item.targetPrice ?? item.price);
    if (isNaN(salePrice) || salePrice <= 0) continue;

    // Trendyol kuralı: listPrice, salePrice'dan küçük olamaz
    const listPrice = Math.max(Number(item.listPrice ?? salePrice), salePrice);
    const qty = typeof item.quantity === "number" && item.quantity >= 0 ? item.quantity : undefined;

    const rawStoreId = item.storeId !== undefined && item.storeId !== null ? String(item.storeId).trim() : "all";

    if (rawStoreId === "all" || !rawStoreId) {
      // Şube belirtilmemişse veya "all" ise 12 şubenin tamamına uygula
      allStoreIds.forEach((sid) => {
        normalizedItems.push({
          barcode,
          storeId: Number(sid) || sid,
          salePrice,
          sellingPrice: salePrice,
          listPrice,
          ...(qty !== undefined ? { quantity: qty } : {}),
        });
      });
    } else {
      normalizedItems.push({
        barcode,
        storeId: Number(rawStoreId) || rawStoreId,
        salePrice,
        sellingPrice: salePrice,
        listPrice,
        ...(qty !== undefined ? { quantity: qty } : {}),
      });
    }
  }

  const uniqueBarcodes = [...new Set(normalizedItems.map((i) => i.barcode))];

  // Şube bazlı istatistik ve detay tablosu
  const storeCountMap = new Map<string, number>();
  normalizedItems.forEach((i) => {
    const sid = String(i.storeId);
    storeCountMap.set(sid, (storeCountMap.get(sid) || 0) + 1);
  });

  const storesInvolved: StoreUpdateDetail[] = Array.from(storeCountMap.entries()).map(([sid, count]) => ({
    storeId: sid,
    storeName: BRANCHES[sid] || `Şube ${sid}`,
    updatedCount: count,
    status: "COMPLETED",
  }));

  return { normalizedItems, uniqueBarcodes, storesInvolved };
}

/**
 * Normalleştirilmiş ürünleri Trendyol GO API'sine gönderir, rate-limit retry yapar ve Redis önbelleğini temizler.
 */
export async function executeTrendyolPriceUpdate(
  normalizedItems: PriceUpdateItem[],
  storesInvolved: StoreUpdateDetail[]
): Promise<PriceUpdateResult> {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
  const token = process.env.TRENDYOL_TOKEN;

  if (!supplierId || !agentName || !executorUser || !token) {
    throw new Error("Trendyol API kimlik bilgileri eksik (TRENDYOL_GO_SUPPLIER_ID / TRENDYOL_TOKEN).");
  }

  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName || "Ofis",
    "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
    "Content-Type": "application/json",
  };

  const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/price-and-inventory`;

  // Trendyol'a gönderilecek payload formatına hazırla
  const apiPayloadItems = normalizedItems.map((item) => ({
    barcode: item.barcode,
    storeId: item.storeId,
    salePrice: item.salePrice,
    sellingPrice: item.salePrice,
    listPrice: item.listPrice,
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
  }));

  // Trendyol API sınırını aşmamak ve timeout'ları önlemek için 200'lük paketler halinde gönder
  const chunkSize = 200;
  const batchRequestIds: string[] = [];

  for (let i = 0; i < apiPayloadItems.length; i += chunkSize) {
    const chunk = apiPayloadItems.slice(i, i + chunkSize);
    let attempts = 0;
    let success = false;
    let lastError: any = null;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await axios.post(url, { items: chunk }, { headers, timeout: 25000 });
        const batchId = response.data?.batchRequestId;
        if (batchId) {
          batchRequestIds.push(batchId);
        }
        success = true;
      } catch (err: any) {
        lastError = err;
        // 429 Too Many Requests durumunda exponential backoff
        if (err?.response?.status === 429 && attempts < 3) {
          const delay = attempts * 750;
          console.warn(`[PriceService] Trendyol 429 Rate Limit alındı. ${delay}ms bekleniyor (Deneme: ${attempts})...`);
          await new Promise((res) => setTimeout(res, delay));
        } else {
          break;
        }
      }
    }

    if (!success) {
      const errMsg =
        lastError?.response?.data?.message ||
        lastError?.response?.data?.errors?.[0]?.message ||
        lastError.message ||
        "Trendyol API isteği başarısız oldu.";
      console.error(`[PriceService] Paket gönderim hatası (indeks ${i}):`, errMsg);
      throw new Error(`Trendyol GO Fiyat Güncelleme Hatası: ${errMsg}`);
    }
  }

  // Önbellek (Redis) Geçersiz Kılma
  try {
    const barcodes = [...new Set(normalizedItems.map((item) => item.barcode))];
    // 1. Genel stok özet önbelleklerini temizle
    const generalKeys = await redis.keys(`stocks:all:*`).catch(() => []);
    const supplierKeys = await redis.keys(`stocks:${supplierId}:*`).catch(() => []);
    const keysToDelete = new Set<string>([...generalKeys, ...supplierKeys]);

    // 2. Güncellenen barkodların önbelleklerini temizle
    for (const barcode of barcodes) {
      const barcodeKeys = await redis.keys(`stocks:*${barcode}*`).catch(() => []);
      barcodeKeys.forEach((k) => keysToDelete.add(k));
    }

    if (keysToDelete.size > 0) {
      await redis.del(...Array.from(keysToDelete)).catch(() => null);
      console.log(`[PriceService] ${keysToDelete.size} adet Redis önbellek anahtarı temizlendi.`);
    }
  } catch (redisErr) {
    console.error("[PriceService] Redis önbellek temizleme uyarısı:", redisErr);
  }

  const primaryBatchRequestId = batchRequestIds[0] || null;

  return {
    success: true,
    batchRequestId: primaryBatchRequestId,
    batchRequestIds,
    totalProcessed: normalizedItems.length,
    successCount: normalizedItems.length,
    failedCount: 0,
    message: `${normalizedItems.length} ürün/şube için fiyat güncelleme isteği Trendyol'a iletildi.`,
    details: storesInvolved,
  };
}

/**
 * Trendyol GO Batch Request durumunu sorgular.
 */
export async function queryBatchRequestStatus(batchRequestId: string) {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
  const token = process.env.TRENDYOL_TOKEN;

  if (!supplierId || !agentName || !executorUser || !token) {
    throw new Error("Trendyol API kimlik bilgileri eksik.");
  }

  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName || "Ofis",
    "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
  };

  const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/batch-requests/${batchRequestId}`;
  const response = await axios.get(url, { headers, timeout: 12000 });
  return response.data;
}
