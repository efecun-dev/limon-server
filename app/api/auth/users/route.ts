import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    // 1. Veritabanından aktif kullanıcıları çek
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
      },
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
      },
      orderBy: {
        name: "asc",
      },
    });

    if (users && users.length > 0) {
      return withCors(
        NextResponse.json({
          success: true,
          users,
          total: users.length,
          source: "database",
        })
      );
    }

    // 2. Fallback: Veritabanında henüz kullanıcı yoksa varsayılan kullanıcıları dön
    const fallbackUsers = [
      {
        id: "admin-fallback",
        username: process.env.ADMIN_USERNAME || "admin",
        name: "Sistem Yöneticisi (Admin)",
        role: "ADMIN",
        branchId: null,
        branch: null,
      },
      {
        id: "yonetici-fallback",
        username: "yonetici",
        name: "Operasyon Yöneticisi",
        role: "MANAGER",
        branchId: null,
        branch: null,
      },
    ];

    return withCors(
      NextResponse.json({
        success: true,
        users: fallbackUsers,
        total: fallbackUsers.length,
        source: "fallback",
      })
    );
  } catch (error: any) {
    console.warn("Kullanıcılar veritabanından çekilemedi, fallback dönülüyor:", error.message);

    const fallbackUsers = [
      {
        id: "admin-fallback",
        username: process.env.ADMIN_USERNAME || "admin",
        name: "Sistem Yöneticisi (Admin)",
        role: "ADMIN",
        branchId: null,
        branch: null,
      },
    ];

    return withCors(
      NextResponse.json({
        success: true,
        users: fallbackUsers,
        total: fallbackUsers.length,
        source: "fallback",
        error: error.message,
      })
    );
  }
}
