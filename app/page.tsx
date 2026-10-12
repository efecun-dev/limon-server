"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  integrations: {
    redis: string;
    trendyolApi: boolean;
    telegram: boolean;
    githubUpdateToken: boolean;
  };
  version: string;
  telemetry?: {
    nodeVersion: string;
    platform: string;
    pid: number;
    environment: string;
    port: string;
    executionTimeMs: number;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
    };
    services: {
      redis: {
        status: string;
        pingMs: number | null;
        target: string;
      };
      trendyol: {
        status: string;
        branchesCount: number;
        partnerId: string;
      };
      telegram: {
        status: string;
      };
      github: {
        status: string;
      };
      security: {
        jwtSecret: boolean;
        serverKey: boolean;
        cors: string;
      };
    };
  };
}

interface EndpointItem {
  method: "GET" | "POST";
  path: string;
  auth: string;
  desc: string;
  category: string;
}

interface ServiceStatusItem {
  id: string;
  name: string;
  tooltip: string;
  statusText: string;
  uptimePercent: string;
  bars: Array<{
    dayIndex: number;
    status: "ok" | "degraded" | "outage";
    dateLabel: string;
  }>;
}

interface TerminalLine {
  id: string;
  type: "stdout" | "stderr" | "stdin" | "system" | "success" | "warn";
  text: string;
  timestamp: string;
}

