import axios from "axios";
import { redis } from "@/lib/redis";
import {
  MarketPeriodMetric,
  StorePeriodMetric,
  QUALITY_THRESHOLDS,
  COMMISSION_MATRIX,
  evaluateQualityLevel,
  analyzeRequirements,
  MARKET_PERIOD_METRICS as BASELINE_MARKET_PERIODS,
  OFFICIAL_STORE_METRICS as BASELINE_STORE_METRICS,
} from "@/lib/level-data";

export const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export interface PeriodDateInfo {
  perfStart: Date;
  perfEnd: Date;
  commPeriodName: string;
  perfRangeStr: string;
  perfMonthName: string;
  year: number;
}

/**
 * Trendyol Go komisyon dönemi hesaplayıcı.
 * Her ayın 21'inden sonraki ayın 20'sine kadar olan performans, 2 ay sonraki komisyon dönemini belirler.
 */
export function getPeriodInfoForDate(refDate = new Date()): PeriodDateInfo {
  const day = refDate.getDate();
  const month = refDate.getMonth(); // 0-11
  const year = refDate.getFullYear();

  let perfStartMonth: number, perfStartYear: number;
  let perfEndMonth: number, perfEndYear: number;
  let commMonth: number, commYear: number;

  if (day >= 21) {
    perfStartMonth = month;
    perfStartYear = year;
    perfEndMonth = (month + 1) % 12;
    perfEndYear = month === 11 ? year + 1 : year;
    commMonth = (month + 2) % 12;
    commYear = month >= 10 ? year + 1 : year;
  } else {
    perfStartMonth = (month + 11) % 12;
    perfStartYear = month === 0 ? year - 1 : year;
    perfEndMonth = month;
    perfEndYear = year;
    commMonth = (month + 1) % 12;
    commYear = month === 11 ? year + 1 : year;
  }

  const perfStart = new Date(perfStartYear, perfStartMonth, 21, 0, 0, 0, 0);
  const perfEnd = new Date(perfEndYear, perfEndMonth, 20, 23, 59, 59, 999);
  const commPeriodName = `${TURKISH_MONTHS[commMonth]} ${commYear}`;
  const perfRangeStr = `21 ${TURKISH_MONTHS[perfStartMonth]} ${perfStartYear} - 20 ${TURKISH_MONTHS[perfEndMonth]} ${perfEndYear}`;

  return {
    perfStart,
    perfEnd,
    commPeriodName,
    perfRangeStr,
    perfMonthName: TURKISH_MONTHS[commMonth],
    year: commYear,
  };
}

export interface DynamicLevelDataResult {
  marketPeriods: MarketPeriodMetric[];
  stores: (StorePeriodMetric & { analysis: ReturnType<typeof analyzeRequirements> })[];
  thresholds: typeof QUALITY_THRESHOLDS;
  commissionMatrix: typeof COMMISSION_MATRIX;
  lastSyncedAt: string;
  isLive: boolean;
  message?: string;
}

