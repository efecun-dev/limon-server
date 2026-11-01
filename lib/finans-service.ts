import axios from "axios";
import { redis } from "@/lib/redis";

const FIFTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000; // 14 günlük güvenli dilimler (Trendyol maks 15 gün sınırı)

export const SETTLEMENT_TRANSACTION_TYPES = [
  "Sale",
  "Return",
  "Discount",
  "DiscountCancel",
  "Coupon",
  "CouponCancel",
  "ProvisionPositive",
  "ProvisionNegative",
  "ManualRefund",
  "ManualRefundCancel",
  "DeliveryFee",
  "DeliveryFeeCancel",
] as const;

export const OTHER_TRANSACTION_TYPES = [
  "Stoppage",
  "CashAdvance",
  "WireTransfer",
  "IncomingTransfer",
  "ReturnInvoice",
  "CommissionAgreementInvoice",
  "PaymentOrder",
  "DeductionInvoices",
] as const;

export type SettlementType = (typeof SETTLEMENT_TRANSACTION_TYPES)[number];
export type OtherType = (typeof OTHER_TRANSACTION_TYPES)[number];

// Single-flight in-flight request cache
const inFlightRequests = new Map<string, Promise<any>>();

function getChunks(startDate: number, endDate: number): Array<{ start: number; end: number }> {
  const chunks: Array<{ start: number; end: number }> = [];
  let curStart = startDate;

  while (curStart < endDate) {
    const curEnd = Math.min(curStart + FIFTEEN_DAYS_MS, endDate);
    chunks.push({ start: curStart, end: curEnd });
    curStart = curEnd + 1;
  }

  return chunks;
}

export class FinansService {
  private static getHeaders() {
    return {
      Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
      "x-agentname": process.env.TRENDYOL_GO_AGENTNAME || "",
      "x-executor-user": process.env.TRENDYOL_GO_EXECUTOR_USER || "",
    };
  }

  private static getSupplierId() {
    return process.env.TRENDYOL_GO_SUPPLIER_ID || "";
  }