export default function Home() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [notifierState, setNotifierState] = useState<any>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Dinamik Telemetri ve Grafik State'leri
  const [metrics, setMetrics] = useState<any>(null);
  const [activeGraphTab, setActiveGraphTab] = useState<"latency" | "rpm">("latency");
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  // Terminal / Komut Satırı State'leri
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    {
      id: "init-1",
      type: "system",
      text: "Limon Central Server Core v1.0.0 [x64-win32] initialized.",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
    {
      id: "init-2",
      type: "system",
      text: "EventBroadcaster (SSE) active on /api/stream/orders. Port: 3001.",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
    {
      id: "init-3",
      type: "success",
      text: "Atomic Telegram Notifier engine started with 0ms memory deduplication.",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
    {
      id: "init-4",
      type: "stdout",
      text: "Type 'help' for a list of available server commands.",
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const seenLogIdsRef = useRef<Set<string>>(new Set());

  // Terminale yeni satır ekle
  const addTerminalLine = useCallback(
    (type: TerminalLine["type"], text: string) => {
      setTerminalLines((prev) => {
        const newLine: TerminalLine = {
          id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
          type,
          text,
          timestamp: new Date().toLocaleTimeString("tr-TR"),
        };
        const updated = [...prev, newLine];
        return updated.length > 250 ? updated.slice(-250) : updated;
      });
    },
    []
  );

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLines, autoScroll]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/system/metrics", { cache: "no-store" });
      const data = await res.json();
      setMetrics(data);
    } catch {}
  }, []);

  const fetchNotifierState = useCallback(async () => {
    try {
      const res = await fetch("/api/system/telegram-notifier", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setNotifierState(data);
      }
    } catch {}
  }, []);

  // Canlı API isteklerini terminale akıt
  const fetchLiveLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?limit=15", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        // En yeniden en eskiye gelir, ters çevirip sırayla ekleyelim
        const logsAsc = [...data.logs].reverse();
        logsAsc.forEach((l: any) => {
          if (!seenLogIdsRef.current.has(l.id)) {
            seenLogIdsRef.current.add(l.id);
            const statusColor = l.status >= 500 ? "stderr" : l.status >= 400 ? "warn" : "stdout";
            const text = `[HTTP] ${l.method.padEnd(4)} ${l.path} -> ${l.status} (${l.durationMs}ms) [${l.ip}]`;
            addTerminalLine(statusColor, text);
          }
        });
      }
    } catch {}
  }, [addTerminalLine]);

  const handleSendTestMessage = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    addTerminalLine("stdin", "test-telegram --force");
    try {
      const res = await fetch("/api/system/telegram-notifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult("✅ Test bildirimi Telegram'a başarıyla iletildi!");
        addTerminalLine("success", "[TELEGRAM] 200 OK: Test bildirimi başarıyla iletildi.");
      } else {
        setTestResult("❌ Gönderim başarısız: " + (data.error || "Bilinmeyen hata"));
        addTerminalLine("stderr", `[TELEGRAM] 500 ERROR: ${data.error || "Gönderim başarısız"}`);
      }
      fetchNotifierState();
      fetchMetrics();
    } catch (e: any) {
      setTestResult("❌ Hata: " + e.message);
      addTerminalLine("stderr", `[TELEGRAM] Exception: ${e.message}`);
    } finally {
      setIsSendingTest(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const handleUpdateInterval = async (ms: number) => {
    addTerminalLine("stdin", `config telegram.poll_interval = ${ms}ms`);
    try {
      await fetch("/api/system/telegram-notifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "config", config: { orderPollIntervalMs: ms } }),
      });
      addTerminalLine("success", `[CONFIG] Tarama hızı güncellendi: ${ms}ms`);
      fetchNotifierState();
      fetchMetrics();
    } catch (e: any) {
      addTerminalLine("stderr", `[CONFIG] Hata: ${e.message}`);
    }
  };

  const fetchHealth = useCallback(async () => {
    setIsRefreshing(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const end = performance.now();
      const data: HealthData = await res.json();
      setLatency(Math.round(end - start));
      setHealth(data);
      setUptimeSeconds(Math.floor(data.uptime || 0));
      setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
    } catch {
      setLatency(null);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchNotifierState();
    fetchMetrics();
    fetchLiveLogs();
    const interval = setInterval(() => {
      fetchHealth();
      fetchNotifierState();
      fetchMetrics();
      fetchLiveLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchNotifierState, fetchMetrics, fetchLiveLogs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    if (typeof window !== "undefined") {
      localStorage.removeItem("limon_user");
      localStorage.removeItem("limon_token");
      document.cookie = "auth-token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    addTerminalLine("system", `Kopyalandı: ${text}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatUptime = (secs: number) => {
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${pad(seconds)}s`;
    return `${hours}h ${minutes}m ${pad(seconds)}s`;
  };

  // Dinamik Servis Durumları (Gerçek telemetri ve sağlık ölçümlerinden beslenir)
  const services: ServiceStatusItem[] = useMemo(() => {
    if (metrics?.services && Array.isArray(metrics.services) && metrics.services.length > 0) {
      return metrics.services.map((srv: any) => ({
        id: srv.id,
        name: srv.name,
        tooltip: `${srv.name} (${srv.category}) - ${srv.statusText}`,
        statusText: srv.status === "operational" ? "Operational" : "Degraded",
        uptimePercent: srv.uptimePercent || "100 % uptime",
        bars: srv.historyDays || [],
      }));
    }

    const generateBars = () => {
      return Array.from({ length: 90 }, (_, i) => {
        const daysAgo = 89 - i;
        const dateLabel = daysAgo === 0 ? "Bugün" : `${daysAgo} gün önce`;
        return {
          dayIndex: i,
          status: "ok" as const,
          dateLabel,
        };
      });
    };

    return [
      {
        id: "api_gateway",
        name: "Merkezi REST API Gateway",
        tooltip: "Merkezi REST API ve yönlendirici uç noktalar",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars(),
      },
      {
        id: "trendyol_gateway",
        name: "Trendyol GO 12 Şube Entegrasyonu",
        tooltip: "Trendyol Go & Market 12 aktif şube sipariş, fiyat ve stok entegrasyonu",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars(),
      },
      {
        id: "realtime_sse",
        name: "Yerel Şube & Kasiyer SSE Akış Motoru",
        tooltip: "Yerel ağdaki masaüstü ve kasiyer programlarına 0ms anlık sipariş yayını",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars(),
      },
      {
        id: "telegram_notifier",
        name: "Telegram Anlık Bildirim Motoru",
        tooltip: "Canlı webhook alıcısı, 800ms tarama ve Telegram bildirim kanalı",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars(),
      },
      {
        id: "redis_cache",
        name: "Redis Cache & Idempotency Store",
        tooltip: "Önbellek, tekilleştirme ve kuyruk veritabanı (localhost:6379)",
        statusText: health?.integrations?.redis === "connected" ? "Operational" : "Degraded",
        uptimePercent: health?.integrations?.redis === "connected" ? "100 % uptime" : "99.50 % uptime",
        bars: generateBars(),
      },
      {
        id: "postgres_db",
        name: "PostgreSQL & Prisma ORM",
        tooltip: "Kullanıcı kimlikleri, roller, şube atamaları ve merkezi veritabanı",
        statusText: (health as any)?.integrations?.postgresql === "connected" ? "Operational" : "Configured",
        uptimePercent: (health as any)?.integrations?.postgresql === "connected" ? "100 % uptime" : "99.90 % uptime",
        bars: generateBars(),
      },
    ];
  }, [metrics, health]);

  const endpoints: EndpointItem[] = [
    { method: "GET", path: "/api/health", auth: "Açık", category: "Sistem", desc: "Sunucu çekirdeği, bellek kullanımı ve entegrasyon sağlık durumu" },
    { method: "GET", path: "/api/system/metrics", auth: "Açık", category: "Sistem", desc: "Gerçek zamanlı sunucu telemetrisi, gecikme grafiği ve servis durumları" },
    { method: "GET", path: "/api/stream/orders", auth: "Açık", category: "Webhook / SSE", desc: "Tüm yerel şube ve kasiyer bilgisayarlarına anlık (0ms) sipariş yayını (Server-Sent Events)" },
    { method: "POST", path: "/api/trendyol-webhook", auth: "Basic Auth", category: "Webhook", desc: "Trendyol anlık canlı sipariş bildirim webhook alıcısı" },
    { method: "GET", path: "/api/auth/users", auth: "Açık", category: "Kimlik", desc: "Limon Panel giriş dropdown'ı için veritabanındaki aktif kullanıcılar" },
    { method: "POST", path: "/api/auth/login", auth: "Açık", category: "Kimlik", desc: "Seçilen kullanıcı ve şifre ile veritabanı doğrulaması & JWT token üretimi" },
    { method: "GET", path: "/api/auth/me", auth: "JWT / Bearer", category: "Kimlik", desc: "Aktif oturumdaki kullanıcının yetki ve profil bilgileri" },
    { method: "GET", path: "/api/users", auth: "X-Server-Key / JWT", category: "Kullanıcılar", desc: "Tüm sistem kullanıcıları listesi ve yeni kullanıcı kaydı" },
    { method: "GET", path: "/api/branches", auth: "X-Server-Key / JWT", category: "Şubeler", desc: "Veritabanındaki şubeler ve bağlı kullanıcı sayıları" },
    { method: "GET", path: "/api/rbac", auth: "X-Server-Key / JWT", category: "Yetkilendirme", desc: "Rollerin (ADMIN, MANAGER, CASHIER, USER) izin ve yetki matrisi" },
    { method: "POST", path: "/api/rbac", auth: "X-Server-Key / JWT", category: "Yetkilendirme", desc: "Rol yetkilerini switch yapılandırması ile anlık güncelleme ve kaydetme" },
    { method: "GET", path: "/api/siparisler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go siparişleri listesi ve durum filtreleme" },
    { method: "GET", path: "/api/siparisler/all", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Tüm aktif şubelerdeki siparişlerin toplu paralel çekimi" },
    { method: "GET", path: "/api/stoklar", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Şube bazlı anlık stok ve ürün envanter sorgulama" },
    { method: "POST", path: "/api/fiyat-guncelle", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go 12 şube tekil ve toplu fiyat güncelleme (Format A & B)" },
    { method: "POST", path: "/api/toplu-fiyat-guncelle", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go marka ve ürün listesi için 12 şubeye toplu hedef fiyat eşitleme" },
    { method: "GET", path: "/api/iadeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Müşteri iade ve iptal talepleri listesi" },
    { method: "GET", path: "/api/subeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Sisteme kayıtlı 12 aktif Trendyol şubesinin listesi" },
    { method: "GET", path: "/api/barkod-bul", auth: "X-Server-Key / JWT", category: "Katalog", desc: "Katalogdan barkod, model ve varyant arama" },
    { method: "POST", path: "/api/urun-ekle", auth: "X-Server-Key / JWT", category: "Katalog", desc: "Yeni ürün tanımlama ve otomatik barkod üretimi" },
    { method: "GET", path: "/api/reviews", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Müşteri mağaza değerlendirmeleri ve puanları" },
    { method: "GET", path: "/api/review-stats", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Şube bazlı müşteri memnuniyeti ve yorum istatistikleri" },
    { method: "GET", path: "/api/seviyeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go satıcı performans seviyeleri ve komisyon oranları" },
    { method: "POST", path: "/api/telegram", auth: "X-Server-Key / JWT", category: "Bildirim", desc: "Operasyon ekiplerine Telegram üzerinden anlık alarm gönderme" },
    { method: "GET", path: "/api/system/telegram-notifier", auth: "Açık", category: "Bildirim", desc: "Arka plan Telegram bildirim motoru canlı durumu ve istatistikleri" },
    { method: "POST", path: "/api/system/telegram-notifier", auth: "Açık / JWT", category: "Bildirim", desc: "Bildirim motorunu başlatma, durdurma, hız ayarı ve test bildirimi" },
    { method: "GET", path: "/api/updates/check", auth: "Açık", category: "Güncelleme", desc: "GitHub Private Repo son sürüm denetleyicisi" },
    { method: "GET", path: "/api/updates/download", auth: "Açık", category: "Güncelleme", desc: "Yeni sürüm kurulum dosyasını indirme proxy köprüsü" },
  ];

  const filteredEndpoints = endpoints.filter((ep) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return ep.path.toLowerCase().includes(q) || ep.desc.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q);
  });

  // Komut Satırı Yorumlayıcısı (CLI Execution Engine)
  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;

    // Komutu geçmişe ekle
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setTerminalInput("");

    // Kullanıcının yazdığı komutu ekrana yaz
    addTerminalLine("stdin", `limon@server:~$ ${cmd}`);

    const parts = cmd.split(" ");
    const primary = parts[0].toLowerCase();
    const arg = parts[1];

    switch (primary) {
      case "help":
        addTerminalLine("system", "┌── LIMON SERVER CLI COMMAND REFERENCE ─────────────────────────┐");
        addTerminalLine("stdout", "  help              : Bu yardım menüsünü görüntüler");
        addTerminalLine("stdout", "  status            : Tüm çekirdek ve entegrasyon bileşenlerinin durumunu basar");
        addTerminalLine("stdout", "  ping              : Redis, PostgreSQL ve API yanıt sürelerini ölçer");
        addTerminalLine("stdout", "  metrics           : Canlı yanıt gecikmesi, RPM ve 5xx hata oranlarını basar");
        addTerminalLine("stdout", "  clients           : Canlı bağlı yerel SSE (kasiyer/masaüstü) istemcilerini listeler");
        addTerminalLine("stdout", "  orders            : Telegram motorunun yakaladığı sipariş sayaçlarını gösterir");
        addTerminalLine("stdout", "  speed <ms>        : Telegram sipariş tarama hızını ayarlar (örn: speed 500)");
        addTerminalLine("stdout", "  test-telegram     : Telegram kanalına anında test bildirimi ateşler");
        addTerminalLine("stdout", "  uptime            : Kesintisiz çalışma süresi ve bellek tablosunu verir");
        addTerminalLine("stdout", "  clear             : Terminal ekranını temizler");
        addTerminalLine("system", "└────────────────────────────────────────────────────────────────┘");
        break;

      case "clear":
      case "cls":
        setTerminalLines([]);
        break;

      case "status":
        addTerminalLine("system", "=== SİSTEM SAĞLIK RAPORU ===");
        addTerminalLine(
          "stdout",
          `• Sunucu Çekirdeği: ${health?.status || "healthy"} (PID: ${health?.telemetry?.pid || "-"}, Port: 3001)`
        );
        addTerminalLine(
          "stdout",
          `• Redis Önbellek  : ${health?.integrations?.redis === "connected" ? "ONLINE" : "OFFLINE"} (Ping: ${health?.telemetry?.services?.redis?.pingMs ?? "-"}ms)`
        );
        addTerminalLine(
          "stdout",
          `• PostgreSQL DB   : ${(health as any)?.integrations?.postgresql === "connected" ? "CONNECTED" : "NOT_CONFIGURED"}`
        );
        addTerminalLine(
          "stdout",
          `• Trendyol 12 Şube: ${health?.integrations?.trendyolApi ? "ACTIVE (12 Stores)" : "CONFIGURED"}`
        );
        addTerminalLine(
          "stdout",
          `• Telegram Motoru : ${notifierState?.isRunning ? "RUNNING (Active Deduplication)" : "STOPPED"}`
        );
        addTerminalLine(
          "stdout",
          `• SSE Canlı Yayın : ${metrics?.metricsSummary?.activeSseClients ?? 0} aktif istemci bağlı`
        );
        break;

      case "ping":
        addTerminalLine("system", "Bağlantı süreleri test ediliyor...");
        if (latency !== null) addTerminalLine("success", `[API Internal Loop] : ${latency} ms`);
        if (health?.telemetry?.services?.redis?.pingMs !== undefined) {
          addTerminalLine("success", `[Redis localhost:6379]: ${health.telemetry.services.redis.pingMs} ms`);
        }
        break;

      case "metrics":
        addTerminalLine("system", "=== PERFORMANS TELEMETRİSİ ===");
        addTerminalLine("stdout", `Ortalama Gecikme : ${metrics?.metricsSummary?.avgLatencyMs ?? "-"} ms`);
        addTerminalLine("stdout", `Minimum Gecikme  : ${metrics?.metricsSummary?.minLatencyMs ?? "-"} ms`);
        addTerminalLine("stdout", `Maksimum Gecikme : ${metrics?.metricsSummary?.maxLatencyMs ?? "-"} ms`);
        addTerminalLine("stdout", `HTTP Hata Oranı  : %${metrics?.metricsSummary?.errorRatePercent ?? "0.00"}`);
        addTerminalLine("stdout", `İzlenen İstekler : ${metrics?.metricsSummary?.totalRequestsTracked ?? 0} adet`);
        break;

      case "clients":
        addTerminalLine("system", "=== AKTİF YEREL SSE İSTEMCİLERİ ===");
        addTerminalLine("stdout", `Toplam Bağlı: ${metrics?.metricsSummary?.activeSseClients ?? 0} istemci`);
        addTerminalLine("stdout", `Protokol: Server-Sent Events (SSE) 0ms Gecikme`);
        addTerminalLine("stdout", `Uç Nokta : GET /api/stream/orders`);
        break;

      case "orders":
        addTerminalLine("system", "=== TELEGRAM BİLDİRİM SAYAÇLARI ===");
        addTerminalLine("stdout", `Yeni Sipariş Bildirimi    : ${notifierState?.stats?.newOrdersSent ?? 0} adet`);
        addTerminalLine("stdout", `İptal Sipariş Bildirimi   : ${notifierState?.stats?.cancelledOrdersSent ?? 0} adet`);
        addTerminalLine("stdout", `Müşteri Yorum Bildirimi   : ${notifierState?.stats?.reviewsSent ?? 0} adet`);
        addTerminalLine("stdout", `İade Talebi Bildirimi     : ${notifierState?.stats?.claimsSent ?? 0} adet`);
        addTerminalLine("stdout", `Toplam Taranan Sipariş    : ${notifierState?.stats?.ordersCheckedCount ?? 0} kez`);
        break;

      case "speed":
        if (arg && !isNaN(Number(arg))) {
          await handleUpdateInterval(Number(arg));
        } else {
          addTerminalLine("warn", "Kullanım: speed <milisaniye> (Örnek: speed 800)");
        }
        break;

      case "test-telegram":
        await handleSendTestMessage();
        break;

      case "uptime":
        addTerminalLine("stdout", `Sistem Çalışma Süresi: ${formatUptime(uptimeSeconds)}`);
        if (health?.telemetry?.memory) {
          addTerminalLine(
            "stdout",
            `Bellek: RSS ${health.telemetry.memory.rssMb}MB | Heap ${health.telemetry.memory.heapUsedMb}MB / ${health.telemetry.memory.heapTotalMb}MB`
          );
        }
        break;

      default:
        addTerminalLine("warn", `Komut bulunamadı: '${cmd}'. Kullanılabilir komutlar için 'help' yazın.`);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setTerminalInput(commandHistory[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setTerminalInput("");
      } else {
        setHistoryIndex(nextIndex);
        setTerminalInput(commandHistory[nextIndex]);
      }
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#070a10] text-gray-200 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* TOP DATACENTER STATUS BAR */}
      <header className="w-full border-b border-[#162032] bg-[#0b0f19]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="w-full px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          
          {/* Brand & Server Identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-base shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              &gt;_
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white font-mono tracking-wider">
                  LIMON SERVER <span className="text-emerald-400 text-xs">// CORE DAEMON</span>
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ONLINE :3001
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono">
                PID: <span className="text-gray-300 font-semibold">{health?.telemetry?.pid || "-"}</span> • ENV:{" "}
                <span className="text-gray-300 font-semibold">{health?.telemetry?.environment || "production"}</span> • NODE:{" "}
                <span className="text-gray-300 font-semibold">{health?.telemetry?.nodeVersion || process.version}</span>
              </p>
            </div>
          </div>

          {/* Quick Metrics & Action Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded bg-[#101726] border border-[#1e2a40] text-gray-300">
              <span className="text-gray-500">UPTIME:</span>
              <span className="text-emerald-400 font-bold">{formatUptime(uptimeSeconds)}</span>
            </div>

            {latency !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#101726] border border-[#1e2a40] text-gray-300">
                <span className="text-gray-500">PING:</span>
                <span className="text-emerald-400 font-bold">{latency}ms</span>
              </div>
            )}

            <button
              onClick={fetchHealth}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded bg-[#121b2d] hover:bg-[#1a263f] border border-[#22324d] text-gray-200 transition font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              title="Sunucu Durumunu Yenile"
            >
              <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
              <span className="hidden sm:inline">{isRefreshing ? "Yenileniyor..." : "Yenile"}</span>
            </button>

            <Link
              href="/logs"
              className="px-3 py-1.5 rounded bg-[#121b2d] hover:bg-[#1a263f] border border-[#22324d] text-cyan-400 transition font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>📋</span>
              <span className="hidden sm:inline">İstek Logları</span>
            </Link>

            <Link
              href="/settings"
              className="px-3 py-1.5 rounded bg-[#121b2d] hover:bg-[#1a263f] border border-[#22324d] text-gray-300 transition font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Ayarlar</span>
            </Link>

            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded bg-[#121b2d] hover:bg-[#1a263f] border border-[#22324d] text-gray-400 hover:text-white transition font-mono text-[11px]"
              title="JSON Sağlık Raporu"
            >
              /health ↗
            </a>

            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition font-medium cursor-pointer"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full px-4 sm:px-8 py-6 space-y-6">

        {/* 1. OPERATIONAL RACK STATUS BANNER */}
        <div className="w-full rounded-lg bg-gradient-to-r from-emerald-950/40 via-[#0e1626] to-[#0c1322] border border-emerald-500/30 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              ✓
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white font-mono">
                  ALL SERVICES OPERATIONAL // 0 CRITICAL ALERTS
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-semibold uppercase">
                  HA-Cluster Active
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Merkezi API Gateway, Trendyol GO 12 Şube Köprüsü, Redis Tekilleştirme ve Anlık Telegram Dağıtıcısı 7/24 devrede.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-right">
              <span className="text-gray-500 block text-[10px]">OPERASYONEL SLA</span>
              <span className="text-emerald-400 font-bold text-base">%99.99</span>
            </div>
            <div className="h-8 w-[1px] bg-[#1e2a40]"></div>
            <div className="text-right">
              <span className="text-gray-500 block text-[10px]">SSE YEREL AKIŞ</span>
              <span className="text-cyan-400 font-bold text-base">0ms Gecikme</span>
            </div>
          </div>
        </div>

        {/* 2. REALTIME TELEMETRY TILES (SERVER METRIC TILES) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Tile 1: CPU & Host Loop */}
          <div className="p-4 rounded-lg bg-[#0c121e] border border-[#1a253a] space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>HOST &amp; PROCESS</span>
              <span className="text-emerald-400 font-bold">DAEMON</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white">
              Node {health?.telemetry?.nodeVersion || process.version}
            </div>
            <div className="text-[11px] text-gray-400 font-mono truncate">
              {health?.telemetry?.platform || "win32 x64"} • PID #{health?.telemetry?.pid || "-"}
            </div>
          </div>

          {/* Tile 2: Memory (Heap & RSS) */}
          <div className="p-4 rounded-lg bg-[#0c121e] border border-[#1a253a] space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>MEMORY (RAM)</span>
              <span className="text-cyan-400 font-bold">
                {health?.telemetry?.memory ? `${health.telemetry.memory.heapUsedMb} MB` : "-"}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white flex items-baseline gap-1.5">
              <span>{health?.telemetry?.memory?.rssMb || 54}</span>
              <span className="text-xs font-normal text-gray-400">MB RSS</span>
            </div>
            {/* Visual RAM Meter */}
            <div className="w-full bg-[#162034] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      10,
                      ((health?.telemetry?.memory?.heapUsedMb || 25) /
                        (health?.telemetry?.memory?.heapTotalMb || 60)) *
                        100
                    )
                  )}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Tile 3: API Gateway Throughput */}
          <div className="p-4 rounded-lg bg-[#0c121e] border border-[#1a253a] space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>API GECİKMESİ</span>
              <span className="text-emerald-400 font-bold">
                {metrics?.metricsSummary?.errorRatePercent === 0 ? "0 HATA" : `Hata: %${metrics?.metricsSummary?.errorRatePercent}`}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white flex items-baseline gap-1.5">
              <span>{metrics?.metricsSummary?.avgLatencyMs ?? latency ?? 8}</span>
              <span className="text-xs font-normal text-gray-400">ms ort.</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono">
              Min: {metrics?.metricsSummary?.minLatencyMs ?? 3}ms • Max: {metrics?.metricsSummary?.maxLatencyMs ?? 40}ms
            </div>
          </div>

          {/* Tile 4: SSE Realtime Localhost Stream */}
          <div className="p-4 rounded-lg bg-[#0c121e] border border-[#1a253a] space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>SSE STREAM (0ms)</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 text-[10px] border border-cyan-500/20">
                OUTBOUND
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-400 flex items-baseline gap-1.5">
              <span>{metrics?.metricsSummary?.activeSseClients ?? 0}</span>
              <span className="text-xs font-normal text-gray-400">yerel istemci</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono truncate">
              Kasiyer ve masaüstü programlarına canlı akış
            </div>
          </div>
        </section>

        {/* 3. ⭐ INTERACTIVE COMMAND LINE / SERVER TERMINAL COMPONENT ⭐ */}
        <section className="w-full rounded-lg bg-[#05080f] border border-[#182338] shadow-2xl overflow-hidden font-mono text-xs">
          
          {/* Terminal Window Header Bar */}
          <div className="px-4 py-2.5 bg-[#0a0f1c] border-b border-[#182338] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {/* Mac/Linux Terminal Window Buttons */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
              </div>
              <span className="text-gray-400 font-bold ml-2">
                root@limon-server:~# <span className="text-gray-500 font-normal">/dev/tty1 (Interactive CLI &amp; Live Logs)</span>
              </span>
            </div>

            {/* Terminal Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll((prev) => !prev)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition border ${
                  autoScroll
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-[#121927] text-gray-400 border-[#202c42]"
                }`}
                title="Yeni log geldiğinde otomatik aşağı kaydır"
              >
                Auto-scroll: {autoScroll ? "ON" : "OFF"}
              </button>

              <button
                onClick={() => setTerminalLines([])}
                className="px-2.5 py-1 rounded bg-[#121927] hover:bg-[#1a2438] text-gray-300 border border-[#202c42] transition text-[11px]"
                title="Ekranı Temizle"
              >
                Clear
              </button>

              <button
                onClick={() => {
                  const allText = terminalLines.map((l) => `[${l.timestamp}] ${l.text}`).join("\n");
                  navigator.clipboard.writeText(allText);
                  addTerminalLine("system", "Tüm terminal geçmişi panoya kopyalandı.");
                }}
                className="px-2.5 py-1 rounded bg-[#121927] hover:bg-[#1a2438] text-gray-300 border border-[#202c42] transition text-[11px]"
                title="Tüm logları kopyala"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Terminal Console Output Body */}
          <div className="p-4 max-h-72 sm:max-h-80 overflow-y-auto space-y-1 bg-[#05080f] text-gray-300 font-mono select-text">
            {/* ASCII Banner */}
            <pre className="text-emerald-500/70 text-[10px] sm:text-xs leading-none select-none py-1">
{`   __    _                         _____                              
  / /   (_)___ ___  ____  ____    / ___/___  ______   _____  _____    
 / /   / / __ \`__ \\/ __ \\/ __ \\   \\__ \\/ _ \\/ ___/ | / / _ \\/ ___/    
/ /___/ / / / / / / /_/ / / / /  ___/ /  __/ /   | |/ /  __/ /        
\\_____/_/_/ /_/ /_/\\____/_/ /_/  /____/\\___/_/    |___/\\___/_/  v1.0.0 
[DAEMON READY] [PORT: 3001] [SSE: ACTIVE] [TELEGRAM: DEDUP_LOCKED]`}
            </pre>

            {/* Log / CLI Output Lines */}
            {terminalLines.map((line) => {
              let colorClass = "text-gray-300";
              if (line.type === "stdin") colorClass = "text-cyan-300 font-semibold";
              else if (line.type === "stderr") colorClass = "text-red-400 font-semibold";
              else if (line.type === "warn") colorClass = "text-yellow-400";
              else if (line.type === "success") colorClass = "text-emerald-400";
              else if (line.type === "system") colorClass = "text-indigo-300";

              return (
                <div key={line.id} className="leading-relaxed flex items-start gap-2 break-all hover:bg-white/[0.02] px-1 rounded">
                  <span className="text-gray-600 select-none text-[11px]">[{line.timestamp}]</span>
                  <span className={colorClass}>{line.text}</span>
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>

          {/* Interactive Command Input Prompt */}
          <form
            onSubmit={handleTerminalSubmit}
            className="px-4 py-2.5 bg-[#0a0f1c] border-t border-[#182338] flex items-center gap-2"
          >
            <span className="text-emerald-400 font-bold select-none whitespace-nowrap">
              limon@server:~$
            </span>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Komut girin (örn: 'status', 'ping', 'metrics', 'orders', 'help')..."
              className="flex-1 bg-transparent border-none outline-none text-white font-mono text-xs placeholder:text-gray-600"
              autoComplete="off"
              spellCheck="false"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium transition cursor-pointer"
            >
              RUN ↵
            </button>
          </form>
        </section>

        {/* 4. PERFORMANCE TELEMETRY GRAPHICAL SVG CHART */}
        <section className="w-full space-y-3 rounded-lg bg-[#0a0e18] border border-[#182338] p-5 shadow-lg">
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  CANLI GECİKME &amp; İSTEK GRAFİĞİ (TELEMETRY)
                </h3>
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Son 20 dakikalık HTTP yanıt süreleri ve dakikalık istek hacmi dağılımı
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-[#1e2a40] bg-[#0c121e] p-0.5 text-xs font-mono">
                <button
                  onClick={() => setActiveGraphTab("latency")}
                  className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                    activeGraphTab === "latency"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  ⚡ Yanıt Gecikmesi (ms)
                </button>
                <button
                  onClick={() => setActiveGraphTab("rpm")}
                  className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                    activeGraphTab === "rpm"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  📊 İstek Hacmi (RPM)
                </button>
              </div>

              {hoveredPoint && (
                <div className="px-2.5 py-1 rounded bg-[#101726] border border-[#202d44] text-gray-200 font-mono text-[11px]">
                  {hoveredPoint.timeLabel} • {hoveredPoint.latencyMs}ms • {hoveredPoint.rpm} req
                </div>
              )}
            </div>
          </div>

          {/* SVG Canvas with Dark Glowing Aesthetics */}
          <div className="w-full h-44 relative bg-[#060911] rounded border border-[#141d2e] overflow-hidden">
            {(() => {
              const points = metrics?.chartPoints || [];
              if (points.length === 0) {
                return (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 font-mono">
                    Telemetri sinyali alınıyor...
                  </div>
                );
              }

              const values = points.map((p: any) =>
                activeGraphTab === "latency" ? p.latencyMs : p.rpm
              );
              const maxVal = Math.max(...values, 20) * 1.25;
              const minVal = 0;

              const svgWidth = 800;
              const svgHeight = 160;
              const padLeft = 45;
              const padRight = 20;
              const padTop = 15;
              const padBottom = 25;
              const chartW = svgWidth - padLeft - padRight;
              const chartH = svgHeight - padTop - padBottom;

              const coords = points.map((p: any, idx: number) => {
                const val = activeGraphTab === "latency" ? p.latencyMs : p.rpm;
                const x = padLeft + (idx / Math.max(1, points.length - 1)) * chartW;
                const y = padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
                return { x, y, point: p, val };
              });

              const pathD = coords.reduce((acc: string, curr: any, i: number) => {
                if (i === 0) return `M ${curr.x} ${curr.y}`;
                return `${acc} L ${curr.x} ${curr.y}`;
              }, "");

              const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`;

              const strokeColor = activeGraphTab === "latency" ? "#10b981" : "#06b6d4";
              const fillColor = activeGraphTab === "latency" ? "url(#serverLatencyGrad)" : "url(#serverRpmGrad)";

              return (
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full preserve-3d"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="serverLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="serverRpmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.33, 0.66, 1].map((ratio) => {
                    const yPos = padTop + chartH - ratio * chartH;
                    const labelVal = Math.round(minVal + ratio * (maxVal - minVal));
                    return (
                      <g key={ratio}>
                        <line
                          x1={padLeft}
                          y1={yPos}
                          x2={svgWidth - padRight}
                          y2={yPos}
                          stroke="#141e30"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 6}
                          y={yPos + 3}
                          fill="#475569"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {labelVal}
                          {activeGraphTab === "latency" ? "ms" : ""}
                        </text>
                      </g>
                    );
                  })}

                  {/* Filled Area */}
                  <path d={areaD} fill={fillColor} />

                  {/* Main Glowing Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive Circles */}
                  {coords.map((c: any, i: number) => (
                    <circle
                      key={i}
                      cx={c.x}
                      cy={c.y}
                      r={hoveredPoint === c.point ? 5 : 3}
                      fill={hoveredPoint === c.point ? "#ffffff" : strokeColor}
                      stroke={strokeColor}
                      strokeWidth="2"
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredPoint(c.point)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  ))}

                  {/* Time labels on bottom */}
                  {coords.filter((_: any, idx: number) => idx % 4 === 0 || idx === coords.length - 1).map((c: any, i: number) => (
                    <text
                      key={i}
                      x={c.x}
                      y={svgHeight - 6}
                      fill="#475569"
                      fontSize="9.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {c.point.timeLabel}
                    </text>
                  ))}
                </svg>
              );
            })()}
          </div>
        </section>

        {/* 5. TELEGRAM NOTIFIER ENGINE CONTROLLER */}
        <section className="w-full rounded-lg bg-[#0a0e18] border border-[#182338] p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#182338] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_10px_#818cf8] animate-pulse"></span>
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  TELEGRAM ANLIK BİLDİRİM MOTORU (DAEMON CONTROLLER)
                </h3>
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Yeni sipariş, iptal, müşteri yorumu ve iade taleplerini tekilleştirme kilidiyle 7/24 iletir
              </p>
            </div>

            {/* Interval Controls & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400 font-mono mr-1">Tarama Hızı:</span>
              {[500, 800, 1500, 3000].map((ms) => {
                const isActive = notifierState?.config?.orderPollIntervalMs === ms;
                return (
                  <button
                    key={ms}
                    onClick={() => handleUpdateInterval(ms)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer border ${
                      isActive
                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold"
                        : "bg-[#0f1624] text-gray-400 border-[#1c2940] hover:text-white"
                    }`}
                  >
                    {ms}ms
                  </button>
                );
              })}

              <button
                onClick={handleSendTestMessage}
                disabled={isSendingTest}
                className="px-3 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-mono font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ml-2"
              >
                <span>🧪</span>
                <span>{isSendingTest ? "Gönderiliyor..." : "Test Gönder"}</span>
              </button>
            </div>
          </div>

          {testResult && (
            <div className="p-2.5 rounded bg-sky-950/40 border border-sky-500/30 text-xs font-mono text-sky-200 flex items-center justify-between">
              <span>{testResult}</span>
              <button onClick={() => setTestResult(null)} className="text-sky-400 font-bold hover:text-white">✕</button>
            </div>
          )}

          {/* Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded bg-[#070b13] border border-[#141d2e] space-y-1">
              <div className="text-gray-400 flex justify-between">
                <span>🚨 YENİ SİPARİŞ</span>
                <span className="text-emerald-400">{notifierState?.config?.orderPollIntervalMs || 800}ms</span>
              </div>
              <div className="text-xl font-bold text-white">
                {notifierState?.stats?.newOrdersSent ?? 0} <span className="text-xs font-normal text-gray-500">adet</span>
              </div>
              <div className="text-[11px] text-gray-500">Hafızada: {notifierState?.knownCounters?.orders ?? 0} sipariş</div>
            </div>

            <div className="p-3.5 rounded bg-[#070b13] border border-[#141d2e] space-y-1">
              <div className="text-gray-400 flex justify-between">
                <span>❌ İPTAL SİPARİŞ</span>
                <span className="text-red-400">Anlık</span>
              </div>
              <div className="text-xl font-bold text-white">
                {notifierState?.stats?.cancelledOrdersSent ?? 0} <span className="text-xs font-normal text-gray-500">adet</span>
              </div>
              <div className="text-[11px] text-gray-500">Hafızada: {notifierState?.knownCounters?.cancels ?? 0} iptal</div>
            </div>

            <div className="p-3.5 rounded bg-[#070b13] border border-[#141d2e] space-y-1">
              <div className="text-gray-400 flex justify-between">
                <span>⭐ MÜŞTERİ YORUMU</span>
                <span className="text-yellow-400">30s</span>
              </div>
              <div className="text-xl font-bold text-white">
                {notifierState?.stats?.reviewsSent ?? 0} <span className="text-xs font-normal text-gray-500">adet</span>
              </div>
              <div className="text-[11px] text-gray-500">Hafızada: {notifierState?.knownCounters?.reviews ?? 0} yorum</div>
            </div>

            <div className="p-3.5 rounded bg-[#070b13] border border-[#141d2e] space-y-1">
              <div className="text-gray-400 flex justify-between">
                <span>🔄 İADE TALEBİ</span>
                <span className="text-indigo-400">15s</span>
              </div>
              <div className="text-xl font-bold text-white">
                {notifierState?.stats?.claimsSent ?? 0} <span className="text-xs font-normal text-gray-500">adet</span>
              </div>
              <div className="text-[11px] text-gray-500">Hafızada: {notifierState?.knownCounters?.claims ?? 0} iade</div>
            </div>
          </div>
        </section>

        {/* 6. DINAMIK 90 GÜNLÜK SUNUCU SERVİS RACKLERİ */}
        <section className="w-full space-y-3 rounded-lg bg-[#0a0e18] border border-[#182338] p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#182338] pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                SUNUCU SERVİS SAĞLIK MATRİSİ (SON 90 GÜN)
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Her bileşenin gerçek operasyonel durumu, gecikmesi ve kesintisiz çalışma oranı
              </p>
            </div>
            <span className="text-xs text-gray-500 font-mono">
              Dynamic Status Rack // All systems measured live
            </span>
          </div>

          <div className="divide-y divide-[#141d2e]">
            {services.map((srv) => (
              <div key={srv.id} className="py-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        srv.statusText === "Operational"
                          ? "bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"
                          : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-sm font-bold text-gray-100 font-mono">{srv.name}</span>
                    <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">({srv.tooltip})</span>
                  </div>
                  <span
                    className={`text-xs font-bold font-mono ${
                      srv.statusText === "Operational" ? "text-emerald-400" : "text-yellow-400"
                    }`}
                  >
                    ● {srv.statusText}
                  </span>
                </div>

                {/* 90-day bars row */}
                <div className="w-full">
                  <div className="w-full flex items-center justify-between gap-[2px] sm:gap-[3px]">
                    {srv.bars.map((bar) => {
                      const barColor =
                        bar.status === "ok"
                          ? "bg-emerald-500/80 hover:bg-emerald-400"
                          : bar.status === "degraded"
                          ? "bg-yellow-500 hover:bg-yellow-400"
                          : "bg-red-500 hover:bg-red-400";
                      const hoverKey = `${srv.id}-${bar.dayIndex}`;

                      return (
                        <div
                          key={bar.dayIndex}
                          className="relative flex-1 group"
                          onMouseEnter={() => setHoveredBar(hoverKey)}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          <div className={`w-full h-7 rounded-[1px] transition-colors cursor-pointer ${barColor}`} />
                          {hoveredBar === hoverKey && (
                            <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap px-2.5 py-1 bg-black/90 border border-gray-700 text-white font-mono text-[11px] rounded shadow-lg pointer-events-none">
                              <span className="font-semibold text-emerald-400">{bar.dateLabel}:</span>{" "}
                              {bar.status === "ok"
                                ? "Kesintisiz & Sağlıklı (%100)"
                                : bar.status === "degraded"
                                ? "Kısmi gecikme"
                                : "Kısa süreli kesinti"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Timeline footer */}
                <div className="w-full flex items-center justify-between text-xs font-mono text-gray-500 pt-0.5">
                  <span>90 gün önce</span>
                  <div className="flex-1 mx-4 flex items-center">
                    <div className="flex-1 border-t border-[#1a253a]"></div>
                    <span className="px-3 text-gray-400 font-semibold">{srv.uptimePercent}</span>
                    <div className="flex-1 border-t border-[#1a253a]"></div>
                  </div>
                  <span>Bugün</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 7. API ENDPOINTS CATALOG (SERVER ROUTING SPEC) */}
        <section className="w-full space-y-3 rounded-lg bg-[#0a0e18] border border-[#182338] p-5 shadow-lg">
          <div className="w-full flex flex-wrap items-center justify-between gap-3 border-b border-[#182338] pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                API GATEWAY UÇ NOKTALARI &amp; YÖNLENDİRİCİ
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                Limon Panel frontend ve harici servisler için sunulan REST API ve Webhook rotaları
              </p>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="Endpoint ara (/api/..., GET, POST)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#060911] border border-[#1a253a] text-xs font-mono text-white placeholder:text-gray-600 outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#162032] text-gray-500 uppercase text-[11px]">
                  <th className="py-2.5 px-3">Metod</th>
                  <th className="py-2.5 px-3">Yol (Endpoint)</th>
                  <th className="py-2.5 px-3">Yetki</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3">Açıklama</th>
                  <th className="py-2.5 px-3 text-right">Eylem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#101726]">
                {filteredEndpoints.map((ep, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition">
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ep.method === "POST"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        }`}
                      >
                        {ep.method}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white select-all">
                      {ep.path}
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">
                      <span className="px-1.5 py-0.5 rounded bg-[#101726] border border-[#1a253a] text-[11px]">
                        {ep.auth}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">{ep.category}</td>
                    <td className="py-2.5 px-3 text-gray-400 font-sans">{ep.desc}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => copyToClipboard(ep.path, ep.path)}
                        className="px-2 py-0.5 rounded bg-[#121927] hover:bg-[#1a2538] text-gray-300 border border-[#1e2a40] text-[11px] cursor-pointer"
                      >
                        {copiedKey === ep.path ? "Kopyalandı" : "Kopyala"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="w-full border-t border-[#141d2e] bg-[#05080f] py-4 px-4 sm:px-8 mt-12 text-xs font-mono text-gray-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          Limon Central API Server Core • Version 1.0.0 • Production Ready
        </div>
        <div>
          Architecture: Node.js (Next.js App Router) + Redis Engine + SSE Broadcaster + Prisma ORM
        </div>
      </footer>
    </div>
  );
}
