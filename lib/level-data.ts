// Trendyol Go Market Seviyesi ve Şube Kalite Seviyesi Veri & Hesaplama Modeli

export interface MarketPeriodMetric {
  periodKey: string;
  periodName: string;
  dateRange: string;
  statusTag: "Geçmiş" | "Geçerli" | "Tahmini";
  marketLevel: "Seviye 1" | "Seviye 2" | "Seviye 3";
  onlyOnline: boolean;
  nationalOrderShare: string;
  nationalOrderShareValue: number; // örn: 0.2
  activeCitiesCount: number;
  activeStoresCount: number;
  cityOrderShare: string;
  cityOrderShareValue: number; // örn: 15
  averageCommissionRate: number;
}

export interface StorePeriodMetric {
  storeId: string;
  storeName: string;
  commissionPeriod: string;
  performancePeriod: string;
  qualityLevel: "Seviye 1" | "Seviye 2" | "Seviye 3" | "n/a";
  commissionRate: number | null; // örn: 16.25
  missingAltRate: number | null; // Eksik / Alternatif Sipariş Oranı (%)
  sellerCancelRate: number | null; // Satıcı Kaynaklı İptal Oranı (%)
  sellerReturnRate: number | null; // Satıcı Kaynaklı İade Oranı (%)
  deliveredOrders: number | null; // Teslim Edilen Sipariş Sayısı
}

export interface EnrichedStoreMetric extends StorePeriodMetric {
  analysis: RequirementAnalysis;
}

// ─── 1. DÖNEM BAZLI MARKET SEVİYESİ METRİKLERİ (Resim 1'den Birebir) ───────────
export const MARKET_PERIOD_METRICS: MarketPeriodMetric[] = [
  {
    periodKey: "eylul_2026",
    periodName: "Eylül",
    dateRange: "21 Temmuz 2026 - 20 Ağustos 2026",
    statusTag: "Geçmiş",
    marketLevel: "Seviye 3",
    onlyOnline: false,
    nationalOrderShare: "%0.50'den düşük",
    nationalOrderShareValue: 0.15,
    activeCitiesCount: 1,
    activeStoresCount: 4,
    cityOrderShare: "%35'ten düşük",
    cityOrderShareValue: 12.4,
    averageCommissionRate: 23.75,
  },
  {
    periodKey: "ekim_2026",
    periodName: "Ekim",
    dateRange: "21 Ağustos 2026 - 20 Eylül 2026",
    statusTag: "Geçerli",
    marketLevel: "Seviye 3",
    onlyOnline: false,
    nationalOrderShare: "%0.50'den düşük",
    nationalOrderShareValue: 0.22,
    activeCitiesCount: 1,
    activeStoresCount: 5,
    cityOrderShare: "%35'ten düşük",
    cityOrderShareValue: 14.8,
    averageCommissionRate: 21.69,
  },
  {
    periodKey: "kasim_2026",
    periodName: "Kasım",
    dateRange: "21 Eylül 2026 - 20 Ekim 2026",
    statusTag: "Tahmini",
    marketLevel: "Seviye 2", // >= 10 aktif mağaza kriteri sağlandığı için Seviye 2!
    onlyOnline: false,
    nationalOrderShare: "%0.50'den düşük",
    nationalOrderShareValue: 0.38,
    activeCitiesCount: 1,
    activeStoresCount: 11, // 11 Aktif Mağaza!
    cityOrderShare: "%35'ten düşük",
    cityOrderShareValue: 18.5,
    averageCommissionRate: 19.9,
  },
];

