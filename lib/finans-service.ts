import axios from "axios";
import { redis } from "@/lib/redis";

const FIFTEEN_DAYS_MS = 13 * 24 * 60 * 60 * 1000; // 13 günlük dilimler (Trendyol 15 gün sınırına tam uyumlu)

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
   * Trendyol Settlements API'sinden belirli bir işlem tipini çeker (Strict size=500).
   */
  static async fetchSettlementsForType(
    transactionType: SettlementType,
    startDate: number,
    endDate: number,
    domain: "grocery" | "meal" = "grocery"
  ): Promise<any[]> {
    const supplierId = this.getSupplierId();
    if (!supplierId || !process.env.TRENDYOL_TOKEN) return [];

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
              size: 500, // Trendyol kesin kuralı: 500 veya 1000 olmalı
            },
            timeout: 15000,
          });

          const data = res.data;
          const items = Array.isArray(data) ? data : data?.content || [];
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
          console.warn(`[FinansService] Settlements ${transactionType} chunk hata:`, err.message);
          break;
        }
      }
    }

    return allRecords;
  }

  /**
   * Trendyol Otherfinancials API'sinden belirli bir işlem tipini çeker (Strict size=500).
   */
  static async fetchOtherFinancialsForType(
    transactionType: OtherType,
    startDate: number,
    endDate: number,
    domain: "grocery" | "meal" = "grocery"
  ): Promise<any[]> {
    const supplierId = this.getSupplierId();
    if (!supplierId || !process.env.TRENDYOL_TOKEN) return [];

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
              size: 500, // Trendyol kesin kuralı: 500 veya 1000 olmalı
            },
            timeout: 15000,
          });

          const data = res.data;
          const items = Array.isArray(data) ? data : data?.content || [];
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
          console.warn(`[FinansService] Otherfinancials ${transactionType} chunk hata:`, err.message);
          break;
        }
      }
    }

    return allRecords;
  }

  /**
   * Tüm Finansal Kayıtları Çeker, Sınıflandırır ve Sunucu Tarafında Hesaplar (Bölüm 6.1, 6.2, 6.3)
   */
  static async getFinancialSummary(startDate: number, endDate: number, refresh = false) {
    const supplierId = this.getSupplierId();
    const cacheKey = `finans_summary_v2:${supplierId}:${startDate}:${endDate}`;

    if (!refresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {}
    }

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)!;
    }

    const workPromise = (async () => {
      try {
        // Settlements paralel çekimi
        const settlementResults: Record<string, any[]> = {};
        for (const type of SETTLEMENT_TRANSACTION_TYPES) {
          settlementResults[type] = await this.fetchSettlementsForType(type, startDate, endDate);
        }

        // Otherfinancials paralel çekimi
        const otherResults: Record<string, any[]> = {};
        for (const type of OTHER_TRANSACTION_TYPES) {
          otherResults[type] = await this.fetchOtherFinancialsForType(type, startDate, endDate);
        }

        // ── HESAPLAMA MOTORU ──
        let totalSales = 0;
        let totalReturns = 0;
        let totalDiscounts = 0;
        let totalDiscountCancels = 0;
        let totalCoupons = 0;
        let totalCouponCancels = 0;

        // Tanzim & Provizyon Kalemleri (Bölüm 6.2)
        let tanzimRevenue = 0;     // ProvisionPositive (Provizyon + Tanzim Geliri)
        let tanzimDeduction = 0;   // ProvisionNegative (Provizyon - Tanzim Kesintisi)
        let totalManualRefunds = 0;
        let totalDeliveryFees = 0;
        let totalDeliveryFeeCancels = 0;
        let totalCommission = 0;
        let totalSellerRevenue = 0;

        const allTransactions: any[] = [];
        const branchFinancialMap: Record<string, any> = {};

        // 1. Settlements İşleme
        for (const [type, items] of Object.entries(settlementResults)) {
          for (const item of items) {
            const debt = Number(item.debt || 0);
            const credit = Number(item.credit || 0);
            const amount = credit > 0 ? credit : debt;
            const comm = Math.abs(Number(item.commissionAmount || 0));
            const rev = Number(item.sellerRevenue || 0);
            const rate = typeof item.commissionRate === "number" ? item.commissionRate : 0;

            const storeId = String(item.storeId || item.sellerId || "genel");
            const storeName = item.storeName || "Genel";

            if (!branchFinancialMap[storeId]) {
              branchFinancialMap[storeId] = {
                storeId,
                storeName,
                sales: 0,
                returns: 0,
                commission: 0,
                sellerRevenue: 0,
                orderCount: 0,
              };
            }

            switch (type) {
              case "Sale":
                totalSales += amount;
                totalCommission += comm;
                totalSellerRevenue += rev > 0 ? rev : amount - comm;
                branchFinancialMap[storeId].sales += amount;
                branchFinancialMap[storeId].commission += comm;
                branchFinancialMap[storeId].sellerRevenue += rev > 0 ? rev : amount - comm;
                branchFinancialMap[storeId].orderCount++;
                break;
              case "Return":
                totalReturns += amount;
                totalCommission -= comm;
                totalSellerRevenue -= rev > 0 ? rev : amount - comm;
                branchFinancialMap[storeId].returns += amount;
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
                tanzimRevenue += amount;
                break;
              case "ProvisionNegative":
                tanzimDeduction += amount;
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
              categoryName:
                type === "Sale"
                  ? "Satış"
                  : type === "Return"
                  ? "İade Kesintisi"
                  : type === "ProvisionPositive"
                  ? "Tanzim / Provizyon (+)"
                  : type === "ProvisionNegative"
                  ? "Tanzim / Provizyon (-)"
                  : type === "Discount"
                  ? "İndirim"
                  : item.description || type,
              source: "settlement",
              amount,
              debt,
              credit,
              commissionAmount: comm,
              commissionRate: rate,
              commissionRateFormatted: `%${rate.toFixed(2)}`, // İki ondalık basamak standardı (Bölüm 5)
              sellerRevenue: rev,
              storeId,
              storeName,
              transactionDate: item.transactionDate || Date.now(),
              description: item.description || type,
            });
          }
        }

        // 2. Otherfinancials İşleme (Stopaj, Kesintiler, Ödeme Emirleri)
        let stoppageDebt = 0;       // E-ticaret Stopajı (Borç) (Bölüm 6.1)
        let stoppageCredit = 0;     // E-ticaret Stopaj İptali (Alacak) (Bölüm 6.1)
        let totalDeductions = 0;    // Kesinti Faturaları
        let paidHakedis = 0;        // Ödenen Hakedişler
        let wireTransfer = 0;       // Virman
        let incomingTransfer = 0;   // Gelen Havale

        for (const [type, items] of Object.entries(otherResults)) {
          for (const item of items) {
            const debt = Number(item.debt || 0);
            const credit = Number(item.credit || 0);
            const amount = credit > 0 ? credit : debt;

            let catName = type;
            if (type === "Stoppage") {
              if (debt > 0) {
                stoppageDebt += debt;
                catName = "E-ticaret Stopajı";
              } else {
                stoppageCredit += credit;
                catName = "E-ticaret Stopaj İptali";
              }
            } else if (type === "DeductionInvoices") {
              totalDeductions += amount;
              catName = "Kesinti Faturası";
            } else if (type === "PaymentOrder") {
              paidHakedis += amount;
              catName = "Hakediş Ödemesi";
            } else if (type === "WireTransfer") {
              wireTransfer += amount;
              catName = "Virman";
            } else if (type === "IncomingTransfer") {
              incomingTransfer += amount;
              catName = "Gelen Havale";
            }

            allTransactions.push({
              id: item.id || `${item.receiptId}_${type}_${item.transactionDate}`,
              orderNumber: item.orderNumber || "",
              paymentOrderId: item.paymentOrderId || item.receiptId || null,
              transactionType: type,
              categoryName: catName,
              source: "otherfinancials",
              amount,
              debt,
              credit,
              storeId: item.storeId || "",
              storeName: item.storeName || "",
              transactionDate: item.transactionDate || Date.now(),
              description: item.description || type,
            });
          }
        }

        // ── NET CARİ BAKİYE VE HAKEDİŞ HESAPLAMALARI ──
        const creditTotal =
          totalSales +
          totalCoupons +
          tanzimRevenue +
          totalDeliveryFees +
          incomingTransfer +
          totalDiscountCancels +
          stoppageCredit;

        const debtTotal =
          totalReturns +
          totalDiscounts +
          totalCommission +
          totalDeductions +
          stoppageDebt +
          tanzimDeduction +
          totalManualRefunds +
          paidHakedis +
          totalCouponCancels +
          totalDeliveryFeeCancels;

        const currentBalance = creditTotal - debtTotal;
        const netTanzim = tanzimRevenue - tanzimDeduction;
        const netStopaj = stoppageDebt - stoppageCredit;
        const pendingHakedis = Math.max(0, totalSellerRevenue - paidHakedis - netStopaj - totalDeductions);

        const summary = {
          totals: {
            totalSales,
            totalReturns,
            totalDiscounts,
            totalCoupons,
            totalCommission,
            totalSellerRevenue,
            // Tanzim & Provizyonlar (Bölüm 6.2)
            tanzimRevenue,
            tanzimDeduction,
            netTanzim,
            // Stopaj (Bölüm 6.1)
            stoppageDebt,
            stoppageCredit,
            netStopaj,
            // Hakediş & Kesintiler
            totalDeductions,
            paidHakedis,
            pendingHakedis,
            currentBalance,
            wireTransfer,
            incomingTransfer,
          },
          branchBreakdown: Object.values(branchFinancialMap),
          transactionsCount: allTransactions.length,
          transactions: allTransactions.sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0)),
          calculatedAt: new Date().toISOString(),
          period: { startDate, endDate },
        };

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
