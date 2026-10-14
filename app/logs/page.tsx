"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { ServerNavbar } from "@/components/ServerNavbar";
import { Check, Copy } from "lucide-react";

function formatIp(rawIp: string | null | undefined): string {
  if (!rawIp) return "127.0.0.1";
  let ip = rawIp.trim();
  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.split("]")[0].replace("[", "");
  }
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") {
    return "127.0.0.1";
  }
  if (ip.includes(".") && ip.includes(":")) {
    ip = ip.split(":")[0];
  }
  return ip || "127.0.0.1";
}

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
  const [logs, setLogs] = useState<ApiLogItem[]>([]);
  const [stats, setStats] = useState<LogStats>({
    totalRequests: 0,
    success2xx: 0,
    error4xx: 0,
    error5xx: 0,
    avgDuration: 0,
    uniqueIps: 0,
  });
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/logs?limit=100", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (e: any) {
      console.error("Logs fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3500);
    return () => clearInterval(interval);
  }, [fetchLogs, autoRefresh]);

  const handleClearLogs = async () => {
    if (!confirm("Tüm API istek kayıtlarını temizlemek istediğinize emin misiniz?")) return;
    try {
      const res = await fetch("/api/logs", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setStats({
          totalRequests: 0,
          success2xx: 0,
          error4xx: 0,
          error5xx: 0,
          avgDuration: 0,
          uniqueIps: 0,
        });
      }
    } catch (e) {
      alert("Loglar temizlenirken hata oluştu.");
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    if (methodFilter !== "all" && l.method.toUpperCase() !== methodFilter.toUpperCase()) return false;
    if (statusFilter === "2xx" && (l.status < 200 || l.status >= 300)) return false;
    if (statusFilter === "4xx" && (l.status < 400 || l.status >= 500)) return false;
    if (statusFilter === "5xx" && l.status < 500) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const ip = formatIp(l.ip).toLowerCase();
      return l.path.toLowerCase().includes(q) || ip.includes(q) || (l.error && l.error.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <ServerNavbar />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Üst Başlık & Kontroller */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl ">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Canlı API İstek ve Güvenlik Denetim Logları
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Canlı Akış
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Merkezi API rotalarına gelen tüm istekler, gecikme süreleri, istemci IP'leri ve durum kodları
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition cursor-pointer flex items-center gap-1.5 ${autoRefresh
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-slate-100 border-slate-300 text-slate-600"
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}></span>
              <span>Canlı Akış: {autoRefresh ? "Açık (3s)" : "Kapalı"}</span>
            </button>

            <button
              onClick={fetchLogs}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition cursor-pointer "
            >
              Yenile ↻
            </button>

            <button
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition disabled:opacity-50 cursor-pointer "
            >
              Logları Temizle
            </button>
          </div>
        </div>

        {/* 5 Özet Kartı */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 ">
            <span className="text-xs text-slate-500 font-medium block">Toplam İstek</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{stats.totalRequests}</span>
            <span className="text-[11px] text-slate-400">Son kaydedilenler</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 ">
            <span className="text-xs text-slate-500 font-medium block">Başarılı (2xx OK)</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.success2xx}</span>
            <span className="text-[11px] text-emerald-700 font-bold">
              {stats.totalRequests > 0 ? `%${Math.round((stats.success2xx / stats.totalRequests) * 100)} Başarı` : "%100 Başarı"}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 ">
            <span className="text-xs text-slate-500 font-medium block">Hatalı / Yetkisiz</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{stats.error4xx + stats.error5xx}</span>
            <span className="text-[11px] text-slate-400">
              4xx: {stats.error4xx} · 5xx: {stats.error5xx}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 ">
            <span className="text-xs text-slate-500 font-medium block">Ortalama Yanıt</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.avgDuration} ms</span>
            <span className="text-[11px] text-slate-400">İç döngü süresi</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 ">
            <span className="text-xs text-slate-500 font-medium block">Benzersiz IP</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{stats.uniqueIps}</span>
            <span className="text-[11px] text-slate-400">İstemci adresleri</span>
          </div>
        </div>

        {/* Filtreleme ve Arama Çubuğu */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-xl  text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-semibold outline-none focus:border-emerald-500"
            >
              <option value="all">Tüm Metodlar</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-semibold outline-none focus:border-emerald-500"
            >
              <option value="all">Tüm Yanıt Kodları</option>
              <option value="2xx">2xx Başarılı</option>
              <option value="4xx">4xx İstemci Hatası</option>
              <option value="5xx">5xx Sunucu Hatası</option>
            </select>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="IP veya Endpoint ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Loglar Tablosu */}
        <section className="bg-white border border-slate-200 rounded-xl  overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                  <th className="py-3 px-4">Zaman</th>
                  <th className="py-3 px-4">Metod</th>
                  <th className="py-3 px-4">Durum</th>
                  <th className="py-3 px-4">Endpoint</th>
                  <th className="py-3 px-4">İstemci IP</th>
                  <th className="py-3 px-4">Gecikme</th>
                  <th className="py-3 px-4">Yetki</th>
                  <th className="py-3 px-4 text-right">Eylem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Filtre kriterlerine uygun istek kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const cleanIp = formatIp(log.ip);

                    return (
                      <Fragment key={log.id}>
                        <tr className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                            {log.timestamp}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${log.method === "POST"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : log.method === "PATCH"
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : log.method === "DELETE"
                                    ? "bg-rose-100 text-rose-800 border border-rose-300"
                                    : "bg-sky-100 text-sky-800 border border-sky-300"
                                }`}
                            >
                              {log.method}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${log.status >= 500
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : log.status >= 400
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-900 font-mono text-xs">
                            <div className="flex items-center gap-1.5 max-w-[340px]">
                              <span className="truncate" title={log.path}>
                                {log.path}
                              </span>
                              <button
                                onClick={() => copyToClipboard(log.path, `p-${log.id}`)}
                                className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition cursor-pointer"
                                title="Kopyala"
                              >
                                {copiedKey === `p-${log.id}` ? <Check /> : <Copy />}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-mono text-[11px] font-bold">
                              {cleanIp}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] font-bold">
                            <span className={log.durationMs > 500 ? "text-rose-600" : log.durationMs > 200 ? "text-amber-600" : "text-emerald-600"}>
                              {log.durationMs} ms
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                            {log.authType}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer border ${isExpanded
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                                }`}
                            >
                              {isExpanded ? "Kapat" : "İncele"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan={8} className="p-4">
                              <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs font-mono space-y-3 ">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-slate-700">
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">Tam İstek Zamanı:</strong>
                                    <span>{log.timestamp}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">İstemci IP:</strong>
                                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                      {cleanIp}
                                    </span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">Metod &amp; Yol:</strong>
                                    <span>{log.method} {log.path}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">Yanıt Kodu:</strong>
                                    <span>{log.status} ({log.durationMs}ms)</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">Yetkilendirme:</strong>
                                    <span>{log.authType}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-900 block mb-0.5 font-sans text-xs">Log Kimliği (ID):</strong>
                                    <span className="text-slate-500 text-[11px] select-all">{log.id}</span>
                                  </div>
                                </div>
                                <div className="pt-2 border-t border-slate-100">
                                  <strong className="text-slate-900 block mb-1 font-sans text-xs">User-Agent:</strong>
                                  <div className="p-2 bg-slate-50 rounded border border-slate-200 text-slate-600 text-[11px] break-all">
                                    {log.userAgent}
                                  </div>
                                </div>
                                {log.error && (
                                  <div className="pt-2 border-t border-rose-100 text-rose-700">
                                    <strong className="font-sans text-xs">Hata Detayı:</strong>
                                    <div className="p-2 bg-rose-50 rounded border border-rose-200 mt-1 text-[11px]">
                                      {log.error}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
