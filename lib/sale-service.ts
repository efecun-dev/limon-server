import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";
import { queryBatchRequestStatus } from "@/lib/price-service";

export type SaleOffReason = "ARCHIVED" | "UNSUPPLIED" | "SEASONAL_PRODUCT" | "SELLER_CLOSED";

export const VALID_SALE_OFF_REASONS: SaleOffReason[] = [
  "ARCHIVED",
  "UNSUPPLIED",
  "SEASONAL_PRODUCT",
  "SELLER_CLOSED",
];

export interface SaleOffItem {
  barcode: string;
  saleOffReason: SaleOffReason;
  storeId?: number;
}

export interface SaleOnItem {
  barcode: string;
  storeId?: number;
}

export interface SaleOperationResult {
  success: boolean;
  action: "sale-off" | "sale-on";
  batchRequestId: string | null;
  batchRequestIds: string[];
  totalProcessed: number;
  itemCount: number;
  uniqueBarcodes: string[];
  message: string;
  error?: string;
  details?: any;
}

/**
 * Normalizes any payload format for sale-off
 */
export function normalizeSaleOffPayload(body: any): SaleOffItem[] {
  const result: SaleOffItem[] = [];
  const defaultReason: SaleOffReason = "ARCHIVED";

  const cleanReason = (r?: any): SaleOffReason => {
    const upper = String(r || "").trim().toUpperCase();
    if (VALID_SALE_OFF_REASONS.includes(upper as SaleOffReason)) {
      return upper as SaleOffReason;
    }
    return defaultReason;
  };

  if (Array.isArray(body)) {
    for (const item of body) {
      if (!item) continue;
      const barcode = String(item.barcode || "").trim();
      if (!barcode) continue;
      const reason = cleanReason(item.saleOffReason || item.reason);
      const storeId =
        item.storeId !== undefined && item.storeId !== null && item.storeId !== "all"
          ? Number(item.storeId)
          : undefined;
      result.push({ barcode, saleOffReason: reason, ...(storeId ? { storeId } : {}) });
    }
    return result;
  }

  if (Array.isArray(body?.items)) {
    for (const item of body.items) {
      if (!item) continue;
      const barcode = String(item.barcode || "").trim();
      if (!barcode) continue;
      const reason = cleanReason(item.saleOffReason || item.reason || body?.saleOffReason || body?.reason);
      const storeId =
        item.storeId !== undefined && item.storeId !== null && item.storeId !== "all"
          ? Number(item.storeId)
          : undefined;
      result.push({ barcode, saleOffReason: reason, ...(storeId ? { storeId } : {}) });
    }
    return result;
  }

  if (Array.isArray(body?.products)) {
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : [];
    const reason = cleanReason(body.saleOffReason || body.reason);

    body.products.forEach((prod: any) => {
      const barcode = String(prod.barcode || "").trim();
      if (!barcode) return;

      if (storeIds.length === 0 || body.targetStoreSelection === "ALL" || body.storeSelection === "ALL") {
        result.push({ barcode, saleOffReason: reason });
      } else {
        storeIds.forEach((sId: any) => {
          result.push({ barcode, saleOffReason: reason, storeId: Number(sId) });
        });
      }
    });
    return result;
  }

  if (Array.isArray(body?.barcodes)) {
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : body.storeId ? [body.storeId] : [];
    const reason = cleanReason(body.saleOffReason || body.reason);

    body.barcodes.forEach((b: any) => {
      const barcode = String(b || "").trim();
      if (!barcode) return;
      if (storeIds.length === 0) {
        result.push({ barcode, saleOffReason: reason });
      } else {
        storeIds.forEach((sId: any) => {
          result.push({ barcode, saleOffReason: reason, storeId: Number(sId) });
        });
      }
    });
    return result;
  }

  if (body?.barcode) {
    const barcode = String(body.barcode).trim();
    const reason = cleanReason(body.saleOffReason || body.reason);
    const storeId =
      body.storeId !== undefined && body.storeId !== null && body.storeId !== "all"
        ? Number(body.storeId)
        : undefined;
    return [{ barcode, saleOffReason: reason, ...(storeId ? { storeId } : {}) }];
  }

  return result;
}

/**
 * Normalizes any payload format for sale-on
 */
