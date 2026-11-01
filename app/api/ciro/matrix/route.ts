import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";

interface BranchData {
  branchId: string;
  branchName: string;
  total: number;
  orderCount: number;
  completedOrders: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  avgOrderValue: number;
  avgDailyCiro: number;
  days: Record<string, number>;
  orderCounts: Record<string, number>;
  prevCutoffTotal: number;
}

// ── Kurye Yoğunluğu İptal Analizi (Bölüm 1.1 Kuralı) ──
function classifyCancellation(order: any): { source: "TRENDYOL" | "STORE" | "CUSTOMER"; reason: string } {
  const reason = (
    order.cancelInfo?.reason ||
    order.cancellationReason ||
    order.cancellationNote ||
    ""
  ).toLowerCase();

  const courierKeywords = [
    "kurye",
    "kurye yetersiz",
    "kurye yoğun",
    "kurye bulunamadı",
    "kurye atanamadı",
    "kurye operasyonel",
    "yoğunluk sebebiyle",
    "kapasite aşıldı",
    "kurye gecikmesi",
    "tgo",
  ];

  const storeKeywords = ["stok", "ürün yok", "tedarik", "mağaza kapalı", "mağaza iptal", "hazırlanamadı"];

  for (const kw of courierKeywords) {
    if (reason.includes(kw)) {
      return { source: "TRENDYOL", reason: order.cancelInfo?.reason || "Kurye Yoğunluğu / Kurye Yetersizliği" };
    }
  }

  for (const kw of storeKeywords) {
    if (reason.includes(kw)) {
      return { source: "STORE", reason: order.cancelInfo?.reason || "Mağaza / Tedarik Kaynaklı İptal" };
    }
  }

  return { source: "CUSTOMER", reason: order.cancelInfo?.reason || "Müşteri / Diğer İptal" };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "current";
    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = `ciro_matrix_server_${period}`;

    // 1. Önbellek Denetimi (Redis)
    if (!refresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return NextResponse.json({ ...parsed, cached: true, cacheSource: "redis" });
        }
      } catch (e) {}
    }

    // 2. Gün Aralığı ve Tarih Listesi Hesabı
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0 = Ocak, 10 = Kasım

    if (period.startsWith("month-")) {
      const parts = period.replace("month-", "").split("-");
      if (parts.length === 2) {
        year = parseInt(parts[0], 10) || year;
        month = parseInt(parts[1], 10);
      }
    }

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const activeDayLimit = isCurrentMonth ? now.getDate() : daysInMonth;

    const daysList: Array<{
      key: string;
      dayOfMonth: number;
      dateStr: string;
      fullLabel: string;
      weekdayName: string;
      monthName: string;
      isToday: boolean;
    }> = [];

    const TURKISH_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const TURKISH_DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d);
      const isToday = isCurrentMonth && d === now.getDate();
      const padDay = String(d).padStart(2, "0");
      const padMonth = String(month + 1).padStart(2, "0");
      const key = `${year}-${padMonth}-${padDay}`;

      daysList.push({
        key,
        dayOfMonth: d,
        dateStr: key,
        fullLabel: `${d} ${TURKISH_MONTHS[month]} ${TURKISH_DAYS[curDate.getDay()]}`,
        weekdayName: TURKISH_DAYS[curDate.getDay()],
        monthName: TURKISH_MONTHS[month],
        isToday,
      });
    }

    // 3. Sipariş Verilerini Limon Server Önbelleğinden / API'den Al
    let allOrders: any[] = [];
    try {
      const ordersCache = await redis.get("orders_full_35days");
      if (ordersCache) {
        allOrders = JSON.parse(ordersCache);
      }
    } catch (e) {}

    // 4. Şube Matrisi Veri Yapısı
    const branchMap: Record<string, BranchData> = {};
    for (const [id, name] of Object.entries(BRANCHES)) {
      const daysObj: Record<string, number> = {};
      const orderCountsObj: Record<string, number> = {};
      for (const day of daysList) {
        daysObj[day.key] = 0;
        orderCountsObj[day.key] = 0;
      }

      branchMap[id] = {
        branchId: id,
        branchName: name,
        total: 0,
        orderCount: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        cancelledRevenue: 0,
        avgOrderValue: 0,
        avgDailyCiro: 0,
        days: daysObj,
        orderCounts: orderCountsObj,
        prevCutoffTotal: 0,
      };
    }

    // 5. Siparişleri Sunucu Tarafında İncele, Filtrele ve Matrise Ekle
    let totalCourierCancelled = 0;
    let totalStoreCancelled = 0;
    let totalCustomerCancelled = 0;

    for (const order of allOrders) {
      const storeId = String(order.storeId || "");
      if (!branchMap[storeId]) continue;

      const orderTime = order.orderDate || order.creationDate;
      if (!orderTime) continue;

      const orderDate = new Date(orderTime);
      if (orderDate.getFullYear() !== year || orderDate.getMonth() !== month) continue;

      const padDay = String(orderDate.getDate()).padStart(2, "0");
      const padMonth = String(month + 1).padStart(2, "0");
      const dayKey = `${year}-${padMonth}-${padDay}`;

      const status = order.packageStatus || order.status || "";
      const isDelivered = status === "Delivered" || status === "Shipped" || status === "Invoiced";
      const isCancelled = status === "Cancelled" || status === "UnSupplied";

      const bData = branchMap[storeId];
      bData.orderCount++;

      if (isCancelled) {
        bData.cancelledOrders++;
        const cancelClass = classifyCancellation(order);
        if (cancelClass.source === "TRENDYOL") totalCourierCancelled++;
        else if (cancelClass.source === "STORE") totalStoreCancelled++;
        else totalCustomerCancelled++;

        const rev = Number(order.totalPrice || order.grossAmount || 0);
        bData.cancelledRevenue += rev;
      } else if (isDelivered) {
        bData.completedOrders++;
        const rev = Number(order.grossAmount || order.totalPrice || 0);
        bData.total += rev;
        if (bData.days[dayKey] !== undefined) {
          bData.days[dayKey] += rev;
          bData.orderCounts[dayKey]++;
        }
      }
    }

    // 6. Şube Ortalamaları ve Genel Toplam Hesaplamaları
    const branchRows = Object.values(branchMap);
    const totalRowDays: Record<string, number> = {};
    const totalRowOrderCounts: Record<string, number> = {};
    for (const day of daysList) {
      totalRowDays[day.key] = 0;
      totalRowOrderCounts[day.key] = 0;
    }

    let overallTotalRevenue = 0;
    let overallCompletedOrders = 0;

    for (const b of branchRows) {
      b.avgDailyCiro = activeDayLimit > 0 ? Math.round(b.total / activeDayLimit) : 0;
      b.avgOrderValue = b.completedOrders > 0 ? Math.round(b.total / b.completedOrders) : 0;
      overallTotalRevenue += b.total;
      overallCompletedOrders += b.completedOrders;

      for (const day of daysList) {
        totalRowDays[day.key] += b.days[day.key];
        totalRowOrderCounts[day.key] += b.orderCounts[day.key];
      }
    }

    const overallAvgDailyCiro = activeDayLimit > 0 ? Math.round(overallTotalRevenue / activeDayLimit) : 0;

    const totalRow = {
      branchName: "GENEL TOPLAM",
      total: overallTotalRevenue,
      avgDailyCiro: overallAvgDailyCiro,
      days: totalRowDays,
      orderCounts: totalRowOrderCounts,
    };

    const result = {
      success: true,
      period,
      year,
      month,
      monthName: TURKISH_MONTHS[month],
      activeDayLimit,
      daysList,
      branchRows: branchRows.sort((a, b) => b.total - a.total),
      totalRow,
      summary: {
        totalRevenue: overallTotalRevenue,
        completedOrders: overallCompletedOrders,
        avgDailyCiro: overallAvgDailyCiro,
        courierCancelledCount: totalCourierCancelled,
        storeCancelledCount: totalStoreCancelled,
        customerCancelledCount: totalCustomerCancelled,
      },
      calculatedAt: new Date().toISOString(),
    };

    // Redis Önbellek Kaydı: Geçmiş aylar için 7 gün, mevcut ay için 15 dakika
    const ttlSeconds = isCurrentMonth ? 900 : 7 * 24 * 60 * 60;
    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", ttlSeconds);
    } catch (e) {}

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[CiroMatrix API] Sunucu Hesaplama Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Ciro matrisi sunucuda hesaplanamadı." },
      { status: 500 }
    );
  }
}
