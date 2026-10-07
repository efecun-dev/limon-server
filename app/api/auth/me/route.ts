import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCors } from "@/lib/cors";
import { getUserPermissions } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  try {
    // 1. Token'ı Authorization başlığından veya Cookie'den al
    const authHeader = req.headers.get("authorization");
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get("auth-token")?.value || "";
    }

    if (!token) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Yetkilendirme belirteci bulunamadı." },
          { status: 401 }
        )
      );
    }

    const payload = await verifyJwtToken(token);

    if (!payload) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Geçersiz veya süresi dolmuş oturum." },
          { status: 401 }
        )
      );
    }

    // 2. Kullanıcıyı veritabanından doğrula
    let userDetails = null;
    try {
      if (payload.userId && payload.userId !== "env-admin") {
        userDetails = await prisma.user.findUnique({
          where: { id: payload.userId as string },
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            isActive: true,
          },
        });
      }
    } catch {}

    const user = userDetails || {
      id: payload.userId,
      username: payload.username,
      name: payload.name || payload.username,
      role: payload.role,
      branchId: payload.branchId || null,
      branch: payload.branchName ? { id: payload.branchId, name: payload.branchName } : null,
    };

    const userRole = (user.role || "USER").toString();
    const permissions = await getUserPermissions(userRole);

    return withCors(
      NextResponse.json({
        success: true,
        user: {
          ...user,
          permissions,
        },
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Oturum doğrulanamadı.", error: error.message },
        { status: 500 }
      )
    );
  }
}