// ─── 2. RESMİ TABLO VERİSİ (Resim 2'den Birebir Bütün Satırlar) ───────────────
export const OFFICIAL_STORE_METRICS: StorePeriodMetric[] = [
  // 156829 - Limon-2 Süpermarket Atakum Şubesi
  {
    storeId: "156829",
    storeName: "Limon-2 Süpermarket Atakum Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 16.0,
    sellerCancelRate: 2.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 97,
  },
  {
    storeId: "156829",
    storeName: "Limon-2 Süpermarket Atakum Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 14.29,
    sellerCancelRate: 0.79,
    sellerReturnRate: 0.0,
    deliveredOrders: 121,
  },
  {
    storeId: "156829",
    storeName: "Limon-2 Süpermarket Atakum Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 19.3,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 53,
  },

  // 157108 - Limon-1 Süpermarket Atakum Şubesi
  {
    storeId: "157108",
    storeName: "Limon-1 Süpermarket Atakum Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 4.89,
    sellerCancelRate: 1.33,
    sellerReturnRate: 0.0,
    deliveredOrders: 217,
  },
  {
    storeId: "157108",
    storeName: "Limon-1 Süpermarket Atakum Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 1",
    commissionRate: 18.0,
    missingAltRate: 4.23,
    sellerCancelRate: 0.38,
    sellerReturnRate: 0.0,
    deliveredOrders: 252,
  },
  {
    storeId: "157108",
    storeName: "Limon-1 Süpermarket Atakum Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 8.93,
    sellerCancelRate: 3.57,
    sellerReturnRate: 0.0,
    deliveredOrders: 51,
  },

  // 157109 - Limon-5 Süpermarket Atakum Şubesi
  {
    storeId: "157109",
    storeName: "Limon-5 Süpermarket Atakum Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 5.38,
    sellerCancelRate: 1.15,
    sellerReturnRate: 1.92,
    deliveredOrders: 241,
  },
  {
    storeId: "157109",
    storeName: "Limon-5 Süpermarket Atakum Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 7.14,
    sellerCancelRate: 1.26,
    sellerReturnRate: 0.84,
    deliveredOrders: 230,
  },
  {
    storeId: "157109",
    storeName: "Limon-5 Süpermarket Atakum Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 1",
    commissionRate: 16.25,
    missingAltRate: 5.97,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 127,
  },

  // 157111 - Limon-3 Süpermarket Atakum Şubesi
  {
    storeId: "157111",
    storeName: "Limon-3 Süpermarket Atakum Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 15.38,
    sellerCancelRate: 1.54,
    sellerReturnRate: 0.0,
    deliveredOrders: 62,
  },
  {
    storeId: "157111",
    storeName: "Limon-3 Süpermarket Atakum Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 16.42,
    sellerCancelRate: 0.0,
    sellerReturnRate: 5.97,
    deliveredOrders: 66,
  },
  {
    storeId: "157111",
    storeName: "Limon-3 Süpermarket Atakum Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 20.45,
    sellerCancelRate: 2.27,
    sellerReturnRate: 2.27,
    deliveredOrders: 40,
  },

  // 479042 - Limon Süpermarket Kanije Şubesi
  {
    storeId: "479042",
    storeName: "Limon Süpermarket Kanije Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479042",
    storeName: "Limon Süpermarket Kanije Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479042",
    storeName: "Limon Süpermarket Kanije Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 0.0,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 1,
  },

  // 479045 - Limon Süpermarket Atakum Gross Şubesi
  {
    storeId: "479045",
    storeName: "Limon Süpermarket Atakum Gross Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479045",
    storeName: "Limon Süpermarket Atakum Gross Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479045",
    storeName: "Limon Süpermarket Atakum Gross Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },

  // 479048 - Limon Süpermarket Denizevler Şubesi
  {
    storeId: "479048",
    storeName: "Limon Süpermarket Denizevler Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479048",
    storeName: "Limon Süpermarket Denizevler Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479048",
    storeName: "Limon Süpermarket Denizevler Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 22.58,
    sellerCancelRate: 1.61,
    sellerReturnRate: 0.0,
    deliveredOrders: 55,
  },

  // 479052 - Limon Süpermarket Barış Şubesi
  {
    storeId: "479052",
    storeName: "Limon Süpermarket Barış Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479052",
    storeName: "Limon Süpermarket Barış Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479052",
    storeName: "Limon Süpermarket Barış Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 0.0,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 6,
  },

  // 479054 - Limon Süpermarket Körfez 2 Şubesi
  {
    storeId: "479054",
    storeName: "Limon Süpermarket Körfez 2 Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479054",
    storeName: "Limon Süpermarket Körfez 2 Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: 3.96,
    sellerCancelRate: 1.98,
    sellerReturnRate: 0.0,
    deliveredOrders: 92,
  },
  {
    storeId: "479054",
    storeName: "Limon Süpermarket Körfez 2 Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 2",
    commissionRate: 19.0,
    missingAltRate: 3.83,
    sellerCancelRate: 1.09,
    sellerReturnRate: 1.09,
    deliveredOrders: 172,
  },

  // 479061 - Limon Süpermarket Liman Şubesi
  {
    storeId: "479061",
    storeName: "Limon Süpermarket Liman Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479061",
    storeName: "Limon Süpermarket Liman Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479061",
    storeName: "Limon Süpermarket Liman Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 0.0,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 8,
  },

  // 479063 - Limon Süpermarket Duruşehir Şubesi
  {
    storeId: "479063",
    storeName: "Limon Süpermarket Duruşehir Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479063",
    storeName: "Limon Süpermarket Duruşehir Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479063",
    storeName: "Limon Süpermarket Duruşehir Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 0.0,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 12,
  },

  // 479064 - Limon Süpermarket Nikah Şubesi
  {
    storeId: "479064",
    storeName: "Limon Süpermarket Nikah Şubesi",
    commissionPeriod: "Eylül 2026",
    performancePeriod: "21 Temmuz 2026 - 20 Ağustos 2026",
    qualityLevel: "n/a",
    commissionRate: null,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: null,
  },
  {
    storeId: "479064",
    storeName: "Limon Süpermarket Nikah Şubesi",
    commissionPeriod: "Ekim 2026",
    performancePeriod: "21 Ağustos 2026 - 20 Eylül 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 23.75,
    missingAltRate: null,
    sellerCancelRate: null,
    sellerReturnRate: null,
    deliveredOrders: 0,
  },
  {
    storeId: "479064",
    storeName: "Limon Süpermarket Nikah Şubesi",
    commissionPeriod: "Kasım 2026",
    performancePeriod: "21 Eylül 2026 - 20 Ekim 2026",
    qualityLevel: "Seviye 3",
    commissionRate: 22.0,
    missingAltRate: 16.67,
    sellerCancelRate: 0.0,
    sellerReturnRate: 0.0,
    deliveredOrders: 4,
  },
];

// ─── 3. RESMİ KURAL VE BARAJ TANIMLARI ──────────────────────────────────────────

export const QUALITY_THRESHOLDS = {
  LEVEL_1: {
    maxMissingAltRate: 8.0, // <= %8.0
    maxSellerCancelRate: 0.5, // <= %0.5
    maxSellerReturnRate: 1.0, // <= %1.0
    minDeliveredOrders: 20, // >= 20
  },
  LEVEL_2: {
    maxMissingAltRate: 11.0, // <= %11.0
    maxSellerCancelRate: 1.2, // <= %1.2
    maxSellerReturnRate: 1.4, // <= %1.4
    minDeliveredOrders: 20, // >= 20
  },
};

export const COMMISSION_MATRIX: Record<string, Record<string, number>> = {
  "Market - Seviye 1": {
    "Kalite - Seviye 1": 14.5,
    "Kalite - Seviye 2": 17.25,
    "Kalite - Seviye 3": 20.25,
  },
  "Market - Seviye 2": {
    "Kalite - Seviye 1": 16.25,
    "Kalite - Seviye 2": 19.0,
    "Kalite - Seviye 3": 22.0,
  },
  "Market - Seviye 3": {
    "Kalite - Seviye 1": 18.0,
    "Kalite - Seviye 2": 20.75,
    "Kalite - Seviye 3": 23.75,
  },
};

// ─── 4. KALİTE SEVİYESİ HESAPLAYICI ───────────────────────────────────────────
export function evaluateQualityLevel(
  missingAltRate: number | null,
  sellerCancelRate: number | null,
  sellerReturnRate: number | null,
  deliveredOrders: number | null
): "Seviye 1" | "Seviye 2" | "Seviye 3" {
  if (deliveredOrders === null || deliveredOrders < 20) {
    return "Seviye 3";
  }

  const missing = missingAltRate ?? 0;
  const cancel = sellerCancelRate ?? 0;
  const ret = sellerReturnRate ?? 0;

  // Seviye 1 Kontrolü: TÜM şartlar sağlanmalı (VE)
  if (
    missing <= QUALITY_THRESHOLDS.LEVEL_1.maxMissingAltRate &&
    cancel <= QUALITY_THRESHOLDS.LEVEL_1.maxSellerCancelRate &&
    ret <= QUALITY_THRESHOLDS.LEVEL_1.maxSellerReturnRate
  ) {
    return "Seviye 1";
  }

  // Seviye 2 Kontrolü: TÜM şartlar sağlanmalı (VE)
  if (
    missing <= QUALITY_THRESHOLDS.LEVEL_2.maxMissingAltRate &&
    cancel <= QUALITY_THRESHOLDS.LEVEL_2.maxSellerCancelRate &&
    ret <= QUALITY_THRESHOLDS.LEVEL_2.maxSellerReturnRate
  ) {
    return "Seviye 2";
  }

  return "Seviye 3";
}

// ─── 5. SIRADAKİ SEVİYEYE GEÇİŞ İÇİN GEREKSİNİM ANALİZİ ─────────────────────────
export interface RequirementAnalysis {
  currentLevel: "Seviye 1" | "Seviye 2" | "Seviye 3";
  targetLevel: "Seviye 1" | "Seviye 2";
  isQualifiedForTarget: boolean;
  orderCountDeficit: number; // 20'ye ulaşmak için kaç sipariş eksik
  missingAltAnalysis: {
    current: number;
    target: number;
    passed: boolean;
    excessRate: number; // kaç puan aşılmış
    consecutiveCleanNeeded: number; // oranı hedefin altına çekmek için sıfır hatalı kaç sipariş gerekir
    safeBufferRemaining: number; // bozulmadan kaç tane daha eksik/alt siparişe izin var
  };
  sellerCancelAnalysis: {
    current: number;
    target: number;
    passed: boolean;
    excessRate: number;
    consecutiveCleanNeeded: number;
    safeBufferRemaining: number;
  };
  sellerReturnAnalysis: {
    current: number;
    target: number;
    passed: boolean;
    excessRate: number;
    consecutiveCleanNeeded: number;
    safeBufferRemaining: number;
  };
  actionAdvice: string[];
  estimatedCommissionCurrent: number;
  estimatedCommissionTarget: number;
  commissionGainRate: number; // örn: 5.75 veya 3.00 puan
}

export function analyzeRequirements(
  metrics: StorePeriodMetric,
  marketLevel: "Seviye 1" | "Seviye 2" | "Seviye 3" = "Seviye 2"
): RequirementAnalysis {
  const delivered = metrics.deliveredOrders ?? 0;
  const missing = metrics.missingAltRate ?? 0;
  const cancel = metrics.sellerCancelRate ?? 0;
  const ret = metrics.sellerReturnRate ?? 0;

  // Store'da resmi kalite seviyesi varsa onu koru, yoksa eşik değerlerine göre hesapla
  const currentLevel: "Seviye 1" | "Seviye 2" | "Seviye 3" =
    metrics.qualityLevel && metrics.qualityLevel !== "n/a"
      ? metrics.qualityLevel
      : evaluateQualityLevel(missing, cancel, ret, delivered);
  const targetLevel = currentLevel === "Seviye 1" ? "Seviye 1" : currentLevel === "Seviye 2" ? "Seviye 1" : "Seviye 2";
  const targetThresholds = targetLevel === "Seviye 1" ? QUALITY_THRESHOLDS.LEVEL_1 : QUALITY_THRESHOLDS.LEVEL_2;

  // Sipariş barajı
  const orderCountDeficit = Math.max(0, 20 - delivered);

  // Helper: Sıfır hatalı siparişle seyreltme formülü (dilution)
  // E / (N + k) <= TargetRate => k >= (E / TargetRate) - N
  const getDilutionNeeded = (rate: number, count: number, target: number) => {
    if (rate <= target) return 0;
    const errorCount = Math.round((rate / 100) * count);
    const requiredTotal = Math.ceil(errorCount / (target / 100));
    return Math.max(0, requiredTotal - count);
  };

  // Helper: Güvenli hata payı (Safe Buffer)
  // (E + x) / (N + x) <= TargetRate => x
  const getSafeBuffer = (rate: number, count: number, target: number) => {
    if (rate > target || count === 0) return 0;
    const errorCount = (rate / 100) * count;
    // (errorCount + x) / (count + x) = target/100
    // errorCount + x = (target/100)*count + (target/100)*x
    // x * (1 - target/100) = (target/100)*count - errorCount
    const targetDec = target / 100;
    const numerator = targetDec * count - errorCount;
    if (numerator <= 0) return 0;
    return Math.floor(numerator / (1 - targetDec));
  };

  const missingPassed = missing <= targetThresholds.maxMissingAltRate;
  const cancelPassed = cancel <= targetThresholds.maxSellerCancelRate;
  const returnPassed = ret <= targetThresholds.maxSellerReturnRate;
  const ordersPassed = delivered >= 20;

  const isQualified = currentLevel === "Seviye 1" || (missingPassed && cancelPassed && returnPassed && ordersPassed);

  // Tavsiyeler
  const actionAdvice: string[] = [];

  if (orderCountDeficit > 0) {
    actionAdvice.push(
      `Asgari teslimat barajı (>= 20) için en az ${orderCountDeficit} sipariş daha teslim edilmeli.`
    );
  }

  if (!missingPassed) {
    const k = getDilutionNeeded(missing, delivered, targetThresholds.maxMissingAltRate);
    actionAdvice.push(
      `Eksik/Alternatif oranı %${missing.toFixed(2)} -> %${targetThresholds.maxMissingAltRate} altına düşürmek için sonraki en az ${k} sipariş sıfır eksik/alternatif ile teslim edilmeli.`
    );
  } else if (delivered >= 20) {
    const buf = getSafeBuffer(missing, delivered, targetThresholds.maxMissingAltRate);
    actionAdvice.push(
      `Eksik/Alternatif oranı güvenli bölgede (%${missing.toFixed(2)} <= %${targetThresholds.maxMissingAltRate}). Seviye bozulmadan en fazla ${buf} eksik/alternatifli siparişe izin var.`
    );
  }

  if (!cancelPassed) {
    const k = getDilutionNeeded(cancel, delivered, targetThresholds.maxSellerCancelRate);
    actionAdvice.push(
      `Satıcı iptal oranı %${cancel.toFixed(2)} -> %${targetThresholds.maxSellerCancelRate} altına inmesi için sonraki en az ${k} siparişte kesinlikle satıcı kaynaklı iptal yapılmamalı.`
    );
  } else if (delivered >= 20) {
    actionAdvice.push(
      `Satıcı iptal oranı başarılı (%${cancel.toFixed(2)} <= %${targetThresholds.maxSellerCancelRate}). Yeni iptallerden kaçınılmalı.`
    );
  }

  if (!returnPassed) {
    const k = getDilutionNeeded(ret, delivered, targetThresholds.maxSellerReturnRate);
    actionAdvice.push(
      `Satıcı iade oranı %${ret.toFixed(2)} -> %${targetThresholds.maxSellerReturnRate} altına inmesi için sonraki en az ${k} sipariş iadesiz tamamlanmalı.`
    );
  }

  const mKey = `Market - ${marketLevel}`;
  const currentComm = COMMISSION_MATRIX[mKey]?.[`Kalite - ${currentLevel}`] || 22.0;
  const targetComm = COMMISSION_MATRIX[mKey]?.[`Kalite - ${targetLevel}`] || 16.25;
  const gain = Math.max(0, currentComm - targetComm);

  return {
    currentLevel,
    targetLevel,
    isQualifiedForTarget: isQualified,
    orderCountDeficit,
    missingAltAnalysis: {
      current: missing,
      target: targetThresholds.maxMissingAltRate,
      passed: missingPassed,
      excessRate: Math.max(0, missing - targetThresholds.maxMissingAltRate),
      consecutiveCleanNeeded: getDilutionNeeded(missing, delivered, targetThresholds.maxMissingAltRate),
      safeBufferRemaining: getSafeBuffer(missing, delivered, targetThresholds.maxMissingAltRate),
    },
    sellerCancelAnalysis: {
      current: cancel,
      target: targetThresholds.maxSellerCancelRate,
      passed: cancelPassed,
      excessRate: Math.max(0, cancel - targetThresholds.maxSellerCancelRate),
      consecutiveCleanNeeded: getDilutionNeeded(cancel, delivered, targetThresholds.maxSellerCancelRate),
      safeBufferRemaining: getSafeBuffer(cancel, delivered, targetThresholds.maxSellerCancelRate),
    },
    sellerReturnAnalysis: {
      current: ret,
      target: targetThresholds.maxSellerReturnRate,
      passed: returnPassed,
      excessRate: Math.max(0, ret - targetThresholds.maxSellerReturnRate),
      consecutiveCleanNeeded: getDilutionNeeded(ret, delivered, targetThresholds.maxSellerReturnRate),
      safeBufferRemaining: getSafeBuffer(ret, delivered, targetThresholds.maxSellerReturnRate),
    },
    actionAdvice,
    estimatedCommissionCurrent: currentComm,
    estimatedCommissionTarget: targetComm,
    commissionGainRate: gain,
  };
}
