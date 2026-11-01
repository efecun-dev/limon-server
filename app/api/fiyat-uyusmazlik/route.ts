import { NextResponse } from "next/server";
import axios from "axios";
import { redis } from "@/lib/redis";
import { BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";
    const cacheKey = "price_anomalies_server_cache";

    if (!refresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch (e) {}
    }

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
    const token = process.env.TRENDYOL_TOKEN;

    if (!supplierId || !agentName || !executorUser || !token) {
      return NextResponse.json(
        { success: false, error: "Trendyol GO API kimlik bilgileri eksik." },
        { status: 500 }
      );
    }

    const headers = {
      Authorization: `Basic ${token}`,
      "x-agentname": agentName,
      "x-executor-user": executorUser,
    };

    const branchList = Object.entries(BRANCHES).map(([id, name]) => ({ id, name }));
    const productMap = new Map<string, any>();

    // Şubelerden paralel ürün & fiyat çekimi (İlk 100 ürün üzerinden katalog taraması)
    const storePromises = branchList.map(async (branch) => {
      try {
        const res = await axios.get(
          `https://api.tgoapis.com/integrator/product/grocery/suppliers/${supplierId}/stores/${branch.id}/products`,
          {
            headers,
            params: {
              size: 100,
              page: 0,
            },
            timeout: 12000,
          }
        );
        return {
          storeId: branch.id,
          storeName: branch.name,
          products: res.data?.content || [],
        };
      } catch (err: any) {
        console.warn(`[FiyatUyuşmazlık] Şube ${branch.id} (${branch.name}) çekilemedi:`, err.message);
        return {
          storeId: branch.id,
          storeName: branch.name,
          products: [],
        };
      }
    });

    const storeResults = await Promise.all(storePromises);

    for (const storeData of storeResults) {
      const storeId = storeData.storeId;
      for (const p of storeData.products) {
        const barcode = (p.barcode || "").trim();
        if (!barcode) continue;

        if (!productMap.has(barcode)) {
          productMap.set(barcode, {
            id: p.id || barcode,
            barcode,
            title: p.title || p.description || "İsimsiz Ürün",
            brand: p.brand?.name || (typeof p.brand === "string" ? p.brand : null),
            category: p.category?.name || (typeof p.category === "string" ? p.category : null),
            imageUrl: p.images?.[0]?.url || p.imageUrl || null,
            totalStock: 0,
            stocksByBranch: {} as Record<string, { price: number | null; quantity: number | null; onSale: boolean }>,
          });
        }

        const entry = productMap.get(barcode)!;
        const price = typeof p.sellingPrice === "number" && p.sellingPrice > 0 ? p.sellingPrice : null;
        const qty = typeof p.quantity === "number" ? p.quantity : 0;

        entry.stocksByBranch[storeId] = {
          price,
          quantity: qty,
          onSale: p.onSale ?? false,
        };
        entry.totalStock += qty;
      }
    }

    // Uyuşmazlık Analiz Motoru
    const anomalies: any[] = [];
    let totalAnomalies = 0;
    let highRiskCount = 0;
    let missingPriceCount = 0;

    for (const p of productMap.values()) {
      const validPrices: number[] = [];
      let undefinedCount = 0;

      const branchPrices: Record<
        string,
        { price: number | null; quantity: number | null; onSale: boolean; isMin: boolean; isMax: boolean }
      > = {};

      for (const branch of branchList) {
        const stockInfo = p.stocksByBranch[branch.id];
        const pr = stockInfo?.price ?? null;

        if (pr !== null && pr > 0) {
          validPrices.push(pr);
        } else {
          undefinedCount++;
        }

        branchPrices[branch.id] = {
          price: pr,
          quantity: stockInfo?.quantity ?? null,
          onSale: stockInfo?.onSale ?? false,
          isMin: false,
          isMax: false,
        };
      }

      if (validPrices.length === 0) continue;

      const minPrice = Math.min(...validPrices);
      const maxPrice = Math.max(...validPrices);
      const priceDiff = maxPrice - minPrice;
      const diffPercent = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;
      const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      const isMismatch = priceDiff > 0.05 || undefinedCount > 0;

      if (isMismatch) {
        totalAnomalies++;
        if (diffPercent >= 20) highRiskCount++;
        if (undefinedCount > 0) missingPriceCount++;

        // Min ve Max şubeleri işaretle
        for (const branch of branchList) {
          const bp = branchPrices[branch.id];
          if (bp && bp.price !== null) {
            if (bp.price === minPrice) bp.isMin = true;
            if (bp.price === maxPrice) bp.isMax = true;
          }
        }
      }

      anomalies.push({
        id: p.id,
        barcode: p.barcode,
        title: p.title,
        brand: p.brand,
        category: p.category,
        imageUrl: p.imageUrl,
        totalStock: p.totalStock,
        minPrice,
        maxPrice,
        priceDiff,
        diffPercent,
        avgPrice,
        isMismatch,
        status: isMismatch ? "Uyuşmazlık" : "Uyumlu",
        undefinedCount,
        branchPrices,
      });
    }

    const result = {
      success: true,
      summary: {
        totalScanned: productMap.size,
        totalAnomalies,
        highRiskCount,
        missingPriceCount,
      },
      branches: branchList,
      anomalies: anomalies.sort((a, b) => b.priceDiff - a.priceDiff),
      scannedAt: new Date().toISOString(),
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
    } catch (e) {}

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[FiyatUyuşmazlık API] Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Fiyat uyuşmazlık verileri hesaplanamadı." },
      { status: 500 }
    );
  }
}
