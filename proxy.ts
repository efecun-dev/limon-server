import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwtToken } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";
import { addApiLog, extractClientIp } from "@/lib/logger";

const publicApiPaths = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/users",
  "/api/trendyol-webhook",
  "/api/updates/check",
  "/api/updates/download",
  "/api/system/telegram-notifier",
];

export async function proxy(request: NextRequest) {
  const startTime = Date.now();
  const { pathname, search } = request.nextUrl;
  const fullPath = pathname + (search || "");
  const method = request.method;
  const clientIp = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "Bilinmiyor";

  // 1. Handle CORS Preflight
  if (method === "OPTIONS") {
    return handleOptions();
  }

  // 2. Bypass static Next.js assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  ) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // 3. Token check (from Cookie or Bearer header)
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const cookieToken = request.cookies.get("auth-token")?.value;
  const token = cookieToken || bearerToken;

  let isAuthenticated = false;
  let authType = "Yok";

  if (token) {
    const payload = await verifyJwtToken(token);
    if (payload) {
      isAuthenticated = true;
      authType = cookieToken ? "Cookie Oturumu" : "JWT Bearer";
    }
  }

  // 4. Server API Key check (for Limon Panel & Mobile App background requests)
  const serverApiKey = request.headers.get("x-server-key");
  const expectedApiKey = process.env.SERVER_API_KEY;
  const isServerKeyValid = !!(serverApiKey && expectedApiKey && serverApiKey === expectedApiKey);

  if (isServerKeyValid) {
    authType = "X-Server-Key";
  }

  // 5. Handle /login page specifically
  if (pathname === "/login") {
    if (isAuthenticated) {
      // Already logged in, redirect to home dashboard
      return NextResponse.redirect(new URL("/", request.url));
    }
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // 6. Public API endpoints (e.g. /api/auth/login, /api/health)
  if (publicApiPaths.includes(pathname)) {
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
        authType: "Açık (Public)",
      });
    }

    return res;
  }

  // 7. If authenticated or valid server key, allow access
  if (isAuthenticated || isServerKeyValid) {
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
        authType,
      });
    }

    return res;
  }

  // 8. Unauthenticated Access Handling
  // If it's an API route: return 401 Unauthorized JSON
  if (pathname.startsWith("/api/")) {
    if (pathname !== "/api/logs") {
      addApiLog({
        method,
        path: fullPath,
        ip: clientIp,
        status: 401,
        durationMs: Date.now() - startTime,
        userAgent,
        authType: "Yetkisiz",
        error: "401 Unauthorized",
      });
    }

    return new NextResponse(
      JSON.stringify({
        success: false,
        error: "Unauthorized",
        message: "Yetkisiz erişim. Geçerli bir oturum veya X-Server-Key gereklidir.",
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

  // If it's a frontend panel page (/, /logs, /settings): REDIRECT TO /login
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
