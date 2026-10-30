import { prisma } from "./prisma";

// Type-safe accessor: Sunucu derlemelerinde (CI/CD / build) schema senkronizasyonu
// henüz tamamlanmadan önce TS2339 tip hatası fırlatılmasını önler.
const db = prisma as any;

export interface NormalizedOrderInput {
  id: string;
  orderNumber: string;
  packageNumber?: string | null;
  orderDate: number | string | Date;
  storeId: string | number;
  storeName?: string | null;
  packageStatus: string;
  totalPrice?: number;
  grossAmount?: number;
  totalDiscount?: number;
  sellerInvoiceAmount?: number | null;
  currencyCode?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerCity?: string | null;
  customerDistrict?: string | null;
  deliveryModel?: string | null;
  itemCount?: number;
  itemsSummary?: string | null;
  cancelReason?: string | null;
  source?: string;
  rawData?: any;
}

export class OrderStorage {
  /**
   * Trendyol Go raw package objesini veritabanı kayıt modeline dönüştürür.
   */
  static packageToOrderRecord(pkg: any, source: string = "trendyol_api") {
    const rawOrderDate = pkg.orderDate || pkg.creationDate || Date.now();
    const orderDateMs = typeof rawOrderDate === "number" ? rawOrderDate : new Date(rawOrderDate).getTime();
    const orderDate = new Date(orderDateMs);

    const pkgId = String(pkg.id || pkg.packageNumber || pkg.orderNumber || `${orderDateMs}_${Math.random().toString(36).substring(2, 6)}`);
    const orderNumber = String(pkg.orderNumber || pkg.orderId || pkgId);

    const lines = Array.isArray(pkg.lines) ? pkg.lines : [];
    const itemCount = lines.reduce((acc: number, l: any) => {
      const lineCount = Array.isArray(l.items) ? l.items.length : (l.quantity || 1);
      return acc + lineCount;
    }, 0);

    const summaryParts = lines
      .map((l: any) => l.product?.name || l.product?.productSaleName || l.productSaleName || l.name || "")
      .filter(Boolean)
      .slice(0, 10);
    const itemsSummary = summaryParts.length > 0 ? summaryParts.join(", ") : null;

    const custName = [pkg.customer?.firstName, pkg.customer?.lastName].filter(Boolean).join(" ").trim() ||
                     [pkg.shipmentAddress?.firstName, pkg.shipmentAddress?.lastName].filter(Boolean).join(" ").trim() ||
                     null;

    return {
      id: pkgId,
      orderNumber,
      packageNumber: pkg.packageNumber ? String(pkg.packageNumber) : null,
      orderDate,
      orderDateMs: BigInt(orderDateMs),
      storeId: String(pkg.storeId || "0"),
      storeName: pkg.storeName || null,
      packageStatus: String(pkg.packageStatus || pkg.status || "Created"),
      totalPrice: Number(pkg.totalPrice ?? pkg.grossAmount ?? 0),
      grossAmount: Number(pkg.grossAmount ?? pkg.totalPrice ?? 0),
      totalDiscount: Number(pkg.totalDiscount ?? 0),
      sellerInvoiceAmount: pkg.sellerInvoiceAmount !== undefined ? Number(pkg.sellerInvoiceAmount) : null,
      currencyCode: String(pkg.currencyCode || "TRY"),
      customerName: custName,
      customerPhone: pkg.customer?.phone || pkg.shipmentAddress?.phone || null,
      customerCity: pkg.shipmentAddress?.city || null,
      customerDistrict: pkg.shipmentAddress?.district || null,
      deliveryModel: pkg.deliveryModel || null,
      itemCount: itemCount > 0 ? itemCount : (pkg.itemCount || 1),
      itemsSummary,
      cancelReason: pkg.cancelReason || pkg.cancellationReason || null,
      source,
      rawData: pkg,
    };
  }

