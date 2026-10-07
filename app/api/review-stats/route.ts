import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeIdsParam = searchParams.get("storeIds");

  if (!storeIdsParam) {
    return NextResponse.json({ error: "Store IDs belirtilmedi." }, { status: 400 });
  }

  const storeIds = storeIdsParam.split(",");
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID || "658354";
  const apiKey = process.env.TRENDYOL_API_KEY;
  const apiSecret = process.env.TRENDYOL_API_SECRET;
  const token = process.env.TRENDYOL_TOKEN;

  try {
    const cacheKey = `review-stats:${storeIdsParam}`;
    const cachedData = await redis.get(cacheKey).catch(() => null);
    if (cachedData) {
      return NextResponse.json(JSON.parse(cachedData));
    }

    const headers: Record<string, string> = {
      "Authorization": `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
    };
    if (token) headers["Token"] = token;

    // Her şube için stats çek
    const fetchStoreStats = async (storeId: string) => {
      const url = `https://api.tgoapis.com/integrator/review/grocery/suppliers/${supplierId}/stores/${storeId}/reviews/stats`;
      try {
        const response = await axios.get(url, { headers });
        return {
          storeId,
          ...response.data,
        };
      } catch (err: any) {
        console.error(`Store ${storeId} stats error:`, err?.response?.status, err.message);
        return { storeId, averageScores: null, commentCount: 0, ratingCount: 0 };
      }
    };

    const allStats = await Promise.all(storeIds.map(id => fetchStoreStats(id)));

    // Genel ortalama hesapla
    let totalOverall = 0, totalQuality = 0, totalDelivery = 0;
    let totalComments = 0, totalRatings = 0, validStores = 0;

    const storeResults = allStats.map(s => {
      if (s.averageScores) {
        totalOverall += (s.averageScores.overall || 0) * (s.ratingCount || 1);
        totalQuality += (s.averageScores.qualityScore || 0) * (s.ratingCount || 1);
        totalDelivery += (s.averageScores.deliveryScore || 0) * (s.ratingCount || 1);
        totalRatings += s.ratingCount || 0;
        totalComments += s.commentCount || 0;
        validStores++;
      }
      return s;
    });

    const responseData = {
      stores: storeResults,
      overall: {
        averageOverall: totalRatings > 0 ? parseFloat((totalOverall / totalRatings).toFixed(1)) : 0,
        averageQuality: totalRatings > 0 ? parseFloat((totalQuality / totalRatings).toFixed(1)) : 0,
        averageDelivery: totalRatings > 0 ? parseFloat((totalDelivery / totalRatings).toFixed(1)) : 0,
        totalComments,
        totalRatings,
        validStores,
      }
    };

    await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60).catch(() => null);
    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("Review Stats API Hatası:", error?.response?.data || error.message);
    return NextResponse.json(
      { error: "Değerlendirme istatistikleri çekilirken hata oluştu." },
      { status: 500 }
    );
  }
}
