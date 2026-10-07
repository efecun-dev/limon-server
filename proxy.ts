import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwtToken } from "@/lib/auth";
import { corsHeaders, handleOptions } from "@/lib/cors";

const publicPaths = [
  "/",
  "/login",
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/users",
  "/api/trendyol-webhook",
  "/api/updates/check",
  "/api/updates/download",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS Preflight
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  // Bypass static Next.js assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public") ||
    publicPaths.includes(pathname)
  ) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // Check Server API Key (Client apps: Limon Panel, Mobile app)
  const serverApiKey = request.headers.get("x-server-key");
  const expectedApiKey = process.env.SERVER_API_KEY;

  if (serverApiKey && expectedApiKey && serverApiKey === expectedApiKey) {
    const res = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
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
      return res;
    }
  }

  // If unauthorized for API routes, return 401 JSON
  if (pathname.startsWith("/api/")) {
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