export async function fetchDynamicLevelData(refresh: boolean = false): Promise<DynamicLevelDataResult> {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const token = process.env.TRENDYOL_TOKEN;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  const cacheKey = `tg:level_data:v4:${supplierId || "default"}`;

  // 1. Redis Cache Kontrolü (Refresh istenmediyse)
  if (!refresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Redis read error in fetchDynamicLevelData:", e);
    }
  }

  // API Bilgileri Eksikse Baseline Dön
  if (!supplierId || !token || !agentName || !executorUser) {
    return getBaselineFallback("Trendyol Go API kimlik bilgileri (.env.local) eksik.");
  }

  const headers = {
    Authorization: `Basic ${token}`,
    "x-agentname": agentName,
    "x-executor-user": executorUser,
  };

  try {
    // 2. Trendyol'dan Canlı Şube Listesini Çek
    const storesRes = await axios.get(
      `https://api.tgoapis.com/integrator/store/grocery/suppliers/${supplierId}/stores`,
      { headers, timeout: 10000 }
    );
    const rawStores: any[] = storesRes.data?.data?.items || [];
    const activeStores = rawStores.filter((s) => s.status === "ACTIVE");
    const activeStoresCount = activeStores.length;

    // Aktif Şehir Sayısı
    const citiesSet = new Set<string>();
    rawStores.forEach((s) => {
      const cityName = s.addressInfo?.provinceName || s.addressInfo?.cityName;
      if (cityName) citiesSet.add(cityName);
    });
    const activeCitiesCount = citiesSet.size || 1;

    // Dinamik Market Seviyesi Belirle
    let currentMarketLevel: "Seviye 1" | "Seviye 2" | "Seviye 3" = "Seviye 3";
    if (activeStoresCount >= 20 || activeCitiesCount >= 4) {
      currentMarketLevel = "Seviye 1";
    } else if (activeStoresCount >= 10) {
      currentMarketLevel = "Seviye 2";
    } else {
      currentMarketLevel = "Seviye 3";
    }

    // 3. Mevcut Tarihe Göre Canlı Değerlendirme Penceresi
    const now = new Date();
    const periodInfo = getPeriodInfoForDate(now);

    // 4. Trendyol'dan Canlı Sipariş Paketlerini Çek (Sayfalı)
    let livePackages: any[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages && page < 15) {
      const pkgRes = await axios.get(
        `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
        {
          headers,
          params: {
            startDate: periodInfo.perfStart.getTime(),
            endDate: periodInfo.perfEnd.getTime(),
            size: 200,
            page,
          },
          timeout: 10000,
        }
      );
      const content = pkgRes.data?.content || [];
      livePackages = livePackages.concat(content);
      totalPages = pkgRes.data?.totalPages || 1;
      page++;
    }

    // 5. Trendyol'dan Canlı İadeleri (Claims) Çek
    let liveClaims: any[] = [];
    try {
      const claimRes = await axios.get(
        `https://api.tgoapis.com/integrator/claim/grocery/suppliers/${supplierId}/claims`,
        {
          headers,
          params: { size: 200, page: 0 },
          timeout: 10000,
        }
      );
      liveClaims = claimRes.data?.content || [];
    } catch (e) {
      console.warn("Claims fetch error (proceeding without claims):", e);
    }

    // 6. Her Şube İçin Canlı Performans Metriklerini Hesapla
    const liveStoreMetrics: StorePeriodMetric[] = rawStores.map((store) => {
      const storeIdStr = String(store.id);
      const storePkgs = livePackages.filter((p) => String(p.storeId) === storeIdStr);
      const totalOrders = storePkgs.length;
      const deliveredPkgs = storePkgs.filter((p) => p.packageStatus === "Delivered");
      const deliveredOrders = deliveredPkgs.length;

      // Eksik / Alternatif Ürünlü Sipariş Sayısı
      let altOrMissingCount = 0;
      deliveredPkgs.forEach((p) => {
        let isAltOrMissing = false;
        (p.lines || []).forEach((line: any) => {
          (line.items || []).forEach((item: any) => {
            if (item.isAlternative || item.isCancelled || item.causedCancel) {
              isAltOrMissing = true;
            }
          });
        });
        if (isAltOrMissing) altOrMissingCount++;
      });

      const missingAltRate =
        deliveredOrders > 0
          ? parseFloat(((altOrMissingCount / deliveredOrders) * 100).toFixed(2))
          : deliveredOrders === 0 && totalOrders === 0
          ? null
          : 0.0;

      // Satıcı Kaynaklı İptal Sipariş Sayısı
      let sellerCancelCount = 0;
      storePkgs.forEach((p) => {
        if (p.packageStatus === "Cancelled" || p.packageStatus === "UnSupplied") {
          const reason = (p.cancelInfo?.reason || "").toLowerCase();
          const agent = p.cancelInfo?.agentName || "";
          const reasonType = p.cancelInfo?.reasonType || "";
          const causedBy = p.cancelInfo?.causedBy || "";

          // Sadece doğrudan satıcı kaynaklı iptalleri say:
          const isSellerCancel =
            agent === "Seller" ||
            causedBy === "Seller" ||
            reasonType === "Seller" ||
            (agent !== "Customer" && agent !== "TGO App" && agent !== "Carrier" &&
              (reason.includes("satıcı") || reason.includes("mağaza kapalı")));
          if (isSellerCancel) sellerCancelCount++;
        }
      });

      const sellerCancelRate =
        totalOrders > 0
          ? parseFloat(((sellerCancelCount / totalOrders) * 100).toFixed(2))
          : totalOrders === 0
          ? null
          : 0.0;

      // Satıcı Kaynaklı İade Sipariş Sayısı
      const storeOrderNumbers = new Set(deliveredPkgs.map((p) => p.orderNumber));
      const storeSellerClaims = liveClaims.filter(
        (c) => storeOrderNumbers.has(c.orderNumber) && c.returnedSeller === true
      );
      const sellerReturnRate =
        deliveredOrders > 0
          ? parseFloat(((storeSellerClaims.length / deliveredOrders) * 100).toFixed(2))
          : deliveredOrders === 0
          ? null
          : 0.0;

      // Baseline resmi tablosunda bu şube ve dönem için kayıt varsa resmi veriyi önceliklendir
      const baselineMatch = BASELINE_STORE_METRICS.find(
        (b) => b.storeId === storeIdStr && b.commissionPeriod === periodInfo.commPeriodName
      );

      // Kalite Seviyesi (Öncelik: Resmi Baseline verisi, yoksa canlı hesaplama)
      const calculatedQuality =
        deliveredOrders === 0 && totalOrders === 0
          ? "n/a"
          : evaluateQualityLevel(
              missingAltRate,
              sellerCancelRate,
              sellerReturnRate,
              deliveredOrders
            );

      const qualityLevel: "Seviye 1" | "Seviye 2" | "Seviye 3" | "n/a" =
        baselineMatch?.qualityLevel && baselineMatch.qualityLevel !== "n/a"
          ? baselineMatch.qualityLevel
          : calculatedQuality;

      // Komisyon Oranı (Market Seviyesi x Kalite Seviyesi Kesişimi)
      const mKey = `Market - ${currentMarketLevel}`;
      const commissionRate =
        baselineMatch?.commissionRate !== undefined && baselineMatch.commissionRate !== null
          ? baselineMatch.commissionRate
          : qualityLevel === "n/a"
          ? null
          : COMMISSION_MATRIX[mKey]?.[`Kalite - ${qualityLevel}`] ?? 22.0;

      return {
        storeId: storeIdStr,
        storeName: store.name,
        commissionPeriod: periodInfo.commPeriodName,
        performancePeriod: periodInfo.perfRangeStr,
        qualityLevel,
        commissionRate,
        missingAltRate: baselineMatch?.missingAltRate !== undefined ? baselineMatch.missingAltRate : missingAltRate,
        sellerCancelRate: baselineMatch?.sellerCancelRate !== undefined ? baselineMatch.sellerCancelRate : sellerCancelRate,
        sellerReturnRate: baselineMatch?.sellerReturnRate !== undefined ? baselineMatch.sellerReturnRate : sellerReturnRate,
        deliveredOrders: baselineMatch?.deliveredOrders !== undefined ? baselineMatch.deliveredOrders : deliveredOrders,
      };
    });

    // 7. Şube Metriklerini Birleştir
    // BASELINE_STORE_METRICS resmi verilerini koru, canlıdan gelen yeni şubeler varsa ekle
    const allStoresCombined: StorePeriodMetric[] = [...BASELINE_STORE_METRICS];
    liveStoreMetrics.forEach((liveStore) => {
      const exists = allStoresCombined.some(
        (s) => s.storeId === liveStore.storeId && s.commissionPeriod === liveStore.commissionPeriod
      );
      if (!exists) {
        allStoresCombined.push(liveStore);
      }
    });

    // 8. Market Dönemlerini Dinamik Oluştur
    // Canlı dönem için ortalama komisyon oranı
    const currentPeriodStores = allStoresCombined.filter((s) =>
      s.commissionPeriod.includes(periodInfo.perfMonthName)
    );
    const validLiveRates = currentPeriodStores
      .map((s) => s.commissionRate)
      .filter((r): r is number => r !== null);
    const liveAvgCommission =
      validLiveRates.length > 0
        ? parseFloat(
            (
              validLiveRates.reduce((a, b) => a + b, 0) / validLiveRates.length
            ).toFixed(2)
          )
        : 19.9;

    const dynamicMarketPeriods: MarketPeriodMetric[] = [
      // Geçmiş kesinleşmiş dönemler
      ...BASELINE_MARKET_PERIODS.filter(
        (m) => !periodInfo.commPeriodName.includes(m.periodName)
      ).map((m) => {
        // Eğer bu dönem geçerli ay ise durumunu koru
        return m;
      }),
      // Canlı / Tahmini Dönem
      {
        periodKey: periodInfo.commPeriodName.toLowerCase().replace(" ", "_"),
        periodName: periodInfo.perfMonthName,
        dateRange: periodInfo.perfRangeStr,
        statusTag: "Tahmini",
        marketLevel: currentMarketLevel,
        onlyOnline: false,
        nationalOrderShare: "%0.50'den düşük",
        nationalOrderShareValue: 0.38,
        activeCitiesCount,
        activeStoresCount,
        cityOrderShare: "%35'ten düşük",
        cityOrderShareValue: 18.5,
        averageCommissionRate: liveAvgCommission,
      },
    ];

    // Tekrar eden dönemleri temizle ve sırala (güncel dönem en üstte/son sırada)
    const uniquePeriodsMap = new Map<string, MarketPeriodMetric>();
    dynamicMarketPeriods.forEach((p) => {
      uniquePeriodsMap.set(p.periodName, p);
    });
    const finalPeriods = Array.from(uniquePeriodsMap.values());

    // 9. Tüm Şubeleri Analizleri ile Zenginleştir
    const enrichedStores = allStoresCombined.map((s) => {
      const pMetric = finalPeriods.find((m) =>
        s.commissionPeriod.includes(m.periodName)
      );
      const mLevel = pMetric?.marketLevel || currentMarketLevel;
      const analysis = analyzeRequirements(s, mLevel);
      return {
        ...s,
        analysis,
      };
    });

    const result: DynamicLevelDataResult = {
      marketPeriods: finalPeriods,
      stores: enrichedStores,
      thresholds: QUALITY_THRESHOLDS,
      commissionMatrix: COMMISSION_MATRIX,
      lastSyncedAt: new Date().toISOString(),
      isLive: true,
      message: `Trendyol Go üzerinden ${activeStoresCount} şube ve canlı sipariş verileriyle başarıyla güncellendi.`,
    };

    // Redis Cache (5 dakika TTL)
    await redis
      .set(cacheKey, JSON.stringify(result), "EX", 300)
      .catch((e) => console.warn("Redis set error:", e));

    return result;
  } catch (error: any) {
    console.error("Trendyol Go canlı seviye verisi çekilirken hata:", error?.response?.data || error.message);
    return getBaselineFallback(
      `Trendyol bağlantı uyarısı: ${error?.response?.data?.message || error.message}. Yerel yedek veriler yüklendi.`
    );
  }
}

/**
 * Hata veya bağlantı kopukluğu durumunda temiz baseline verisini zenginleştirip dönen fallback fonksiyonu.
 */
function getBaselineFallback(message: string): DynamicLevelDataResult {
  const enrichedStores = BASELINE_STORE_METRICS.map((s) => {
    const marketMetric = BASELINE_MARKET_PERIODS.find((m) =>
      s.commissionPeriod.includes(m.periodName)
    );
    const mLevel = marketMetric?.marketLevel || "Seviye 2";
    const analysis = analyzeRequirements(s, mLevel);
    return {
      ...s,
      analysis,
    };
  });

  return {
    marketPeriods: BASELINE_MARKET_PERIODS,
    stores: enrichedStores,
    thresholds: QUALITY_THRESHOLDS,
    commissionMatrix: COMMISSION_MATRIX,
    lastSyncedAt: new Date().toISOString(),
    isLive: false,
    message,
  };
}
