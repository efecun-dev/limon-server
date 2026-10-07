"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ApiLogItem {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  status: number;
  durationMs: number;
  userAgent: string;
  authType: string;
  error?: string;
}

interface LogStats {
  totalRequests: number;
  success2xx: number;
  error4xx: number;
  error5xx: number;
  avgDuration: number;
  uniqueIps: number;
}

export default function LogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ApiLogItem[]>([]);
  const [stats, setStats] = useState<LogStats>({
    totalRequests: 0,
    success2xx: 0,
    error4xx: 0,
    error5xx: 0,
    avgDuration: 0,
    uniqueIps: 0,
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [selectedMethod, setSelectedMethod] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedMethod !== "ALL") params.set("method", selectedMethod);
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "200");

      const res = await fetch(`/api/logs?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
        if (data.stats) setStats(data.stats);
        setLastUpdated(new Date().toLocaleTimeString("tr-TR"));
      }
    } catch (e) {
      console.error("Loglar çekilemedi:", e);
    }
  }, [selectedMethod, selectedStatus, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Live Auto-Refresh every 3 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleClearLogs = async () => {
    if (!confirm("Tüm kayıtlı API istek günlükleri silinsin mi?")) return;
    setLoading(true);
    try {
      await fetch("/api/logs", { method: "DELETE" });
      await fetchLogs();
    } finally {
      setLoading(false);
    }
  };

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
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 font-sans antialiased">
      {/* Top Header - Full Width */}
      <header className="w-full border-b border-gray-200 bg-white">
        <div className="w-full px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold px-2.5 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 transition flex items-center gap-1"
            >
              <span>←</span>
              <span>Sunucu Paneli</span>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight flex items-center gap-2">
                <span>API İstek & Trafik Günlükleri</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-normal">
                  Canlı İzleme
                </span>
              </h1>
              <p className="text-xs text-gray-500">
                Gelen tüm API istekleri, istemci IP adresleri, yanıt kodları ve gecikme süreleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <span className="text-gray-500 hidden md:inline">
              Son Güncelleme: <strong className="text-gray-800">{lastUpdated}</strong>
            </span>

            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded border transition flex items-center gap-1.5 font-medium ${autoRefresh
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-gray-100 border-gray-300 text-gray-600"
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-600 animate-pulse" : "bg-gray-400"}`} />
              <span>Canlı Akış: {autoRefresh ? "Açık (3s)" : "Kapalı"}</span>
            </button>

            {/* Manual refresh */}
            <button
              onClick={fetchLogs}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition"
            >
              Yenile
            </button>

            <Link
              href="/settings"
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition"
            >
              Ayarlar
            </Link>
            {/* Clear logs */}
            <button
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
              className="px-3 py-1.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition disabled:opacity-50"
            >
              Logları Temizle
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Full Width */}
      <main className="w-full px-4 sm:px-8 py-6 space-y-6">
        {/* Metric Cards Row */}
        <section className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs text-gray-500 font-medium block">Toplam İstek</span>
            <span className="text-xl font-bold text-gray-900 mt-1 block">
              {stats.totalRequests}
            </span>
            <span className="text-[11px] text-gray-400">Son kaydedilenler</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs text-gray-500 font-medium block">Başarılı (2xx OK)</span>
            <span className="text-xl font-bold text-emerald-600 mt-1 block">
              {stats.success2xx}
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">
              {stats.totalRequests > 0 ? `%${Math.round((stats.success2xx / stats.totalRequests) * 100)}` : "100%"} Başarı
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs text-gray-500 font-medium block">Hatalı / Yetkisiz</span>
            <span className="text-xl font-bold text-red-600 mt-1 block">
              {stats.error4xx + stats.error5xx}
            </span>
            <span className="text-[11px] text-gray-400">
              4xx: {stats.error4xx} • 5xx: {stats.error5xx}
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs text-gray-500 font-medium block">Ortalama Yanıt Süresi</span>
            <span className="text-xl font-bold text-indigo-600 mt-1 block">
              {stats.avgDuration} ms
            </span>
            <span className="text-[11px] text-gray-400">Gecikme süresi</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3.5 col-span-2 sm:col-span-1">
            <span className="text-xs text-gray-500 font-medium block">Farklı İstemci IP</span>
            <span className="text-xl font-bold text-gray-800 mt-1 block">
              {stats.uniqueIps} IP
            </span>
            <span className="text-[11px] text-gray-400">Bağlanan cihazlar</span>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="w-full bg-white border border-gray-200 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Method filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-600 mr-1">Metot:</span>
              {["ALL", "GET", "POST", "PUT", "DELETE"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMethod(m)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${selectedMethod === m
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                >
                  {m === "ALL" ? "Tümü" : m}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-600 mr-1">Durum:</span>
              {[
                { id: "ALL", label: "Tümü" },
                { id: "2xx", label: "2xx Başarılı" },
                { id: "4xx", label: "4xx Hata/Yetki" },
                { id: "5xx", label: "5xx Sunucu Hatası" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStatus(s.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${selectedStatus === s.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div className="w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="IP, yol veya User-Agent ara..."
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </section>

        {/* Real-Time Logs Table - Full Width */}
        <section className="w-full bg-white border border-gray-200 rounded-md overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-24">Saat</th>
                  <th className="px-4 py-3 w-20">Metot</th>
                  <th className="px-4 py-3 w-28">Durum Kodu</th>
                  <th className="px-4 py-3">İstek Yolu (Endpoint)</th>
                  <th className="px-4 py-3 w-36">İstemci IP Adresi</th>
                  <th className="px-4 py-3 w-24">Gecikme</th>
                  <th className="px-4 py-3 w-32">Yetkilendirme</th>
                  <th className="px-4 py-3 w-48">İstemci (User-Agent)</th>
                  <th className="px-4 py-3 w-20 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Henüz kaydedilmiş API isteği bulunmuyor veya filtreye uygun log yok.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const isSuccess = log.status >= 200 && log.status < 300;
                    const isClientError = log.status >= 400 && log.status < 500;
                    const isServerError = log.status >= 500;

                    return (
                      <tbody key={log.id} className="border-b border-gray-100">
                        <tr className="hover:bg-gray-50/80 transition-colors">
                          {/* Timestamp */}
                          <td className="px-4 py-3 text-gray-500 font-mono text-[11px] whitespace-nowrap">
                            {formatTime(log.timestamp)}
                          </td>

                          {/* Method */}
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.method === "GET"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : log.method === "POST"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : log.method === "PUT"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                            >
                              {log.method}
                            </span>
                          </td>

                          {/* Status Code */}
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold inline-flex items-center gap-1 ${isSuccess
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isClientError
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                                }`}
                            >
                              <span>{log.status}</span>
                              <span className="text-[10px] font-normal">
                                {log.status === 200 ? "OK" : log.status === 401 ? "Unauthorized" : ""}
                              </span>
                            </span>
                          </td>

                          {/* Path */}
                          <td className="px-4 py-3 font-mono font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              <span>{log.path}</span>
                              <button
                                onClick={() => copyToClipboard(log.path, `p-${log.id}`)}
                                className="text-[10px] text-gray-400 hover:text-gray-700"
                                title="Yolu Kopyala"
                              >
                                {copiedKey === `p-${log.id}` ? "✓" : "📋"}
                              </button>
                            </div>
                          </td>

                          {/* IP Address */}
                          <td className="px-4 py-3 font-mono text-gray-800 font-semibold text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-600"></span>
                              <span>{log.ip}</span>
                            </div>
                          </td>

                          {/* Latency */}
                          <td className="px-4 py-3 text-gray-600 font-mono text-[11px]">
                            <span className={log.durationMs > 200 ? "text-amber-600 font-bold" : "text-gray-700"}>
                              {log.durationMs} ms
                            </span>
                          </td>

                          {/* Auth Type */}
                          <td className="px-4 py-3 text-gray-600 text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              {log.authType}
                            </span>
                          </td>

                          {/* User Agent */}
                          <td className="px-4 py-3 text-gray-500 text-[11px] max-w-[200px] truncate" title={log.userAgent}>
                            {log.userAgent}
                          </td>

                          {/* Action Button */}
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-[11px]"
                            >
                              {isExpanded ? "Kapat" : "İncele"}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Detail Box */}
                        {isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={9} className="p-4 border-t border-b border-gray-200">
                              <div className="bg-white border border-gray-200 rounded p-3 text-xs font-mono space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700">
                                  <div>
                                    <strong className="text-gray-900">Tam İstek Zamanı:</strong> {log.timestamp}
                                  </div>
                                  <div>
                                    <strong className="text-gray-900">İstemci IP Adresi:</strong> {log.ip}
                                  </div>
                                  <div>
                                    <strong className="text-gray-900">İstek Metodu & Yolu:</strong> {log.method} {log.path}
                                  </div>
                                  <div>
                                    <strong className="text-gray-900">Yanıt Durum Kodu:</strong> {log.status} ({log.durationMs}ms)
                                  </div>
                                  <div>
                                    <strong className="text-gray-900">Yetkilendirme Modeli:</strong> {log.authType}
                                  </div>
                                  <div>
                                    <strong className="text-gray-900">Kayıt Kimliği:</strong> {log.id}
                                  </div>
                                </div>
                                <div className="pt-2 border-t border-gray-200">
                                  <strong className="text-gray-900 block mb-1">User-Agent Başlığı:</strong>
                                  <div className="p-2 bg-gray-50 rounded text-gray-600 text-[11px] break-all">
                                    {log.userAgent}
                                  </div>
                                </div>
                                {log.error && (
                                  <div className="pt-2 border-t border-red-200 text-red-600">
                                    <strong>Hata Bildirimi:</strong> {log.error}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-200 bg-white py-4 mt-8 text-xs text-gray-500">
        <div className="w-full px-4 sm:px-8 flex items-center justify-between">
          <div>
            <strong>Limon Central Server</strong> • Canlı API Denetim ve İstek Kayıt Günlüğü
          </div>
          <div>
            Toplam {logs.length} Log Görüntüleniyor
          </div>
        </div>
      </footer>
    </div>
  );
}
