import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { OrderStorage } from "@/lib/order-storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
  const agentName = process.env.TRENDYOL_GO_AGENTNAME;
  const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;

  if (!supplierId || !agentName || !executorUser) {
    return NextResponse.json({ success: false, message: "Trendyol kimlik bilgileri eksik." }, { status: 400 });
  }

  try {
    let allPackages: any[] = [];
    let page = 0;
    let totalPages = 1;
    const maxPages = 40; // ~2000 sipariş (tüm havuz)

    console.log(`[Sync] Trendyol Go canlı paketleri Supabase'e senkronize ediliyor...`);

    while (page < totalPages && page < maxPages) {
      const response = await axios.get(
        `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
        {
          headers: {
            Authorization: `Basic ${process.env.TRENDYOL_TOKEN}`,
            "x-agentname": agentName,
            "x-executor-user": executorUser,
          },
          params: { size: 100, page },
        }
      );

      const items = response.data?.content || [];
      if (items.length > 0) {
        allPackages = allPackages.concat(items);
      } else {
        break;
      }

      totalPages = response.data?.totalPages || 1;
      page++;
    }

    console.log(`[Sync] Trendyol'dan ${allPackages.length} paket toplandı. Supabase'e aktarılıyor...`);
    const savedCount = await OrderStorage.upsertPackages(allPackages, "trendyol_sync");

    return NextResponse.json({
      success: true,
      message: `Trendyol'daki ${allPackages.length} canlı sipariş başarıyla Supabase'e aktarıldı. (${savedCount} kayıt işlendi)`,
      totalPackages: allPackages.length,
      savedCount,
    });
  } catch (err: any) {
    console.error("[Sync] Hata:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