  /**
   * Trendyol Settlements API'sinden belirli bir işlem tipini 15 günlük aralıklarla ve sayfalamayla çeker.
   */
  static async fetchSettlementsForType(
    transactionType: SettlementType,
    startDate: number,
    endDate: number,
    domain: "grocery" | "meal" = "grocery"
  ): Promise<any[]> {
    const supplierId = this.getSupplierId();
    if (!supplierId || !process.env.TRENDYOL_TOKEN) {
      return [];
    }

    const chunks = getChunks(startDate, endDate);
    const allRecords: any[] = [];
    const seenIds = new Set<string>();

    for (const chunk of chunks) {
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        try {
          const url = `https://api.tgoapis.com/integrator/settlement/${domain}/sellers/${supplierId}/settlements`;
          const res = await axios.get(url, {
            headers: this.getHeaders(),
            params: {
              transactionType,
              startDate: chunk.start,
              endDate: chunk.end,
              page,
              size: 500,
            },
            timeout: 15000,
          });

          const data = res.data;
          const items = Array.isArray(data) ? data : data?.content || data?.elements || [];
          totalPages = typeof data?.totalPages === "number" ? data.totalPages : 1;

          for (const item of items) {
            const key = item.id || `${item.transactionDate}_${item.orderNumber}_${item.debt}_${item.credit}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              allRecords.push(item);
            }
          }

          page++;
        } catch (err: any) {
          console.warn(`[FinansService] Settlements ${transactionType} chunk (${chunk.start}-${chunk.end}) sayfa ${page} hatası:`, err.message);
          break;
        }
      }
    }

    return allRecords;
  }

  /**
   * Trendyol Otherfinancials API'sinden belirli bir işlem tipini 15 günlük dilimlerle çeker.
   */
  static async fetchOtherFinancialsForType(
    transactionType: OtherType,
    startDate: number,
    endDate: number,
    domain: "grocery" | "meal" = "grocery"
  ): Promise<any[]> {
    const supplierId = this.getSupplierId();
    if (!supplierId || !process.env.TRENDYOL_TOKEN) {
      return [];
    }

    const chunks = getChunks(startDate, endDate);
    const allRecords: any[] = [];
    const seenIds = new Set<string>();

    for (const chunk of chunks) {
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        try {
          const url = `https://api.tgoapis.com/integrator/settlement/${domain}/sellers/${supplierId}/otherfinancials`;
          const res = await axios.get(url, {
            headers: this.getHeaders(),
            params: {
              transactionType,
              startDate: chunk.start,
              endDate: chunk.end,
              page,
              size: 500,
            },
            timeout: 15000,
          });

          const data = res.data;
          const items = Array.isArray(data) ? data : data?.content || data?.elements || [];
          totalPages = typeof data?.totalPages === "number" ? data.totalPages : 1;

          for (const item of items) {
            const key = item.id || `${item.transactionDate}_${item.receiptId}_${item.debt}_${item.credit}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              allRecords.push(item);
            }
          }

          page++;
        } catch (err: any) {
          console.warn(`[FinansService] Otherfinancials ${transactionType} chunk sayfa ${page} hatası:`, err.message);
          break;
        }
      }
    }

    return allRecords;
  }

  /**
   * Tüm Finansal Kayıtları Çeker, Önbellekler ve Rapor Özetini Hesaplar (Single-Flight & Coalescing Destekli)
   */
  static async getFinancialSummary(startDate: number, endDate: number, refresh = false) {
    const supplierId = this.getSupplierId();
    const cacheKey = `finans_summary:${supplierId}:${startDate}:${endDate}`;

    // 1. Önbellek Kontrolü (Değişmeyen geçmiş dönemler için uzun TTL)
    if (!refresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {}
    }

    // 2. Single-Flight Coalescing (Aynı anda gelen isteklerin mükerrer hesaplama yapmasını engeller)
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)!;
    }

    const workPromise = (async () => {
      try {
        // Settlements kayıtlarını çek
        const settlementResults: Record<string, any[]> = {};
        for (const type of SETTLEMENT_TRANSACTION_TYPES) {
          settlementResults[type] = await this.fetchSettlementsForType(type, startDate, endDate);
        }

        // Otherfinancials kayıtlarını çek
        const otherResults: Record<string, any[]> = {};
        for (const type of OTHER_TRANSACTION_TYPES) {
          otherResults[type] = await this.fetchOtherFinancialsForType(type, startDate, endDate);
        }

        // --- HESAPLAMA MOTORU (Trendyol Resmi Kılavuz Mantığı) ---
        let totalSales = 0;
        let totalReturns = 0;
        let totalDiscounts = 0;
        let totalDiscountCancels = 0;
        let totalCoupons = 0;
        let totalCouponCancels = 0;
        let totalProvisionPositive = 0;
        let totalProvisionNegative = 0;
        let totalManualRefunds = 0;
        let totalDeliveryFees = 0;
        let totalDeliveryFeeCancels = 0;
        let totalCommission = 0;
        let totalSellerRevenue = 0;

        const allTransactions: any[] = [];

        // Settlements İşleme
        for (const [type, items] of Object.entries(settlementResults)) {
          for (const item of items) {
            const amount = Number(item.credit || item.debt || item.amount || 0);
            const comm = Math.abs(Number(item.commissionAmount || 0));
            const rev = Number(item.sellerRevenue || 0);

            // Bakiye & Tutar Toplamları
            switch (type) {
              case "Sale":
                totalSales += amount;
                totalCommission += comm;
                totalSellerRevenue += rev > 0 ? rev : amount - comm;
                break;
              case "Return":
                totalReturns += amount;
                totalCommission -= comm;
                totalSellerRevenue -= rev > 0 ? rev : amount - comm;
                break;
              case "Discount":
                totalDiscounts += amount;
                break;
              case "DiscountCancel":
                totalDiscountCancels += amount;
                break;
              case "Coupon":
                totalCoupons += amount;
                break;
              case "CouponCancel":
                totalCouponCancels += amount;
                break;
              case "ProvisionPositive":
                totalProvisionPositive += amount;
                break;
              case "ProvisionNegative":
                totalProvisionNegative += amount;
                break;
              case "ManualRefund":
                totalManualRefunds += amount;
                break;
              case "DeliveryFee":
                totalDeliveryFees += amount;
                break;
              case "DeliveryFeeCancel":
                totalDeliveryFeeCancels += amount;
                break;
            }

            allTransactions.push({
              id: item.id || `${item.orderNumber}_${type}_${item.transactionDate}`,
              orderNumber: item.orderNumber || "",
              paymentOrderId: item.paymentOrderId || null,
              transactionType: type,
              source: "settlement",
              amount,
              debt: item.debt || 0,
              credit: item.credit || 0,
              commissionAmount: item.commissionAmount || 0,
              commissionRate: item.commissionRate || 0,
              sellerRevenue: item.sellerRevenue || 0,
              storeId: item.storeId || item.sellerId || "",
              storeName: item.storeName || "",
              transactionDate: item.transactionDate || Date.now(),
              description: item.description || type,
            });
          }
        }

        // Otherfinancials İşleme
        let paidHakedis = 0;
        let totalDeductions = 0;
        let stoppage = 0;
        let wireTransfer = 0;
        let incomingTransfer = 0;

        for (const [type, items] of Object.entries(otherResults)) {
          for (const item of items) {
            const amount = Number(item.credit || item.debt || item.amount || 0);

            switch (type) {
              case "PaymentOrder":
                paidHakedis += amount;
                break;
              case "DeductionInvoices":
                totalDeductions += amount;
                break;
              case "Stoppage":
                stoppage += amount;
                break;
              case "WireTransfer":
                wireTransfer += amount;
                break;
              case "IncomingTransfer":
                incomingTransfer += amount;
                break;
            }

            allTransactions.push({
              id: item.id || `${item.receiptId}_${type}_${item.transactionDate}`,
              orderNumber: item.orderNumber || "",
              paymentOrderId: item.paymentOrderId || item.receiptId || null,
              transactionType: type,
              source: "otherfinancials",
              amount,
              debt: item.debt || 0,
              credit: item.credit || 0,
              storeId: item.storeId || "",
              transactionDate: item.transactionDate || Date.now(),
              description: item.description || type,
            });
          }
        }

        // Net Cari Bakiye Formülü:
        // (Satışlar + Kuponlar + Provizyon+ + Taşıma Ücreti + Gelen Havale + İndirim İptal)
        // - (İadeler + İndirimler + Komisyonlar + Kesintiler + Stopaj + Provizyon- + Kısmi İadeler + Ödenen Hakedişler)
        const creditTotal =
          totalSales +
          totalCoupons +
          totalProvisionPositive +
          totalDeliveryFees +
          incomingTransfer +
          totalDiscountCancels;

        const debtTotal =
          totalReturns +
          totalDiscounts +
          totalCommission +
          totalDeductions +
          stoppage +
          totalProvisionNegative +
          totalManualRefunds +
          paidHakedis +
          totalCouponCancels +
          totalDeliveryFeeCancels;

        const currentBalance = creditTotal - debtTotal;
        const pendingHakedis = Math.max(0, totalSellerRevenue - paidHakedis);

        const summary = {
          totals: {
            totalSales,
            totalReturns,
            totalDiscounts,
            totalCoupons,
            totalProvision: totalProvisionPositive - totalProvisionNegative,
            totalDeliveryFee: totalDeliveryFees - totalDeliveryFeeCancels,
            totalCommission,
            totalSellerRevenue,
            paidHakedis,
            pendingHakedis,
            totalDeductions,
            stoppage,
            wireTransfer,
            incomingTransfer,
            currentBalance,
          },
          transactionsCount: allTransactions.length,
          transactions: allTransactions.sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0)),
          calculatedAt: new Date().toISOString(),
          period: { startDate, endDate },
        };

        // Cache TTL belirleme:
        // Eğer endDate geçmiş bir tarihe aitse (örneğin dünden önceki bir günse) veriler değişmeyeceği için 7 gün cache'le.
        // Eğer bugünü kapsıyorsa 10 dakika cache'le.
        const isPastPeriod = endDate < Date.now() - 24 * 60 * 60 * 1000;
        const ttlSeconds = isPastPeriod ? 7 * 24 * 60 * 60 : 600;

        try {
          await redis.set(cacheKey, JSON.stringify(summary), "EX", ttlSeconds);
        } catch (e) {}

        return summary;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, workPromise);
    return workPromise;
  }
}