export function normalizeSaleOnPayload(body: any): SaleOnItem[] {
  const result: SaleOnItem[] = [];

  if (Array.isArray(body)) {
    for (const item of body) {
      if (!item) continue;
      const barcode = String(item.barcode || "").trim();
      if (!barcode) continue;
      const storeId =
        item.storeId !== undefined && item.storeId !== null && item.storeId !== "all"
          ? Number(item.storeId)
          : undefined;
      result.push({ barcode, ...(storeId ? { storeId } : {}) });
    }
    return result;
  }

  if (Array.isArray(body?.items)) {
    for (const item of body.items) {
      if (!item) continue;
      const barcode = String(item.barcode || "").trim();
      if (!barcode) continue;
      const storeId =
        item.storeId !== undefined && item.storeId !== null && item.storeId !== "all"
          ? Number(item.storeId)
          : undefined;
      result.push({ barcode, ...(storeId ? { storeId } : {}) });
    }
    return result;
  }

  if (Array.isArray(body?.products)) {
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : [];
    body.products.forEach((prod: any) => {
      const barcode = String(prod.barcode || "").trim();
      if (!barcode) return;

      if (storeIds.length === 0 || body.targetStoreSelection === "ALL" || body.storeSelection === "ALL") {
        result.push({ barcode });
      } else {
        storeIds.forEach((sId: any) => {
          result.push({ barcode, storeId: Number(sId) });
        });
      }
    });
    return result;
  }

  if (Array.isArray(body?.barcodes)) {
    const storeIds = Array.isArray(body.storeIds) ? body.storeIds : body.storeId ? [body.storeId] : [];
    body.barcodes.forEach((b: any) => {
      const barcode = String(b || "").trim();
      if (!barcode) return;
      if (storeIds.length === 0) {
        result.push({ barcode });
      } else {
        storeIds.forEach((sId: any) => {
          result.push({ barcode, storeId: Number(sId) });
        });
      }
    });
    return result;
  }

  if (body?.barcode) {
    const barcode = String(body.barcode).trim();
    const storeId =
      body.storeId !== undefined && body.storeId !== null && body.storeId !== "all"
        ? Number(body.storeId)
        : undefined;
    return [{ barcode, ...(storeId ? { storeId } : {}) }];
  }

  return result;
}

/**
 * Executes Trendyol GO sale-off PUT request
 */
export async function executeTrendyolSaleOff(items: SaleOffItem[]): Promise<SaleOperationResult> {
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

  const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/sale-off`;

  const chunkSize = 200;
  const batchRequestIds: string[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    let attempts = 0;
    let success = false;
    let lastError: any = null;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await axios.put(url, { items: chunk }, { headers, timeout: 25000 });
        const batchId = response.data?.batchRequestId;
        if (batchId) {
          batchRequestIds.push(batchId);
        }
        success = true;
      } catch (err: any) {
        lastError = err;
        if (err?.response?.status === 429 && attempts < 3) {
          const delay = attempts * 750;
          console.warn(`[SaleService] Trendyol 429 Rate Limit. ${delay}ms bekleniyor...`);
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
        "Trendyol sale-off API isteği başarısız oldu.";
      console.error(`[SaleService] Paket gönderim hatası (sale-off indeks ${i}):`, errMsg);
      throw new Error(`Trendyol GO Satıştan Kaldırma Hatası: ${errMsg}`);
    }
  }

  const uniqueBarcodes = [...new Set(items.map((i) => i.barcode))];
  await invalidateProductCache(uniqueBarcodes, supplierId);

  return {
    success: true,
    action: "sale-off",
    batchRequestId: batchRequestIds[0] || null,
    batchRequestIds,
    totalProcessed: items.length,
    itemCount: items.length,
    uniqueBarcodes,
    message: `${uniqueBarcodes.length} ürün için satıştan kaldırma (sale-off) isteği Trendyol'a iletildi.`,
  };
}

/**
 * Executes Trendyol GO sale-on PUT request
 */
export async function executeTrendyolSaleOn(items: SaleOnItem[]): Promise<SaleOperationResult> {
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

  const url = `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/products/sale-on`;

  const chunkSize = 200;
  const batchRequestIds: string[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    let attempts = 0;
    let success = false;
    let lastError: any = null;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await axios.put(url, { items: chunk }, { headers, timeout: 25000 });
        const batchId = response.data?.batchRequestId;
        if (batchId) {
          batchRequestIds.push(batchId);
        }
        success = true;
      } catch (err: any) {
        lastError = err;
        if (err?.response?.status === 429 && attempts < 3) {
          const delay = attempts * 750;
          console.warn(`[SaleService] Trendyol 429 Rate Limit. ${delay}ms bekleniyor...`);
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
        "Trendyol sale-on API isteği başarısız oldu.";
      console.error(`[SaleService] Paket gönderim hatası (sale-on indeks ${i}):`, errMsg);
      throw new Error(`Trendyol GO Satışa Açma Hatası: ${errMsg}`);
    }
  }

  const uniqueBarcodes = [...new Set(items.map((i) => i.barcode))];
  await invalidateProductCache(uniqueBarcodes, supplierId);

  return {
    success: true,
    action: "sale-on",
    batchRequestId: batchRequestIds[0] || null,
    batchRequestIds,
    totalProcessed: items.length,
    itemCount: items.length,
    uniqueBarcodes,
    message: `${uniqueBarcodes.length} ürün için satışa açma (sale-on) isteği Trendyol'a iletildi.`,
  };
}

async function invalidateProductCache(barcodes: string[], supplierId: string) {
  try {
    const generalKeys = await redis.keys(`stocks:all:*`).catch(() => []);
    const supplierKeys = await redis.keys(`stocks:${supplierId}:*`).catch(() => []);
    const keysToDelete = new Set<string>([...generalKeys, ...supplierKeys]);

    for (const barcode of barcodes) {
      const barcodeKeys = await redis.keys(`stocks:*${barcode}*`).catch(() => []);
      barcodeKeys.forEach((k) => keysToDelete.add(k));
    }

    if (keysToDelete.size > 0) {
      await redis.del(...Array.from(keysToDelete)).catch(() => null);
      console.log(`[SaleService] ${keysToDelete.size} adet Redis önbellek anahtarı temizlendi.`);
    }
  } catch (redisErr) {
    console.error("[SaleService] Redis önbellek temizleme uyarısı:", redisErr);
  }
}
