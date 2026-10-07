import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwtToken } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { addApiLog, extractClientIp } from "@/lib/logger";

const publicPaths = [
  "/",
  "/login",
  "/logs",
  "/api/logs",
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/users",
  "/api/trendyol-webhook",
  "/api/updates/check",
  "/api/updates/download",
];

export async function proxy(request: NextRequest) {
  const startTime = Date.now();
  const { pathname, search } = request.nextUrl;
  const fullPath = pathname + (search || "");
  const method = request.method;
  const clientIp = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "Bilinmiyor";

  // Handle CORS Preflight
  if (method === "OPTIONS") {
    return handleOptions();
  }

  // Bypass static Next.js assets & frontend pages
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public") ||
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/logs"
  ) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // Public API paths (e.g. /api/health, /api/auth/login, /api/logs)
  if (publicPaths.includes(pathname)) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));

    // Log public API requests (skip /api/logs to prevent self-logging spam)
    if (pathname.startsWith("/api/") && pathname !== "/api/logs") {
      addApiLog({
        method,
        path: fullPath,
        ip: clientIp,
        status: 200,
        durationMs: Date.now() - startTime,
        userAgent,
        authType: "Açık (Public)",
      });
    }

    return res;
  }

  // Check Server API Key (Client apps: Limon Panel, Mobile app)
  const serverApiKey = request.headers.get("x-server-key");
  const expectedApiKey = process.env.SERVER_API_KEY;

  if (serverApiKey && expectedApiKey && serverApiKey === expectedApiKey) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));

    if (pathname.startsWith("/api/") && pathname !== "/api/logs") {
      addApiLog({
        method,
        path: fullPath,
        ip: clientIp,
        status: 200,
        durationMs: Date.now() - startTime,
        userAgent,
        authType: "X-Server-Key",
      });
    }

    return res;
  }

  // Check JWT Bearer token or cookie
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = request.cookies.get("auth-token")?.value || bearerToken;

  if (token) {
    const payload = await verifyJwtToken(token);
    if (payload) {
      const res = NextResponse.next();
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));

      if (pathname.startsWith("/api/") && pathname !== "/api/logs") {
        addApiLog({
          method,
          path: fullPath,
          ip: clientIp,
          status: 200,
          durationMs: Date.now() - startTime,
          userAgent,
          authType: "JWT Bearer",
        });
      }

      return res;
    }
  }

  // If unauthorized for API routes, log 401 and return JSON
  if (pathname.startsWith("/api/")) {
    if (pathname !== "/api/logs") {
      addApiLog({
        method,
        path: fullPath,
        ip: clientIp,
        status: 401,
        durationMs: Date.now() - startTime,
        userAgent,
        authType: "Yok / Geçersiz",
        error: "401 Unauthorized",
      });
    }

    return new NextResponse(
      JSON.stringify({
        success: false,
        error: "Unauthorized",
        message: "Yetkisiz erişim. Geçerli bir X-Server-Key veya Bearer token gereklidir.",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  // For frontend pages, redirect to login if not authenticated
  const res = NextResponse.next();
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
