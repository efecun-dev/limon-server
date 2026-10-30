import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeIdsParam = searchParams.get("storeIds");

  // storeIdsParam boş ise 12 şubenin tamamını varsayılan olarak al
  const storeIds = storeIdsParam
    ? storeIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : Object.keys(BRANCHES);

  if (storeIds.length === 0) {
    return NextResponse.json({ content: [], totalElements: 0, totalPages: 0 });
  }
  const apiKey = process.env.TRENDYOL_API_KEY;
  const apiSecret = process.env.TRENDYOL_API_SECRET;
  const token = process.env.TRENDYOL_TOKEN;

  try {
    const cacheKey = `reviews:${storeIdsParam}`;
    const cachedData = await redis.get(cacheKey).catch(() => null);
    if (cachedData) {
      return NextResponse.json(JSON.parse(cachedData));
    }

    const headers = {
      "Authorization": `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      "Token": token,
    };

    // Her şube için tüm sayfaları çeken fonksiyon
    const fetchStoreReviews = async (storeId: string) => {
      const url = `https://api.tgoapis.com/integrator/review/grocery/suppliers/658354/stores/${storeId}/reviews/filter`;
      try {
        const firstResponse = await axios.get(`${url}?page=0&size=200`, { headers });
        const firstData = firstResponse.data;
        let content = [...(firstData.content || [])];
        const totalPages = firstData.totalPages || 1;

        if (totalPages > 1) {
          const requests = [];
          for (let i = 1; i < totalPages; i++) {
            requests.push(axios.get(`${url}?page=${i}&size=200`, { headers }));
          }
          const responses = await Promise.all(requests);
          for (const res of responses) {
            if (res.data && res.data.content) {
              content = content.concat(res.data.content);
            }
          }
        }
        return content;
      } catch (err: any) {
        console.error(`Store ${storeId} fetching error:`, err.message);
        return [];
      }
    };

    // Bütün şubeleri paralel olarak çek
    const allStorePromises = storeIds.map((id) => fetchStoreReviews(id));
    const allStoreResults = await Promise.all(allStorePromises);

    // Sonuçları tek bir dizide birleştir
    let combinedContent: any[] = [];
    allStoreResults.forEach((content) => {
      combinedContent = combinedContent.concat(content);
    });

    const responseData = {
      content: combinedContent,
      totalElements: combinedContent.length,
      totalPages: 1,
    };

    // Cache for 180 seconds (3 minutes) to avoid hitting API limit
    await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 180).catch(() => null);

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("API Hatası:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Genel veri çekilirken hata oluştu", details: error.response?.data || error.message },
      { status: error.response?.status || 500 }
    );
  }
}
