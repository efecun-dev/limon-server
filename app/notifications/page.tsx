"use client";

import { useState, useEffect, useCallback } from "react";
import { ServerNavbar } from "@/components/ServerNavbar";
import { ServerFooter } from "@/components/ServerFooter";
import { Bell, Package, RefreshCw, RotateCcw, Star, TriangleAlert } from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityId?: string;
  targetUrl: string;
  targetUser?: string;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [testType, setTestType] = useState<string>("review");
  const [testTitle, setTestTitle] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?userId=admin", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch (e: any) {
      console.error("Notifications fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTitle.trim() || !testMessage.trim()) return;

    setIsSending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: testType,
          title: testTitle.trim(),
          message: testMessage.trim(),
          targetUrl: testType === "review" ? "/yorumlar" : testType === "return" ? "/iadeler" : testType === "cancellation" ? "/iptal-analizi" : "/siparisler",
          targetUser: "all",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback("✓ Bildirim başarıyla veritabanına kaydedildi ve tüm kullanıcılara dağıtıldı.");
        setTestTitle("");
        setTestMessage("");
        fetchNotifications();
      } else {
        setFeedback("✕ Hata: " + (data.message || "Bilinmeyen hata"));
      }
    } catch (err: any) {
      setFeedback("✕ İstek başarısız: " + err.message);
    } finally {
      setIsSending(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch { }
  };

  const filtered = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "critical") return ["return", "cancellation", "review"].includes(n.type);
    return n.type === activeTab;
  });

  const counts = {
    all: notifications.length,
    review: notifications.filter((n) => n.type === "review").length,
    return: notifications.filter((n) => n.type === "return").length,
    cancellation: notifications.filter((n) => n.type === "cancellation" || n.type === "cancel").length,
    order: notifications.filter((n) => n.type === "order").length,
    system: notifications.filter((n) => n.type === "system").length,
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <ServerNavbar />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl ">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Veritabanı Bildirim Yönetimi
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Prisma &amp; PostgreSQL
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Her kullanıcı için bağımsız okundu durumu; İade, İptal ve Yorum için anlık alarm entegrasyonu
            </p>
          </div>

          <button
            onClick={fetchNotifications}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 "
          >
            <span><RotateCcw size={12} /> Listeyi Yenile</span>
          </button>
        </div>

        {/* 4 Özet Kartı */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 p-4 rounded-xl ">
            <span className="text-xs font-medium text-slate-500">Toplam Kayıt</span>
            <span className="text-2xl font-black text-slate-900 block mt-1">{counts.all}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Veritabanında saklanan</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-xl ">
            <span className="text-xs font-medium text-amber-700">Müşteri Yorumları</span>
            <span className="text-2xl font-black text-amber-600 block mt-1">{counts.review}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Yorum yönetimi alarmları</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-xl ">
            <span className="text-xs font-medium text-rose-700">İade &amp; İptaller</span>
            <span className="text-2xl font-black text-rose-600 block mt-1">{counts.return + counts.cancellation}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Acil işlem bekleyenler</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-xl ">
            <span className="text-xs font-medium text-blue-700">Sipariş &amp; Sistem</span>
            <span className="text-2xl font-black text-blue-600 block mt-1">{counts.order + counts.system}</span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Sipariş akış kayıtları</span>
          </div>
        </div>

        {/* Test Bildirimi Gönderme Formu */}
        <section className="bg-white border border-slate-200 p-5 rounded-xl  space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Test Bildirimi Gönder (Canlı Doğrulama)
          </h2>
          <p className="text-xs text-slate-500">
            Sisteme yeni bildirim ekleyin; paneldeki sağ alt köşe alarmını ve bağımsız kullanıcı okundu durumunu test edin.
          </p>

          {feedback && (
            <div className={`p-2.5 rounded-lg text-xs font-bold border ${feedback.startsWith("✓")
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
              }`}>
              {feedback}
            </div>
          )}

          <form onSubmit={handleCreateNotification} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
            <div className="sm:col-span-3">
              <label className="block text-slate-600 font-bold mb-1">Bildirim Tipi</label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-semibold outline-none focus:border-emerald-500"
              >
                <option value="review">Yorum (Müşteri Değerlendirmesi)</option>
                <option value="return">İade Talebi</option>
                <option value="cancellation">İptal Bildirimi</option>
                <option value="order">Yeni Sipariş</option>
                <option value="system">Sistem Uyarısı</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-slate-600 font-bold mb-1">Başlık</label>
              <input
                type="text"
                required
                placeholder="Örn: Yeni 5 Yıldızlı Yorum Geldi"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-slate-600 font-bold mb-1">Mesaj / Detay</label>
              <input
                type="text"
                required
                placeholder="Örn: Atakum Gross şubesine mükemmel yorum yapıldı."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-1 flex items-end">
              <button
                type="submit"
                disabled={isSending}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition disabled:opacity-50 cursor-pointer "
              >
                {isSending ? "..." : "Oluştur"}
              </button>
            </div>
          </form>
        </section>

        {/* Sekmeler & Filtre */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          {[
            { id: "all", label: `Tümü (${counts.all})` },
            { id: "critical", label: `Önemli (İade / İptal / Yorum: ${counts.return + counts.cancellation + counts.review})` },
            { id: "review", label: `Yorumlar (${counts.review})` },
            { id: "return", label: `İadeler (${counts.return})` },
            { id: "cancellation", label: `İptaller (${counts.cancellation})` },
            { id: "order", label: `Siparişler (${counts.order})` },
            { id: "system", label: `Sistem (${counts.system})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${activeTab === tab.id
                ? "bg-slate-900 text-white "
                : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bildirimler Tablosu */}
        <section className="bg-white border border-slate-200 rounded-xl  overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                  <th className="py-3 px-4">Tür</th>
                  <th className="py-3 px-4">Başlık &amp; Mesaj</th>
                  <th className="py-3 px-4">Hedef Sayfa</th>
                  <th className="py-3 px-4">Oluşturulma</th>
                  <th className="py-3 px-4">Kişisel Okundu Durumu</th>
                  <th className="py-3 px-4 text-right">Eylem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Bu kategoride kayıtlı bildirim bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filtered.map((n) => {
                    const badgeStyles: Record<string, string> = {
                      review: "bg-amber-100 text-amber-800 border-amber-300",
                      return: "bg-rose-100 text-rose-800 border-rose-300",
                      cancellation: "bg-rose-100 text-rose-800 border-rose-300",
                      cancel: "bg-rose-100 text-rose-800 border-rose-300",
                      order: "bg-blue-100 text-blue-800 border-blue-300",
                      system: "bg-slate-100 text-slate-700 border-slate-300",
                    };
                    const currentBadge = badgeStyles[n.type] || badgeStyles.system;

                    return (
                      <tr key={n.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${currentBadge}`}>
                            {n.type === "review"
                              ? "YORUM"
                              : n.type === "return"
                                ? "İADE"
                                : n.type === "cancellation" || n.type === "cancel"
                                  ? "İPTAL"
                                  : n.type === "order"
                                    ? "SİPARİŞ"
                                    : "SİSTEM"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{n.title}</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">{n.message}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <code className="text-[11px] font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                            {n.targetUrl}
                          </code>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {new Date(n.createdAt).toLocaleString("tr-TR")}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {n.isRead ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <span>✓</span> Okundu
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <span>●</span> Okunmadı
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDelete(n.id)}
                            className="px-2 py-1 rounded bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-300 text-xs font-semibold transition cursor-pointer"
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      <ServerFooter />
    </div>
  );
}