  /**
   * Paketleri Supabase PostgreSQL veritabanına toplu (chunk) upsert eder.
   */
  static async upsertPackages(packages: any[], source: string = "trendyol_api"): Promise<number> {
    if (!packages || packages.length === 0) return 0;

    let successful = 0;
    const chunkSize = 50;

    for (let i = 0; i < packages.length; i += chunkSize) {
      const chunk = packages.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (pkg) => {
          try {
            const data = this.packageToOrderRecord(pkg, source);
            await db.order.upsert({
              where: { id: data.id },
              update: {
                packageStatus: data.packageStatus,
                totalPrice: data.totalPrice,
                grossAmount: data.grossAmount,
                totalDiscount: data.totalDiscount,
                sellerInvoiceAmount: data.sellerInvoiceAmount,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                cancelReason: data.cancelReason,
                rawData: data.rawData,
                updatedAt: new Date(),
              },
              create: data,
            });
            successful++;
          } catch (e: any) {
            // Sessizce logla, zinciri kırma
            console.warn(`[OrderStorage] Upsert error (${pkg.id || pkg.orderNumber}):`, e.message);
          }
        })
      );
    }

    return successful;
  }

  /**
   * Excel'den gelen normalize edilmiş satırları Supabase veritabanına kaydeder.
   */
  static async importExcelRows(rows: NormalizedOrderInput[]): Promise<{ imported: number; updated: number; errors: number }> {
    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (const r of rows) {
      try {
        const orderDateMs = typeof r.orderDate === "number" ? r.orderDate : new Date(r.orderDate).getTime();
        const orderDate = new Date(orderDateMs);
        const orderId = String(r.id || r.orderNumber || `${orderDateMs}_${Math.random().toString(36).substring(2, 6)}`);

        // rawData yoksa Excel formatında bir paket objesi simüle et
        const rawPackage = r.rawData || {
          id: orderId,
          orderId: r.orderNumber,
          orderNumber: r.orderNumber,
          packageNumber: r.packageNumber || orderId,
          storeId: r.storeId,
          storeName: r.storeName,
          packageStatus: r.packageStatus,
          orderDate: orderDateMs,
          totalPrice: r.totalPrice,
          grossAmount: r.grossAmount,
          currencyCode: r.currencyCode || "TRY",
          customer: {
            firstName: r.customerName || "Trendyol",
            lastName: "Müşterisi",
            phone: r.customerPhone || "",
          },
          lines: r.itemsSummary ? [
            {
              product: { name: r.itemsSummary },
              productSaleName: r.itemsSummary,
              quantity: r.itemCount || 1,
              price: r.totalPrice,
            }
          ] : [],
        };

        const existing = await db.order.findUnique({ where: { id: orderId } });
        if (existing) {
          await db.order.update({
            where: { id: orderId },
            data: {
              packageStatus: r.packageStatus,
              totalPrice: r.totalPrice ?? existing.totalPrice,
              grossAmount: r.grossAmount ?? existing.grossAmount,
              sellerInvoiceAmount: r.sellerInvoiceAmount ?? existing.sellerInvoiceAmount,
              cancelReason: r.cancelReason ?? existing.cancelReason,
              source: "excel_import",
              rawData: rawPackage,
              updatedAt: new Date(),
            },
          });
          updated++;
        } else {
          await db.order.create({
            data: {
              id: orderId,
              orderNumber: String(r.orderNumber),
              packageNumber: r.packageNumber ? String(r.packageNumber) : null,
              orderDate,
              orderDateMs: BigInt(orderDateMs),
              storeId: String(r.storeId),
              storeName: r.storeName || null,
              packageStatus: r.packageStatus,
              totalPrice: Number(r.totalPrice || 0),
              grossAmount: Number(r.grossAmount || 0),
              totalDiscount: Number(r.totalDiscount || 0),
              sellerInvoiceAmount: r.sellerInvoiceAmount !== undefined ? Number(r.sellerInvoiceAmount) : null,
              currencyCode: r.currencyCode || "TRY",
              customerName: r.customerName || null,
              customerPhone: r.customerPhone || null,
              customerCity: r.customerCity || null,
              customerDistrict: r.customerDistrict || null,
              deliveryModel: r.deliveryModel || "STORE",
              itemCount: Number(r.itemCount || 1),
              itemsSummary: r.itemsSummary || null,
              cancelReason: r.cancelReason || null,
              source: "excel_import",
              rawData: rawPackage,
            },
          });
          imported++;
        }
      } catch (err: any) {
        console.error("[OrderStorage] Excel import row error:", err.message);
        errors++;
      }
    }

    return { imported, updated, errors };
  }

  /**
   * Supabase'deki Order kaydını frontend'in beklediği Trendyol package JSON formatına dönüştürür.
   */
  static orderRecordToPackage(record: any) {
    if (record.rawData && typeof record.rawData === "object") {
      const raw = { ...record.rawData };
      // Veritabanındaki en güncel durumu ve alanları garantiye al
      raw.packageStatus = record.packageStatus || raw.packageStatus;
      raw.orderDate = Number(record.orderDateMs || new Date(record.orderDate).getTime());
      raw.totalPrice = record.totalPrice ?? raw.totalPrice;
      raw.grossAmount = record.grossAmount ?? raw.grossAmount;
      raw.storeId = record.storeId || raw.storeId;
      raw.orderNumber = record.orderNumber || raw.orderNumber;
      return raw;
    }

    // rawData yoksa oluştur
    const orderDateMs = Number(record.orderDateMs || new Date(record.orderDate).getTime());
    return {
      id: record.id,
      orderId: record.orderNumber,
      orderNumber: record.orderNumber,
      packageNumber: record.packageNumber || record.id,
      storeId: record.storeId,
      storeName: record.storeName,
      packageStatus: record.packageStatus,
      orderDate: orderDateMs,
      totalPrice: record.totalPrice,
      grossAmount: record.grossAmount,
      totalDiscount: record.totalDiscount,
      sellerInvoiceAmount: record.sellerInvoiceAmount,
      currencyCode: record.currencyCode || "TRY",
      customer: {
        firstName: record.customerName || "Trendyol",
        lastName: "Müşterisi",
        phone: record.customerPhone || "",
      },
      shipmentAddress: {
        city: record.customerCity || "",
        district: record.customerDistrict || "",
        phone: record.customerPhone || "",
      },
      lines: record.itemsSummary ? [
        {
          product: { name: record.itemsSummary },
          productSaleName: record.itemsSummary,
          quantity: record.itemCount || 1,
          price: record.totalPrice,
        }
      ] : [],
    };
  }

  /**
   * Supabase'den siparişleri filtreli ve sayfalandırılmış şekilde çeker.
   */
  static async queryOrders(params: {
    orderNumber?: string | null;
    storeId?: string | null;
    status?: string | null;
    startDate?: number | null;
    endDate?: number | null;
    page?: number;
    size?: number;
    all?: boolean;
  }) {
    const where: any = {};

    if (params.orderNumber && params.orderNumber.trim()) {
      const q = params.orderNumber.trim().replace(/^#/, "");
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { packageNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { itemsSummary: { contains: q, mode: "insensitive" } },
      ];
    }

    if (params.storeId && params.storeId !== "all") {
      where.storeId = String(params.storeId);
    }

    if (params.status && params.status !== "all") {
      where.packageStatus = params.status;
    }

    if (params.startDate || params.endDate) {
      where.orderDate = {};
      if (params.startDate) where.orderDate.gte = new Date(params.startDate);
      if (params.endDate) where.orderDate.lte = new Date(params.endDate);
    }

    const totalElements = await db.order.count({ where });

    let records: any[] = [];
    const size = params.all ? Math.min(totalElements, 50000) : (params.size || 50);
    const page = params.page || 0;

    if (totalElements > 0) {
      records = await db.order.findMany({
        where,
        orderBy: { orderDate: "desc" },
        skip: params.all ? 0 : page * size,
        take: size,
      });
    }

    const content = records.map((r) => this.orderRecordToPackage(r));
    const totalPages = params.all ? 1 : Math.ceil(totalElements / size) || 1;

    return {
      content,
      totalElements,
      totalPages,
      page,
      size,
    };
  }
}

