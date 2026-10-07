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
    const branches = await prisma.branch.findMany({
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, address, phone, isActive } = body;

    if (!id) {
      return withCors(
        NextResponse.json({ success: false, message: "Şube ID gereklidir." }, { status: 400 })
      );
    }

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;
    if (address !== undefined) dataToUpdate.address = address;
    if (phone !== undefined) dataToUpdate.phone = phone;
    if (typeof isActive === "boolean") dataToUpdate.isActive = isActive;

    const updated = await prisma.branch.update({
      where: { id: String(id) },
      data: dataToUpdate,
    });

    return withCors(
      NextResponse.json({
        success: true,
        branch: updated,
        message: "Şube güncellendi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Şube güncellenemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return withCors(
        NextResponse.json({ success: false, message: "Şube ID gereklidir." }, { status: 400 })
      );
    }

    await prisma.branch.delete({ where: { id: String(id) } });

    return withCors(
      NextResponse.json({
        success: true,
        message: "Şube başarıyla silindi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Şube silinemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}
