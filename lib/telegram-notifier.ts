import axios from "axios";
import fs from "fs";
import path from "path";
import { BRANCHES } from "@/lib/branches";
import { sendTelegramMessage } from "@/lib/telegram";
import { redis } from "@/lib/redis";

export interface TelegramNotifierConfig {
  orderPollIntervalMs: number; // default: 800ms
  reviewPollIntervalMs: number; // default: 30000ms (30s)
  claimPollIntervalMs: number; // default: 15000ms (15s)
  enabled: boolean;
  notifyNewOrders: boolean;
  notifyCancelledOrders: boolean;
  notifyReviews: boolean;
  notifyClaims: boolean;
}

export interface NotifierEventLog {
  id: string;
  type: "order" | "cancel" | "review" | "claim" | "system";
  title: string;
  message: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface NotifierStats {
  ordersCheckedCount: number;
  newOrdersSent: number;
  cancelledOrdersSent: number;
  reviewsSent: number;
  claimsSent: number;
  lastOrderCheckAt: number | null;
  lastReviewCheckAt: number | null;
  lastClaimCheckAt: number | null;
  lastError: string | null;
  startedAt: number | null;
}

// Güvenli HTML kaçırma fonksiyonu (Telegram HTML parse hatalarını önler)
function escapeHtml(text: any): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class TelegramNotifierEngine {
  private config: TelegramNotifierConfig = {
    orderPollIntervalMs: 800, // 800ms anlık kontrol
    reviewPollIntervalMs: 30000, // 30 saniye
    claimPollIntervalMs: 15000, // 15 saniye
    enabled: true,
    notifyNewOrders: true,
    notifyCancelledOrders: true,
    notifyReviews: true,
    notifyClaims: true,
  };

  private stats: NotifierStats = {
    ordersCheckedCount: 0,
    newOrdersSent: 0,
    cancelledOrdersSent: 0,
    reviewsSent: 0,
    claimsSent: 0,
    lastOrderCheckAt: null,
    lastReviewCheckAt: null,
    lastClaimCheckAt: null,
    lastError: null,
    startedAt: null,
  };

  private isRunning = false;
  private isBootstrapped = false;
  private isCheckingOrders = false;
  private isCheckingReviews = false;
  private isCheckingClaims = false;

  private orderTimer: NodeJS.Timeout | null = null;
  private reviewTimer: NodeJS.Timeout | null = null;
  private claimTimer: NodeJS.Timeout | null = null;

  // Bellek içi tekilleştirme setleri
  private processedOrderIds = new Set<string>();
  private processedCancelIds = new Set<string>();
  private processedReviewIds = new Set<string>();
  private processedClaimIds = new Set<string>();

  // Son 50 bildirim logu
  private eventLogs: NotifierEventLog[] = [];

  private stateFilePath = path.join(process.cwd(), "data", "telegram-state.json");

  constructor() {
    this.loadStateFromFile();
  }

  // Kalıcı durumu dosyadan oku
  private loadStateFromFile() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, "utf8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.orders)) data.orders.forEach((id: string) => this.processedOrderIds.add(id));
        if (Array.isArray(data.cancels)) data.cancels.forEach((id: string) => this.processedCancelIds.add(id));
        if (Array.isArray(data.reviews)) data.reviews.forEach((id: string) => this.processedReviewIds.add(id));
        if (Array.isArray(data.claims)) data.claims.forEach((id: string) => this.processedClaimIds.add(id));
        console.log(`[TelegramNotifier] Durum yüklendi: ${this.processedOrderIds.size} sipariş, ${this.processedReviewIds.size} yorum, ${this.processedClaimIds.size} iade`);
      }
    } catch (e) {
      console.error("[TelegramNotifier] State dosyası okuma hatası:", e);
    }
  }

  // Kalıcı durumu diske yaz (son 2000 kaydı sakla)
  private saveStateToFile() {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const trimSet = (s: Set<string>, limit = 2000) => Array.from(s).slice(-limit);

      const payload = {
        updatedAt: new Date().toISOString(),
        orders: trimSet(this.processedOrderIds),
        cancels: trimSet(this.processedCancelIds),
        reviews: trimSet(this.processedReviewIds),
        claims: trimSet(this.processedClaimIds),
      };

      fs.writeFileSync(this.stateFilePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (e) {
      console.error("[TelegramNotifier] State dosyası kaydetme hatası:", e);
    }
  }

  private addLog(entry: Omit<NotifierEventLog, "id" | "timestamp">) {
    const logItem: NotifierEventLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      ...entry,
    };
    this.eventLogs.unshift(logItem);
    if (this.eventLogs.length > 50) {
      this.eventLogs.pop();
    }
  }

  // Redis ve bellek üzerinden tekilleştirme kontrolü
  private async isAlreadyNotified(typeKey: string, id: string): Promise<boolean> {
    const memSet =
      typeKey === "order"
        ? this.processedOrderIds
        : typeKey === "cancel"
        ? this.processedCancelIds
        : typeKey === "review"
        ? this.processedReviewIds
        : this.processedClaimIds;

    if (memSet.has(id)) return true;

    // Redis kontrolü (varsa)
    try {
      const redisKey = `telegram_notified_${typeKey}_${id}`;
      const exists = await redis.get(redisKey);
      if (exists) {
        memSet.add(id);
        return true;
      }
    } catch {}

    return false;
  }

  // Bildirildi olarak işaretle
  private async markAsNotified(typeKey: string, id: string): Promise<void> {
    const memSet =
      typeKey === "order"
        ? this.processedOrderIds
        : typeKey === "cancel"
        ? this.processedCancelIds
        : typeKey === "review"
        ? this.processedReviewIds
        : this.processedClaimIds;

    memSet.add(id);

    try {
      const redisKey = `telegram_notified_${typeKey}_${id}`;
      // 7 gün boyunca sakla
      await redis.set(redisKey, "1", "EX", 604800);
    } catch {}

    this.saveStateToFile();
  }

  // Başlangıçta mevcut son siparişleri, yorumları ve iadeleri belleğe alarak eski verilerin Telegram'a yağmasını önler
  private async bootstrapBaseline(): Promise<void> {
    if (this.isBootstrapped) return;
    console.log("[TelegramNotifier] Başlangıç verileri taranıyor (Eski verilerin bildirim atması engelleniyor)...");

    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
    const token = process.env.TRENDYOL_TOKEN;
    const apiKey = process.env.TRENDYOL_API_KEY;
    const apiSecret = process.env.TRENDYOL_API_SECRET;

    if (!supplierId || !token) {
      console.warn("[TelegramNotifier] Trendyol kimlik bilgileri eksik, baseline atlanıyor.");
      this.isBootstrapped = true;
      return;
    }

    try {
      // 1. Son 20 siparişi belleğe al
      const ordersRes = await axios.get(
        `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
        {
          headers: {
            Authorization: `Basic ${token}`,
            "x-agentname": agentName || "Ofis",
            "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
          },
          params: { size: 20, page: 0 },
          timeout: 8000,
        }
      ).catch(() => null);

      if (ordersRes?.data?.content) {
        ordersRes.data.content.forEach((pkg: any) => {
          const num = pkg.orderNumber?.toString();
          if (num) {
            this.processedOrderIds.add(num);
            if (pkg.packageStatus === "Cancelled" || pkg.packageStatus === "UnSupplied") {
              this.processedCancelIds.add(num);
            }
          }
        });
      }

      // 2. Son iadeleri belleğe al
      const claimsRes = await axios.get(
        `https://api.tgoapis.com/integrator/claim/grocery/suppliers/${supplierId}/claims`,
        {
          headers: {
            Authorization: `Basic ${token}`,
            "x-agentname": agentName || "Ofis",
            "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
          },
          params: { size: 20, page: 0 },
          timeout: 8000,
        }
      ).catch(() => null);

      if (claimsRes?.data?.content) {
        claimsRes.data.content.forEach((claim: any) => {
          const claimId = claim.id?.toString();
          if (claimId) this.processedClaimIds.add(claimId);
        });
      }

      // 3. Her şubenin son 5 yorumunu belleğe al
      if (apiKey && apiSecret) {
        const storeIds = Object.keys(BRANCHES);
        await Promise.all(
          storeIds.map(async (storeId) => {
            try {
              const revRes = await axios.get(
                `https://api.tgoapis.com/integrator/review/grocery/suppliers/${supplierId}/stores/${storeId}/reviews/filter?page=0&size=5`,
                {
                  headers: {
                    Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
                    Token: token,
                  },
                  timeout: 8000,
                }
              );
              if (revRes?.data?.content) {
                revRes.data.content.forEach((rev: any) => {
                  if (rev.reviewId) this.processedReviewIds.add(rev.reviewId.toString());
                });
              }
            } catch {}
          })
        );
      }

      this.saveStateToFile();
      this.isBootstrapped = true;
      console.log(`[TelegramNotifier] Baseline başarıyla tamamlandı. Canlı bildirimler aktif! (Sipariş: ${this.processedOrderIds.size}, Yorum: ${this.processedReviewIds.size}, İade: ${this.processedClaimIds.size})`);
    } catch (e: any) {
      console.error("[TelegramNotifier] Baseline oluşturma hatası:", e.message);
      this.isBootstrapped = true;
    }
  }

  // ==========================================
  // 1. SİPARİŞ & İPTAL TARAMA DÖNGÜSÜ (ANLIK 500-800MS)
  // ==========================================
  private async checkOrdersLoop() {
    if (!this.isRunning || !this.config.enabled) return;

    if (!this.isCheckingOrders) {
      this.isCheckingOrders = true;
      try {
        await this.checkOrdersOnce();
      } catch (err: any) {
        this.stats.lastError = `Sipariş Tarama: ${err.message}`;
      } finally {
        this.isCheckingOrders = false;
      }
    }

    // Bir sonraki taramayı planla (asenkron örtüşmeyi önleyen self-scheduling)
    if (this.isRunning && this.config.enabled) {
      this.orderTimer = setTimeout(() => {
        this.checkOrdersLoop();
      }, this.config.orderPollIntervalMs);
    }
  }

  private async checkOrdersOnce() {
    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
    const token = process.env.TRENDYOL_TOKEN;

    if (!supplierId || !token) return;

    this.stats.ordersCheckedCount++;
    this.stats.lastOrderCheckAt = Date.now();

    try {
      const res = await axios.get(
        `https://api.tgoapis.com/integrator/order/grocery/suppliers/${supplierId}/packages`,
        {
          headers: {
            Authorization: `Basic ${token}`,
            "x-agentname": agentName || "Ofis",
            "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
          },
          params: { size: 10, page: 0 },
          timeout: 5000,
        }
      );

      const packages = res.data?.content || [];
      if (!Array.isArray(packages) || packages.length === 0) return;

      for (const pkg of packages) {
        const orderNumber = pkg.orderNumber?.toString();
        if (!orderNumber) continue;

        // A. YENİ SİPARİŞ KONTROLÜ (Created)
        if (this.config.notifyNewOrders && pkg.packageStatus === "Created") {
          const already = await this.isAlreadyNotified("order", orderNumber);
          if (!already) {
            await this.markAsNotified("order", orderNumber);
            await this.sendNewOrderNotification(pkg);
          }
        }

        // B. İPTAL / TEDARİK EDİLEMEDİ SİPARİŞ KONTROLÜ
        if (
          this.config.notifyCancelledOrders &&
          (pkg.packageStatus === "Cancelled" || pkg.packageStatus === "UnSupplied")
        ) {
          const cancelAlready = await this.isAlreadyNotified("cancel", orderNumber);
          if (!cancelAlready) {
            await this.markAsNotified("cancel", orderNumber);
            await this.sendCancelledOrderNotification(pkg);
          }
        }
      }
    } catch (error: any) {
      // 429 Rate Limit durumunda kısa süre nefes al
      if (error?.response?.status === 429) {
        console.warn("[TelegramNotifier] Trendyol 429 Rate Limit uyarısı. 3 saniye bekleniyor...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        // Geçici timeout, sessizce es geç
      } else {
        console.error("[TelegramNotifier] Sipariş kontrol hatası:", error?.response?.data || error.message);
      }
    }
  }

  // ==========================================
  // 2. YORUM TARAMA DÖNGÜSÜ (30 SANİYE)
  // ==========================================
  private async checkReviewsLoop() {
    if (!this.isRunning || !this.config.enabled || !this.config.notifyReviews) return;

    if (!this.isCheckingReviews) {
      this.isCheckingReviews = true;
      try {
        await this.checkReviewsOnce();
      } catch (err: any) {
        this.stats.lastError = `Yorum Tarama: ${err.message}`;
      } finally {
        this.isCheckingReviews = false;
      }
    }

    if (this.isRunning && this.config.enabled) {
      this.reviewTimer = setTimeout(() => {
        this.checkReviewsLoop();
      }, this.config.reviewPollIntervalMs);
    }
  }

  private async checkReviewsOnce() {
    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const apiKey = process.env.TRENDYOL_API_KEY;
    const apiSecret = process.env.TRENDYOL_API_SECRET;
    const token = process.env.TRENDYOL_TOKEN;

    if (!supplierId || !apiKey || !apiSecret || !token) return;

    this.stats.lastReviewCheckAt = Date.now();
    const headers = {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      Token: token,
    };

    const storeIds = Object.keys(BRANCHES);

    for (const storeId of storeIds) {
      try {
        const url = `https://api.tgoapis.com/integrator/review/grocery/suppliers/${supplierId}/stores/${storeId}/reviews/filter?page=0&size=5`;
        const res = await axios.get(url, { headers, timeout: 6000 });
        const reviews = res.data?.content || [];

        for (const rev of reviews) {
          const revId = rev.reviewId?.toString();
          if (!revId) continue;

          const already = await this.isAlreadyNotified("review", revId);
          if (!already) {
            await this.markAsNotified("review", revId);
            const branchName = BRANCHES[storeId] || `Şube ${storeId}`;
            await this.sendReviewNotification(rev, branchName);
          }
        }
      } catch {}
    }
  }

  // ==========================================
  // 3. İADE TARAMA DÖNGÜSÜ (15 SANİYE)
  // ==========================================
  private async checkClaimsLoop() {
    if (!this.isRunning || !this.config.enabled || !this.config.notifyClaims) return;

    if (!this.isCheckingClaims) {
      this.isCheckingClaims = true;
      try {
        await this.checkClaimsOnce();
      } catch (err: any) {
        this.stats.lastError = `İade Tarama: ${err.message}`;
      } finally {
        this.isCheckingClaims = false;
      }
    }

    if (this.isRunning && this.config.enabled) {
      this.claimTimer = setTimeout(() => {
        this.checkClaimsLoop();
      }, this.config.claimPollIntervalMs);
    }
  }

  private async checkClaimsOnce() {
    const supplierId = process.env.TRENDYOL_GO_SUPPLIER_ID;
    const agentName = process.env.TRENDYOL_GO_AGENTNAME;
    const executorUser = process.env.TRENDYOL_GO_EXECUTOR_USER;
    const token = process.env.TRENDYOL_TOKEN;

    if (!supplierId || !token) return;

    this.stats.lastClaimCheckAt = Date.now();

    try {
      const res = await axios.get(
        `https://api.tgoapis.com/integrator/claim/grocery/suppliers/${supplierId}/claims`,
        {
          headers: {
            Authorization: `Basic ${token}`,
            "x-agentname": agentName || "Ofis",
            "x-executor-user": executorUser || "limonsupermarket@hotmail.com",
          },
          params: { size: 10, page: 0 },
          timeout: 6000,
        }
      );

      const claims = res.data?.content || [];

      for (const claim of claims) {
        const claimId = claim.id?.toString();
        if (!claimId) continue;

        const already = await this.isAlreadyNotified("claim", claimId);
        if (!already) {
          await this.markAsNotified("claim", claimId);
          await this.sendClaimNotification(claim);
        }
      }
    } catch {}
  }

  // ==========================================
  // MESAJ OLUŞTURMA VE GÖNDERME FONKSİYONLARI
  // ==========================================

  // 1. Yeni Sipariş Mesajı
  public async sendNewOrderNotification(pkg: any): Promise<boolean> {
    try {
      const orderNumber = pkg.orderNumber || pkg.id || "Bilinmiyor";
      const storeId = pkg.storeId?.toString();
      const branchName = (storeId && BRANCHES[storeId]) ? BRANCHES[storeId] : (storeId || "Bilinmiyor");
      const customer = pkg.customer || {};
      const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Gizli Müşteri";
      const totalPrice = (pkg.totalPrice !== undefined ? Number(pkg.totalPrice).toFixed(2) : "0.00");
      const currency = pkg.currencyCode || "TL";
      const note = customer.note || pkg.customerNote || "";
      const eta = pkg.eta ? `${pkg.eta}` : "";
      const scheduleType = pkg.scheduleType === "INSTANT" ? "Hemen Teslimat" : (pkg.scheduleType || "");
      const district = pkg.shipmentAddress?.district || "";
      const neighborhood = pkg.shipmentAddress?.neighborhood || "";

      let itemsStr = "";
      if (Array.isArray(pkg.lines) && pkg.lines.length > 0) {
        const displayLimit = 12;
        const visibleLines = pkg.lines.slice(0, displayLimit);
        visibleLines.forEach((line: any) => {
          const qty = line.items?.length || 1;
          const name = escapeHtml(line.product?.name || "Ürün");
          const price = line.price !== undefined ? `${Number(line.price).toFixed(2)} TL` : "";
          itemsStr += `▪️ <b>${qty}x</b> ${name} ${price ? `(<i>${price}</i>)` : ""}\n`;
        });

        if (pkg.lines.length > displayLimit) {
          itemsStr += `▫️ <i>... ve ${pkg.lines.length - displayLimit} diğer ürün</i>\n`;
        }
      }

      let msg = `🚨 <b>YENİ SİPARİŞ DÜŞTÜ!</b>\n\n` +
                `📦 <b>Sipariş No:</b> <code>#${escapeHtml(orderNumber)}</code>\n` +
                `🏪 <b>Şube:</b> <b>${escapeHtml(branchName)}</b>\n` +
                `💰 <b>Tutar:</b> <b>${escapeHtml(totalPrice)} ${escapeHtml(currency)}</b>\n` +
                `👤 <b>Müşteri:</b> ${escapeHtml(customerName)}\n`;

      if (district || neighborhood) {
        msg += `📍 <b>Bölge:</b> ${escapeHtml([district, neighborhood].filter(Boolean).join(" / "))}\n`;
      }

      if (eta || scheduleType) {
        msg += `🕒 <b>Teslimat:</b> ${escapeHtml([eta, scheduleType].filter(Boolean).join(" - "))}\n`;
      }

      if (note) {
        msg += `\n📝 <b>Müşteri Notu:</b> <i>"${escapeHtml(note)}"</i>\n`;
      }

      if (itemsStr) {
        msg += `\n🛒 <b>Sipariş İçeriği (${pkg.lines?.length || 0} Kalem):</b>\n${itemsStr}`;
      }

      msg += `\n⚡ <i>Limon Server • Anlık Bildirim</i>`;

      const success = await sendTelegramMessage(msg);
      if (success) {
        this.stats.newOrdersSent++;
        this.addLog({
          type: "order",
          title: `Yeni Sipariş: #${orderNumber}`,
          message: `${branchName} - ${totalPrice} ${currency}`,
          success: true,
        });
      } else {
        this.addLog({
          type: "order",
          title: `Yeni Sipariş Gönderilemedi: #${orderNumber}`,
          message: "Telegram API isteği başarısız oldu",
          success: false,
          error: "Telegram API failed",
        });
      }
      return success;
    } catch (e: any) {
      console.error("[TelegramNotifier] sendNewOrderNotification hatası:", e);
      return false;
    }
  }

  // 2. İptal Sipariş Mesajı
  public async sendCancelledOrderNotification(pkg: any): Promise<boolean> {
    try {
      const orderNumber = pkg.orderNumber || pkg.id || "Bilinmiyor";
      const storeId = pkg.storeId?.toString();
      const branchName = (storeId && BRANCHES[storeId]) ? BRANCHES[storeId] : (storeId || "Bilinmiyor");
      const customer = pkg.customer || {};
      const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Müşteri";
      const totalPrice = (pkg.totalPrice !== undefined ? Number(pkg.totalPrice).toFixed(2) : "0.00");
      const currency = pkg.currencyCode || "TL";
      const statusText = pkg.packageStatus === "UnSupplied" ? "Tedarik Edilemedi (UnSupplied)" : "İptal Edildi (Cancelled)";
      const cancelReason = pkg.cancelInfo?.reason || pkg.cancelReason || "";

      let msg = `❌ <b>SİPARİŞ İPTAL EDİLDİ!</b>\n\n` +
                `📦 <b>Sipariş No:</b> <code>#${escapeHtml(orderNumber)}</code>\n` +
                `🏪 <b>Şube:</b> <b>${escapeHtml(branchName)}</b>\n` +
                `💰 <b>Tutar:</b> ${escapeHtml(totalPrice)} ${escapeHtml(currency)}\n` +
                `👤 <b>Müşteri:</b> ${escapeHtml(customerName)}\n` +
                `⚠️ <b>Durum:</b> <b>${escapeHtml(statusText)}</b>\n`;

      if (cancelReason) {
        msg += `📌 <b>İptal Sebebi:</b> <i>"${escapeHtml(cancelReason)}"</i>\n`;
      }

      msg += `\n⚡ <i>Limon Server • Anlık Bildirim</i>`;

      const success = await sendTelegramMessage(msg);
      if (success) {
        this.stats.cancelledOrdersSent++;
        this.addLog({
          type: "cancel",
          title: `İptal Sipariş: #${orderNumber}`,
          message: `${branchName} - ${statusText}`,
          success: true,
        });
      }
      return success;
    } catch (e: any) {
      console.error("[TelegramNotifier] sendCancelledOrderNotification hatası:", e);
      return false;
    }
  }

  // 3. Yorum Bildirimi Mesajı
  public async sendReviewNotification(review: any, branchName: string): Promise<boolean> {
    try {
      const avg = review.rating?.averageScore ?? review.rating?.deliveryScore ?? 5;
      const quality = review.rating?.qualityScore ?? "-";
      const delivery = review.rating?.deliveryScore ?? "-";
      const stars = "⭐".repeat(Math.min(5, Math.max(1, Math.round(Number(avg) || 5))));
      const orderParentId = review.orderParentId || "-";
      const comment = review.comment?.trim() || "";

      let msg = `⭐ <b>YENİ MÜŞTERİ YORUMU!</b>\n\n` +
                `🏪 <b>Şube:</b> <b>${escapeHtml(branchName)}</b>\n` +
                `🌟 <b>Puan:</b> ${stars} <b>(${avg}/5)</b>\n` +
                `📊 <b>Detay:</b> Kalite: <b>${quality}/5</b> • Hız: <b>${delivery}/5</b>\n` +
                `📦 <b>Sipariş Ref:</b> <code>#${escapeHtml(orderParentId)}</code>\n`;

      if (comment) {
        msg += `\n💬 <b>Müşteri Yorumu:</b>\n<i>"${escapeHtml(comment)}"</i>\n`;
      } else {
        msg += `\n💬 <b>Yorum:</b> <i>(Yorumsuz sadece yıldız puanı verildi)</i>\n`;
      }

      msg += `\n⚡ <i>Limon Server • Müşteri Geri Bildirimi</i>`;

      const success = await sendTelegramMessage(msg);
      if (success) {
        this.stats.reviewsSent++;
        this.addLog({
          type: "review",
          title: `Yeni Yorum: ${branchName} (${avg}⭐)`,
          message: comment || "Puanlama yapıldı",
          success: true,
        });
      }
      return success;
    } catch (e: any) {
      console.error("[TelegramNotifier] sendReviewNotification hatası:", e);
      return false;
    }
  }

  // 4. İade Talebi Bildirimi Mesajı
  public async sendClaimNotification(claim: any): Promise<boolean> {
    try {
      const orderNumber = claim.orderNumber || "Bilinmiyor";
      const customerName = `${claim.customerFirstName || ""} ${claim.customerLastName || ""}`.trim() || "Müşteri";
      const storeId = claim.storeId?.toString();
      const branchName = (storeId && BRANCHES[storeId]) ? BRANCHES[storeId] : (claim.storeName || "Bilinmiyor");

      let itemsSummary = "";
      if (Array.isArray(claim.claimItems) && claim.claimItems.length > 0) {
        claim.claimItems.forEach((ci: any, idx: number) => {
          const reason = ci.customerClaimItemReason?.name || ci.claimItemStatus?.name || "Belirtilmemiş";
          const custNote = ci.customerNote || ci.note || "";
          itemsSummary += `▪️ <b>Talep #${idx + 1}:</b> ${escapeHtml(reason)}`;
          if (custNote) {
            itemsSummary += `\n   <i>"${escapeHtml(custNote)}"</i>`;
          }
          itemsSummary += "\n";
        });
      }

      let msg = `🔄 <b>YENİ İADE TALEBİ OLUŞTURULDU!</b>\n\n` +
                `📦 <b>Sipariş No:</b> <code>#${escapeHtml(orderNumber)}</code>\n` +
                `🏪 <b>Şube:</b> <b>${escapeHtml(branchName)}</b>\n` +
                `👤 <b>Müşteri:</b> ${escapeHtml(customerName)}\n`;

      if (itemsSummary) {
        msg += `\n⚠️ <b>İade Sebepleri & Ürünler:</b>\n${itemsSummary}`;
      }

      msg += `\n⚡ <i>Limon Server • İade Bildirim Sistemi</i>`;

      const success = await sendTelegramMessage(msg);
      if (success) {
        this.stats.claimsSent++;
        this.addLog({
          type: "claim",
          title: `İade Talebi: #${orderNumber}`,
          message: `${customerName} - ${branchName}`,
          success: true,
        });
      }
      return success;
    } catch (e: any) {
      console.error("[TelegramNotifier] sendClaimNotification hatası:", e);
      return false;
    }
  }

  // Webhook'tan gelen siparişi anında işleme metodu
  public async handleWebhookOrder(body: any): Promise<boolean> {
    if (!body || !body.orderNumber) return false;

    const orderNumber = body.orderNumber.toString();
    const status = body.packageStatus;

    if (status === "Created") {
      const already = await this.isAlreadyNotified("order", orderNumber);
      if (!already) {
        await this.markAsNotified("order", orderNumber);
        return await this.sendNewOrderNotification(body);
      }
    } else if (status === "Cancelled" || status === "UnSupplied") {
      const already = await this.isAlreadyNotified("cancel", orderNumber);
      if (!already) {
        await this.markAsNotified("cancel", orderNumber);
        return await this.sendCancelledOrderNotification(body);
      }
    }
    return true;
  }

  // Test bildirimi gönder
  public async sendTestNotification(): Promise<boolean> {
    const msg = `🧪 <b>LİMON SERVER TEST BİLDİRİMİ</b>\n\n` +
                `✅ <b>Telegram Bildirim Motoru:</b> Aktif ve Çalışıyor\n` +
                `⏱️ <b>Sipariş Tarama Hızı:</b> ${this.config.orderPollIntervalMs}ms (Anlık)\n` +
                `⭐ <b>Yorum Tarama Hızı:</b> ${this.config.reviewPollIntervalMs / 1000}s\n` +
                `🔄 <b>İade Tarama Hızı:</b> ${this.config.claimPollIntervalMs / 1000}s\n` +
                `📅 <b>Zaman:</b> ${new Date().toLocaleString("tr-TR")}\n\n` +
                `⚡ <i>Tüm bildirimler sunucu üzerinden 7/24 iletilmektedir.</i>`;

    const success = await sendTelegramMessage(msg);
    this.addLog({
      type: "system",
      title: "Test Bildirimi",
      message: success ? "Test mesajı başarıyla iletildi" : "Test mesajı iletilemedi",
      success,
    });
    return success;
  }

  // Servisi Başlat
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[TelegramNotifier] Zaten çalışıyor.");
      return;
    }

    this.isRunning = true;
    this.stats.startedAt = Date.now();
    console.log(`[TelegramNotifier] Başlatılıyor... (Sipariş Aralığı: ${this.config.orderPollIntervalMs}ms)`);

    // 1. Önce eski siparişleri baseline olarak al
    await this.bootstrapBaseline();

    // 2. Sipariş tarama döngüsünü başlat (anlık)
    this.checkOrdersLoop();

    // 3. Yorum tarama döngüsünü başlat (30s)
    this.checkReviewsLoop();

    // 4. İade tarama döngüsünü başlat (15s)
    this.checkClaimsLoop();

    console.log("[TelegramNotifier] Tüm tarama servisleri başarıyla başlatıldı!");
  }

  // Servisi Durdur
  public stop(): void {
    this.isRunning = false;
    if (this.orderTimer) clearTimeout(this.orderTimer);
    if (this.reviewTimer) clearTimeout(this.reviewTimer);
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.orderTimer = null;
    this.reviewTimer = null;
    this.claimTimer = null;
    console.log("[TelegramNotifier] Servis durduruldu.");
  }

  // Ayarları Güncelle
  public updateConfig(newConfig: Partial<TelegramNotifierConfig>): TelegramNotifierConfig {
    this.config = { ...this.config, ...newConfig };
    console.log("[TelegramNotifier] Yapılandırma güncellendi:", this.config);
    return this.config;
  }

  // Durum ve İstatistikleri Döndür
  public getStatus() {
    return {
      isRunning: this.isRunning,
      isBootstrapped: this.isBootstrapped,
      config: this.config,
      stats: this.stats,
      uptimeSeconds: this.stats.startedAt ? Math.floor((Date.now() - this.stats.startedAt) / 1000) : 0,
      knownCounters: {
        orders: this.processedOrderIds.size,
        cancels: this.processedCancelIds.size,
        reviews: this.processedReviewIds.size,
        claims: this.processedClaimIds.size,
      },
      recentLogs: this.eventLogs.slice(0, 20),
    };
  }
}

// Global Singleton (Next.js Fast Refresh ve Node.js runtime içinde tek kopya çalışmasını sağlar)
declare global {
  // eslint-disable-next-line no-var
  var __limonTelegramNotifier: TelegramNotifierEngine | undefined;
}

export function getTelegramNotifier(): TelegramNotifierEngine {
  if (!globalThis.__limonTelegramNotifier) {
    globalThis.__limonTelegramNotifier = new TelegramNotifierEngine();
  }
  return globalThis.__limonTelegramNotifier;
}

export function startTelegramNotifier(): TelegramNotifierEngine {
  const instance = getTelegramNotifier();
  instance.start();
  return instance;
}
