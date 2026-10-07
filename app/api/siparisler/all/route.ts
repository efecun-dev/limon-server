import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const HEADERS_FN = () => ({
  "Authorization": `Basic ${process.env.TRENDYOL_TOKEN}`,
  "x-agentname": process.env.TRENDYOL_GO_AGENTNAME!,
  "x-executor-user": process.env.TRENDYOL_GO_EXECUTOR_USER!,
});

// 2 haftalık pencerelerle belirli bir tarihe kadar tüm siparişleri çeker
async function fetchWindowOrders(
  supplierId: string,
  startMs: number,
  endMs: number
): Promise<any[]> {
  let allContent: any[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    try {
      const res = await axios.get(
        `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
        {
          headers: HEADERS_FN(),
          params: {
            startDate: startMs,
            endDate: endMs,
            size: 200,
            page,
          },
        }
      );
      const content = res.data?.content || [];
      allContent = allContent.concat(content);
      totalPages = res.data?.totalPages || 1;
      page++;
    } catch (err: any) {
      console.error(`fetchWindowOrders hata (page ${page}):`, err?.response?.data || err.message);
      break;
    }
  }

  return allContent;
}

// Bu endpoint belirtilen ay için tüm siparişleri çeker.
// ?year=2026&month=7  (month: 1=Ocak, 12=Aralık)
export async function GET(request: Request) {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  if (!supplierId || !agentName || !executorUser) {
    return NextResponse.json({ content: [], totalElements: 0 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
  // month: 1-12 (kullanıcı dostu format)
  const monthParam = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);

  // Ayın başı ve sonu (önceki ayın son günü de dahil — trend hesabı için)
  const monthStart = new Date(yearParam, monthParam - 1, 1, 0, 0, 0, 0);
  const monthEnd   = new Date(yearParam, monthParam, 0, 23, 59, 59, 999); // ayın son günü
  // Önceki ayın son günü (yeşil/kırmızı trend hesabı için)
  const prevDayStart = new Date(yearParam, monthParam - 1, 0, 0, 0, 0, 0);
  const prevDayEnd   = new Date(yearParam, monthParam - 1, 0, 23, 59, 59, 999);

  const now = new Date();
  const effectiveEnd = monthEnd > now ? now : monthEnd;

  // Cache key: ay bazlı
  const isCurrentMonth =
    monthParam - 1 === now.getMonth() && yearParam === now.getFullYear();
  const cacheKey = `orders:${supplierId}:month:${yearParam}:${monthParam}`;
  const cachedData = await redis.get(cacheKey).catch(() => null);
  if (cachedData) {
    return NextResponse.json(JSON.parse(cachedData));
  }

  try {
    // Ayı 2 haftalık pencerelere böl
    const windows: Array<{ start: number; end: number }> = [];

    // Önceki ayın son günü (trend için)
    windows.push({ start: prevDayStart.getTime(), end: prevDayEnd.getTime() });

    // Ay içindeki 2 haftalık pencereler
    let cursor = monthStart.getTime();
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000 - 1;
    while (cursor <= effectiveEnd.getTime()) {
      const windowEnd = Math.min(cursor + TWO_WEEKS, effectiveEnd.getTime());
      windows.push({ start: cursor, end: windowEnd });
      cursor = windowEnd + 1;
    }

    // Tüm pencereleri paralel çek (max 3 aynı anda — API rate limit)
    const BATCH = 3;
    let allContent: any[] = [];
    for (let i = 0; i < windows.length; i += BATCH) {
      const batch = windows.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(w => fetchWindowOrders(supplierId, w.start, w.end))
      );
      for (const r of results) allContent = allContent.concat(r);
    }

    // Duplicate'leri kaldır (pencere sınırları çakışabilir)
    const seen = new Set<string>();
    allContent = allContent.filter(o => {
      const id = o.id?.toString() || o.orderNumber?.toString();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const responseData = { content: allContent, totalElements: allContent.length };

    // Geçmiş ay → 6 saat cache, mevcut ay → 5 saniye
    const ttl = isCurrentMonth ? 5 : 21600;
    await redis.set(cacheKey, JSON.stringify(responseData), "EX", ttl).catch(() => null);

    return NextResponse.json(responseData);
  } catch (err: any) {
    console.error("Aylık sipariş çekme hatası:", err?.response?.data || err.message);
    return NextResponse.json({ error: "Siparişler çekilemedi." }, { status: 500 });
  }
}
