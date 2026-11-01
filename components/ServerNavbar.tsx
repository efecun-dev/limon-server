"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Bell, ChartPie, ClipboardClock, Cog } from "lucide-react"

export function ServerNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("limon_user");
        if (raw) setUser(JSON.parse(raw));
      } catch { }
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { }
    if (typeof window !== "undefined") {
      localStorage.removeItem("limon_user");
      localStorage.removeItem("limon_token");
      document.cookie = "auth-token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
    }
  };

  const navItems = [
    { href: "/", label: "Sistem Durumu", icon: <ChartPie size={12} /> },
    { href: "/logs", label: "İstek Logları", icon: <ClipboardClock size={12} /> },
    { href: "/notifications", label: "Bildirimler", icon: <Bell size={12} /> },
    { href: "/settings", label: "Ayarlar & RBAC", icon: <Cog size={12} /> },
  ];

  if (pathname === "/login") return null;

  return (
    <header className="w-full bg-[#080d19]/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-40">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Sol Kısım: Logo & Aktif Port Rozeti */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center group-hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white tracking-tight">
                  Limon Central Server
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Port :3001
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Orta Kısım: Sayfa Yönlendirme Sekmeleri */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive
                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/40"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent"
                  }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sağ Kısım: Kullanıcı Profili & Çıkış */}
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-bold text-white">{user?.username || "admin"}</span>
            <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 py-0.2 bg-slate-800 rounded border border-slate-700">
              {user?.role || "ADMIN"}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-red-500/50 bg-slate-900 hover:bg-red-950/40 text-slate-300 hover:text-red-400 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
            title="Güvenli Çıkış"
          >
            <span>Çıkış</span>
            <span className="text-slate-500 hover:text-red-400">✕</span>
          </button>
        </div>

      </div>
    </header>
  );
}

export default ServerNavbar;
