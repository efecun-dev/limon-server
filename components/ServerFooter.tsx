"use client";

import { usePathname } from "next/navigation";

export function ServerFooter() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <footer className="w-full border-t border-slate-200 bg-white/95 backdrop-blur-xs py-4 px-4 sm:px-8 mt-auto text-xs text-slate-500 font-normal select-none transition-all">
      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <strong className="text-slate-800 font-bold">Limon Central Server</strong>
          <span className="text-slate-400">·</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">v1.2.0-prod</span>
          <span className="text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 hidden sm:inline-block">
            Online (Port :3001)
          </span>
        </div>

        <div className="text-[11px] text-slate-500 hidden lg:block">
          Mimari: <span className="font-medium text-slate-700">Next.js App Engine + PostgreSQL (Prisma) + Single-Flight Coalescing + Trendyol GO Connector</span>
        </div>

        <div className="text-[11px] text-slate-400">
          © {new Date().getFullYear()} Limon Bilişim Sistemleri. Tüm hakları saklıdır.
        </div>
      </div>
    </footer>
  );
}
