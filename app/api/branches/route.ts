import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCors } from "@/lib/cors";
import { BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    // 1. Veritabanından şubeleri çek
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { name: "asc" },
    });

    if (branches && branches.length > 0) {
      return withCors(
        NextResponse.json({
          success: true,
          branches,
          total: branches.length,
          source: "database",
        })
      );
    }

    // 2. Fallback: Veritabanında şube yoksa lib/branches.ts listesini dön
    const fallbackBranches = Object.entries(BRANCHES).map(([id, name]) => ({
      id,
      name,
      isActive: true,
      _count: { users: 0 },
    }));

    return withCors(
      NextResponse.json({
        success: true,
        branches: fallbackBranches,
        total: fallbackBranches.length,
        source: "fallback",
      })
    );
  } catch (error: any) {
    const fallbackBranches = Object.entries(BRANCHES).map(([id, name]) => ({
      id,
      name,
      isActive: true,
      _count: { users: 0 },
    }));

    return withCors(
      NextResponse.json({
        success: true,
        branches: fallbackBranches,
        total: fallbackBranches.length,
        source: "fallback",
        error: error.message,
      })
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, address, phone } = body;

    if (!id || !name) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Şube ID ve adı zorunludur." },
          { status: 400 }
        )
      );
    }

    const branch = await prisma.branch.upsert({
      where: { id: String(id) },
      update: { name, address, phone, isActive: true },
      create: { id: String(id), name, address, phone, isActive: true },
    });

    return withCors(
      NextResponse.json({
        success: true,
        branch,
        message: "Şube başarıyla kaydedildi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Şube kaydedilemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}
