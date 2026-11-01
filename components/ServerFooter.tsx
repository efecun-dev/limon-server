"use client";

import { usePathname } from "next/navigation";

export function ServerFooter() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <footer className="w-full border-t border-slate-800 bg-[#080d19]/95 backdrop-blur-xs py-4 px-4 sm:px-8 mt-auto text-xs text-slate-400 font-normal select-none transition-all">
      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <strong className="text-white font-bold">Limon Central Server</strong>
          <span className="text-slate-600">·</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-[10px] border border-slate-800">v3.2.0-core</span>
          <span className="text-emerald-400 font-semibold text-[11px] bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/30 hidden sm:inline-block">
            Online (Port :3001)
          </span>
        </div>

        <div className="text-[11px] text-slate-400 hidden lg:block">
          Mimari: <span className="font-medium text-slate-300">Next.js Engine + PostgreSQL (Prisma) + Redis Cache + Trendyol GO Connector</span>
        </div>

        <div className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} Limon Bilişim Sistemleri. Tüm hakları saklıdır.
        </div>
      </div>
    </footer>
  );
}

