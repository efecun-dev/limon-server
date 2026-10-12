export interface SseClient {
  id: string;
  storeId: string; // 'all' veya belirli bir şube storeId (örn. '157108')
  ip: string;
  userAgent: string;
  connectedAt: number;
  controller: ReadableStreamDefaultController;
}

export interface BroadcasterStats {
  connectedClientsCount: number;
  totalBroadcastsCount: number;
  lastBroadcastAt: number | null;
  lastEvent: string | null;
  clients: Array<{
    id: string;
    storeId: string;
    ip: string;
    connectedAt: number;
    uptimeSeconds: number;
  }>;
}

class EventBroadcaster {
  private clients = new Map<string, SseClient>();
  private totalBroadcastsCount = 0;
  private lastBroadcastAt: number | null = null;
  private lastEvent: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  // 20 saniyede bir keep-alive sinyali gönder (Firewall/NAT/Proxy zaman aşımını önler)
  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.sendRawToAll(":heartbeat\n\n");
    }, 20000);
  }

  public registerClient(client: SseClient): void {
    this.clients.set(client.id, client);
    console.log(
      `[EventBroadcaster] Yeni yerel istemci bağlandı: ID=${client.id}, Şube=${client.storeId}, IP=${client.ip} (Toplam aktif: ${this.clients.size})`
    );

    // İlk bağlantıda hoş geldin olayı gönder
    try {
      const welcomeData = JSON.stringify({
        status: "connected",
        clientId: client.id,
        storeId: client.storeId,
        serverTime: Date.now(),
        message: "Limon Server Gerçek Zamanlı Sipariş Akışına Başarıyla Bağlanıldı (SSE)",
      });
      const chunk = new TextEncoder().encode(`event: connected\ndata: ${welcomeData}\n\n`);
      client.controller.enqueue(chunk);
    } catch (e) {
      this.removeClient(client.id);
    }
  }

  public removeClient(id: string): void {
    if (this.clients.has(id)) {
      this.clients.delete(id);
      console.log(`[EventBroadcaster] İstemci ayrıldı: ID=${id} (Kalan aktif: ${this.clients.size})`);
    }
  }

  private sendRawToAll(raw: string, targetStoreId?: string): void {
    const chunk = new TextEncoder().encode(raw);
    const toRemove: string[] = [];

    this.clients.forEach((client, id) => {
      // Şube filtresi kontrolü (eğer istemci sadece kendi şubesini dinliyorsa)
      if (
        targetStoreId &&
        targetStoreId !== "all" &&
        client.storeId !== "all" &&
        client.storeId !== targetStoreId
      ) {
        return; // Farklı şube, bu istemciye gönderme
      }

      try {
        client.controller.enqueue(chunk);
      } catch (err) {
        // İstemci bağlantıyı koparmış
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => this.removeClient(id));
  }

  public broadcast(eventName: string, data: any, targetStoreId?: string | number): void {
    this.totalBroadcastsCount++;
    this.lastBroadcastAt = Date.now();
    this.lastEvent = eventName;

    const payload = JSON.stringify(data);
    const raw = `event: ${eventName}\ndata: ${payload}\n\n`;
    const strStoreId = targetStoreId ? String(targetStoreId).trim() : undefined;

    this.sendRawToAll(raw, strStoreId);
    console.log(
      `[EventBroadcaster] Anlık olay yayınlandı: [${eventName}] Şube=${strStoreId || "ALL"} (${this.clients.size} istemciye iletildi)`
    );
  }

  // Sipariş Olayları (Yeni Sipariş, İptal, Teslim Edildi vb.)
  public broadcastOrder(order: any, packageStatus: string): void {
    const statusKey = (packageStatus || "updated").toLowerCase();
    const storeId = order.storeId ? String(order.storeId) : undefined;

    // 1. Durum bazlı özel olay (örn: 'order:created', 'order:cancelled', 'order:delivered')
    this.broadcast(`order:${statusKey}`, order, storeId);

    // 2. Genel sipariş güncelleme olayı
    this.broadcast("order:update", order, storeId);
  }

  // İade Talebi Olayı
  public broadcastClaim(claim: any): void {
    const storeId = claim.storeId ? String(claim.storeId) : undefined;
    this.broadcast("claim:created", claim, storeId);
  }

  // Yorum Olayı
  public broadcastReview(review: any): void {
    const storeId = review.storeId ? String(review.storeId) : undefined;
    this.broadcast("review:created", review, storeId);
  }

  // Canlı İstatistikler
  public getStatus(): BroadcasterStats {
    const now = Date.now();
    const clientsList: BroadcasterStats["clients"] = [];

    this.clients.forEach((c) => {
      clientsList.push({
        id: c.id,
        storeId: c.storeId,
        ip: c.ip,
        connectedAt: c.connectedAt,
        uptimeSeconds: Math.floor((now - c.connectedAt) / 1000),
      });
    });

    return {
      connectedClientsCount: this.clients.size,
      totalBroadcastsCount: this.totalBroadcastsCount,
      lastBroadcastAt: this.lastBroadcastAt,
      lastEvent: this.lastEvent,
      clients: clientsList,
    };
  }

  public getStats(): BroadcasterStats {
    return this.getStatus();
  }
}

// Global Singleton (Next.js Fast Refresh ve Node.js runtime içinde tek kopya çalışmasını sağlar)
declare global {
  // eslint-disable-next-line no-var
  var __limonEventBroadcaster: EventBroadcaster | undefined;
}

export function getEventBroadcaster(): EventBroadcaster {
  if (!globalThis.__limonEventBroadcaster) {
    globalThis.__limonEventBroadcaster = new EventBroadcaster();
  }
  return globalThis.__limonEventBroadcaster;
}
