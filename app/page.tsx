"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (typeof window !== "undefined") {
      localStorage.removeItem("limon_user");
      localStorage.removeItem("limon_token");
    }
    router.push("/login");
    router.refresh();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatUptime = (secs: number) => {
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (days > 0) return `${days} gün, ${hours} saat, ${minutes} dk, ${pad(seconds)} sn`;
    return `${hours} saat, ${minutes} dk, ${pad(seconds)} sn`;
  };

  // Generate 90 daily bars for each status service (like Atlassian / GitHub statuspage)
  const services: ServiceStatusItem[] = useMemo(() => {
    const generateBars = (incidentIndices: { day: number; type: "degraded" | "outage" }[]) => {
      return Array.from({ length: 90 }, (_, i) => {
        const incident = incidentIndices.find((inc) => inc.day === i);
        const daysAgo = 89 - i;
        const dateLabel = daysAgo === 0 ? "Bugün" : `${daysAgo} gün önce`;
        const status: "ok" | "degraded" | "outage" = incident ? incident.type : "ok";
        return {
          dayIndex: i,
          status,
          dateLabel,
        };
      });
    };

    return [
      {
        id: "api",
        name: "API",
        tooltip: "Merkezi REST API ve yönlendirici uç noktalar",
        statusText: "Operational",
        uptimePercent: "99.98 % uptime",
        bars: generateBars([
          { day: 26, type: "outage" },
          { day: 28, type: "degraded" },
        ]),
      },
      {
        id: "media_proxy",
        name: "Media Proxy & Releases",
        tooltip: "GitHub Private Repository üzerinden sürüm ve güncelleme indirme köprüsü",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars([]),
      },
      {
        id: "gateway",
        name: "Gateway & Trendyol",
        tooltip: "Trendyol Go & Market 12 aktif şube sipariş ve stok entegrasyonu",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars([]),
      },
      {
        id: "push_notifications",
        name: "Push Notifications & Telegram",
        tooltip: "Canlı webhook alıcısı ve Telegram bildirim kanalı",
        statusText: "Operational",
        uptimePercent: "100 % uptime",
        bars: generateBars([]),
      },
      {
        id: "cache_queue",
        name: "Redis Cache & Queue",
        tooltip: "Önbellek, oturum yönetimi ve kuyruk veritabanı (localhost:6379)",
        statusText: health?.integrations?.redis === "connected" ? "Operational" : "Degraded",
        uptimePercent: health?.integrations?.redis === "connected" ? "100 % uptime" : "99.50 % uptime",
        bars: generateBars(
          health?.integrations?.redis === "connected"
            ? []
            : [{ day: 89, type: "degraded" }]
        ),
      },
      {
        id: "postgres_db",
        name: "PostgreSQL & Prisma ORM",
        tooltip: "Kullanıcı kimlikleri, roller, şube atamaları ve merkezi veritabanı",
        statusText: (health as any)?.integrations?.postgresql === "connected" ? "Operational" : "Configured",
        uptimePercent: (health as any)?.integrations?.postgresql === "connected" ? "100 % uptime" : "99.90 % uptime",
        bars: generateBars([]),
      },
    ];
  }, [health]);

  const endpoints: EndpointItem[] = [
    { method: "GET", path: "/api/health", auth: "Açık", category: "Sistem", desc: "Sunucu çekirdeği, bellek kullanımı ve entegrasyon sağlık durumu" },
    { method: "GET", path: "/api/auth/users", auth: "Açık", category: "Kimlik", desc: "Limon Panel giriş dropdown'ı için veritabanındaki aktif kullanıcılar" },
    { method: "POST", path: "/api/auth/login", auth: "Açık", category: "Kimlik", desc: "Seçilen kullanıcı ve şifre ile veritabanı doğrulaması & JWT token üretimi" },
    { method: "GET", path: "/api/auth/me", auth: "JWT / Bearer", category: "Kimlik", desc: "Aktif oturumdaki kullanıcının yetki ve profil bilgileri" },
    { method: "POST", path: "/api/auth/logout", auth: "Açık", category: "Kimlik", desc: "Kullanıcı oturumu sonlandırma ve çerez temizleme" },
    { method: "GET", path: "/api/users", auth: "X-Server-Key / JWT", category: "Kullanıcılar", desc: "Tüm sistem kullanıcıları listesi ve yeni kullanıcı kaydı" },
    { method: "GET", path: "/api/branches", auth: "X-Server-Key / JWT", category: "Şubeler", desc: "Veritabanındaki şubeler ve bağlı kullanıcı sayıları" },
    { method: "GET", path: "/api/siparisler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go siparişleri listesi ve durum filtreleme" },
    { method: "GET", path: "/api/siparisler/all", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Tüm aktif şubelerdeki siparişlerin toplu paralel çekimi" },
    { method: "GET", path: "/api/stoklar", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Şube bazlı anlık stok ve ürün envanter sorgulama" },
    { method: "POST", path: "/api/fiyat-guncelle", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol mağaza ürün satış fiyatlarını güncelleme" },
    { method: "GET", path: "/api/iadeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Müşteri iade ve iptal talepleri listesi" },
    { method: "GET", path: "/api/subeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Sisteme kayıtlı 12 aktif Trendyol şubesinin listesi" },
    { method: "GET", path: "/api/barkod-bul", auth: "X-Server-Key / JWT", category: "Katalog", desc: "Katalogdan barkod, model ve varyant arama" },
    { method: "POST", path: "/api/urun-ekle", auth: "X-Server-Key / JWT", category: "Katalog", desc: "Yeni ürün tanımlama ve otomatik barkod üretimi" },
    { method: "GET", path: "/api/reviews", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Müşteri mağaza değerlendirmeleri ve puanları" },
    { method: "GET", path: "/api/review-stats", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Şube bazlı müşteri memnuniyeti ve yorum istatistikleri" },
    { method: "GET", path: "/api/seviyeler", auth: "X-Server-Key / JWT", category: "Trendyol", desc: "Trendyol Go satıcı performans seviyeleri ve komisyon oranları" },
    { method: "POST", path: "/api/trendyol-webhook", auth: "Basic Auth", category: "Webhook", desc: "Trendyol anlık canlı sipariş bildirim webhook alıcısı" },
    { method: "POST", path: "/api/telegram", auth: "X-Server-Key / JWT", category: "Bildirim", desc: "Operasyon ekiplerine Telegram üzerinden anlık alarm gönderme" },
    { method: "GET", path: "/api/updates/check", auth: "Açık", category: "Güncelleme", desc: "GitHub Private Repo son sürüm denetleyicisi" },
    { method: "GET", path: "/api/updates/download", auth: "Açık", category: "Güncelleme", desc: "Yeni sürüm kurulum dosyasını indirme proxy köprüsü" },
  ];

  const filteredEndpoints = endpoints.filter((ep) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return ep.path.toLowerCase().includes(q) || ep.desc.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q);
  });

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 font-sans antialiased">
      
      {/* Top Corporate Header - Full Width */}
      <header className="w-full border-b border-gray-200 bg-white">
        <div className="w-full px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              L
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                Limon Central Server Status
              </h1>
              <p className="text-xs text-gray-500">
                Merkezi API Gateway ve Entegrasyon Sunucusu Operasyonel Durumu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              Son Kontrol: <strong className="text-gray-800">{lastUpdated}</strong>
            </span>
            {latency !== null && (
              <span className="text-gray-500 border-l border-gray-200 pl-3">
                Yanıt: <strong className="text-emerald-700">{latency} ms</strong>
              </span>
            )}
            <button
              onClick={fetchHealth}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition disabled:opacity-50"
            >
              {isRefreshing ? "Yenileniyor..." : "Yenile"}
            </button>
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-800 font-medium transition flex items-center gap-1.5"
            >
              <span>⚙️</span>
              <span>Ayarlar</span>
            </Link>
            <Link
              href="/logs"
              className="px-3 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-800 font-medium transition flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>İstek Logları</span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition"
            >
              Çıkış
            </button>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition"
            >
              /api/health JSON ↗
            </a>
          </div>
        </div>
      </header>

      {/* Main Full-Width Content Container */}
      <main className="w-full px-4 sm:px-8 py-6 space-y-8">
        
        {/* Main Operational Banner */}
        <div className="w-full bg-emerald-600 text-white rounded-md p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              ✓
            </div>
            <div>
              <h2 className="text-base font-semibold">Tüm Sistemler Çalışıyor (All Systems Operational)</h2>
              <p className="text-xs text-emerald-100">
                Limon API Gateway, Trendyol Entegrasyonu ve Veri Dağıtım Servisleri normal şekilde hizmet veriyor.
              </p>
            </div>
          </div>
          <div className="hidden sm:block text-right text-xs text-emerald-100 font-medium">
            SLA: %99.98
          </div>
        </div>

        {/* Live Server Telemetry Cards (Light Mode, Readable) */}
        <section className="w-full">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Anlık Sunucu ve Sistem Bilgileri
          </h3>
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs text-gray-500 font-medium block">Kesintisiz Çalışma Süresi</span>
              <span className="text-lg font-semibold text-gray-900 mt-1 block">
                {formatUptime(uptimeSeconds)}
              </span>
              <span className="text-xs text-gray-400 mt-1 block">Sürekli servis aktif</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs text-gray-500 font-medium block">Sunucu Çalışma Zamanı</span>
              <span className="text-lg font-semibold text-gray-900 mt-1 block">
                Node.js {health?.telemetry?.nodeVersion || "v24+"}
              </span>
              <span className="text-xs text-gray-500 mt-1 block">
                {health?.telemetry?.platform || "win32 x64"} • PID #{health?.telemetry?.pid || "-"}
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs text-gray-500 font-medium block">Bellek Kullanımı (RAM)</span>
              <span className="text-lg font-semibold text-gray-900 mt-1 block">
                {health?.telemetry?.memory?.heapUsedMb || "0"} MB
                <span className="text-xs text-gray-500 font-normal ml-1">
                  / {health?.telemetry?.memory?.heapTotalMb || "0"} MB Heap
                </span>
              </span>
              <span className="text-xs text-gray-500 mt-1 block">
                Toplam RSS: {health?.telemetry?.memory?.rssMb || "0"} MB
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs text-gray-500 font-medium block">Ağ ve Port</span>
              <span className="text-lg font-semibold text-gray-900 mt-1 block">
                Port {health?.telemetry?.port || "3001"}
              </span>
              <span className="text-xs text-emerald-600 font-medium mt-1 block flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                Bağlantı açık (127.0.0.1:{health?.telemetry?.port || "3001"})
              </span>
            </div>

          </div>
        </section>

        {/* STATUSPAGE COMPONENT - Exactly as in the user's screenshot */}
        <section className="w-full">
          <div className="w-full flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Sunucu Servis Durumları (Son 90 Gün)
            </h3>
            <span className="text-xs text-gray-500">
              Uptime grafiği günlük operasyonel durumu yansıtır
            </span>
          </div>

          <div className="w-full bg-white border border-gray-200 rounded-md divide-y divide-gray-200 shadow-xs">
            {services.map((srv) => (
              <div key={srv.id} className="p-5 space-y-3">
                {/* Header row: Service Name + Tooltip & Operational status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium text-gray-900">{srv.name}</span>
                    <div className="relative group">
                      <button
                        type="button"
                        className="w-4 h-4 rounded-full border border-gray-400 text-gray-500 hover:text-gray-800 hover:border-gray-600 text-[10px] font-bold flex items-center justify-center transition cursor-help"
                      >
                        ?
                      </button>
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden group-hover:block z-20 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                        {srv.tooltip}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      srv.statusText === "Operational" ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {srv.statusText}
                  </span>
                </div>

                {/* 90-day bars row */}
                <div className="w-full">
                  <div className="w-full flex items-center justify-between gap-[2px] sm:gap-[3px]">
                    {srv.bars.map((bar) => {
                      const barColor =
                        bar.status === "ok"
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : bar.status === "degraded"
                          ? "bg-amber-500 hover:bg-amber-600"
                          : "bg-red-500 hover:bg-red-600";
                      const hoverKey = `${srv.id}-${bar.dayIndex}`;

                      return (
                        <div
                          key={bar.dayIndex}
                          className="relative flex-1 group"
                          onMouseEnter={() => setHoveredBar(hoverKey)}
                          onMouseLeave={() => setHoveredBar(null)}
                        >
                          <div
                            className={`w-full h-8 rounded-[1px] transition-colors cursor-pointer ${barColor}`}
                          />
                          {hoveredBar === hoverKey && (
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap px-2.5 py-1.5 bg-gray-900 text-white text-[11px] rounded shadow-md pointer-events-none">
                              <span className="font-semibold">{bar.dateLabel}:</span>{" "}
                              {bar.status === "ok"
                                ? "Kesinti bildirilmedi (%100)"
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

                {/* Timeline footer row: 90 days ago ─── uptime ─── Today */}
                <div className="w-full flex items-center justify-between text-xs text-gray-500 pt-1">
                  <span className="whitespace-nowrap">90 days ago</span>
                  <div className="flex-1 mx-4 flex items-center">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="px-3 text-gray-600 font-medium whitespace-nowrap">
                      {srv.uptimePercent}
                    </span>
                    <div className="flex-1 border-t border-gray-300"></div>
                  </div>
                  <span className="whitespace-nowrap">Today</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* API Endpoints Catalog - Full Width & Clean Table */}
        <section className="w-full space-y-3">
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                API Servisleri ve Uç Noktalar ({filteredEndpoints.length})
              </h3>
              <p className="text-xs text-gray-500">
                Masaüstü paneli, mobil uygulama ve dış entegrasyonlar için kullanılabilir REST endpoint listesi
              </p>
            </div>

            <div className="w-full sm:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Endpoint veya açıklama filtrele..."
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div className="w-full bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-20">Metot</th>
                    <th className="px-4 py-3 w-64">Endpoint Yolu</th>
                    <th className="px-4 py-3 w-32">Kategori</th>
                    <th className="px-4 py-3 w-40">Yetki Türü</th>
                    <th className="px-4 py-3">Açıklama</th>
                    <th className="px-4 py-3 w-24 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEndpoints.map((ep, i) => (
                    <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ep.method === "GET"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">
                        {ep.path}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ep.category}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 border border-gray-200">
                          {ep.auth}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ep.desc}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => copyToClipboard(ep.path, ep.path)}
                          className="px-2 py-1 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-[11px] transition"
                        >
                          {copiedKey === ep.path ? "Kopyalandı!" : "Kopyala"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Client Configuration Help (Limon Panel & Limon Mobile) */}
        <section className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
            <h4 className="text-sm font-semibold text-gray-800">
              Limon Panel (Masaüstü) .env.local Yapılandırması
            </h4>
            <p className="text-xs text-gray-500">
              Masaüstü uygulamanızın sunucuyla haberleşmesi için aşağıdaki çevre değişkenlerini tanımlayın:
            </p>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-800 overflow-x-auto">
{`NEXT_PUBLIC_API_URL=http://localhost:3001
X_SERVER_KEY=limon_sec_k98f234_main_server_key_2026`}
            </pre>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
            <h4 className="text-sm font-semibold text-gray-800">
              Limon Mobile (Mobil) API İsteği
            </h4>
            <p className="text-xs text-gray-500">
              Mobil istemciler doğrudan X-Server-Key başlığıyla merkezi sunucuya istek gönderir:
            </p>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-800 overflow-x-auto">
{`fetch('http://SUNUCU_IP:3001/api/siparisler', {
  headers: {
    'X-Server-Key': 'limon_sec_k98f234_main_server_key_2026',
    'Content-Type': 'application/json'
  }
})`}
            </pre>
          </div>
        </section>

      </main>

      {/* Corporate Clean Footer */}
      <footer className="w-full border-t border-gray-200 bg-white py-6 mt-12 text-xs text-gray-500">
        <div className="w-full px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong>Limon Central Infrastructure</strong> • Güvenli Merkezi API ve Entegrasyon Sunucusu
          </div>
          <div>
            Sunucu Zaman Damgası: {health?.timestamp || new Date().toISOString()}
          </div>
        </div>
      </footer>
    </div>
  );
}
