import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { withCors } from "@/lib/cors";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({
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
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return withCors(
      NextResponse.json({
        success: true,
        users,
        total: users.length,
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Kullanıcılar listelenemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, name, password, role, branchId } = body;

    if (!username || !name || !password) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Kullanıcı adı, isim ve şifre zorunludur." },
          { status: 400 }
        )
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Bu kullanıcı adı zaten kullanılıyor." },
          { status: 400 }
        )
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        name,
        password: hashedPassword,
        role: (role as Role) || Role.USER,
        branchId: branchId || null,
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
        isActive: true,
        createdAt: true,
      },
    });

    return withCors(
      NextResponse.json({
        success: true,
        user,
        message: "Kullanıcı başarıyla oluşturuldu.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Kullanıcı oluşturulamadı.", error: error.message },
        { status: 500 }
      )
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, isActive, role, branchId, name, password } = body;

    if (!id) {
      return withCors(
        NextResponse.json({ success: false, message: "Kullanıcı ID gereklidir." }, { status: 400 })
      );
    }

    const dataToUpdate: any = {};
    if (typeof isActive === "boolean") dataToUpdate.isActive = isActive;
    if (role) dataToUpdate.role = role as Role;
    if (branchId !== undefined) dataToUpdate.branchId = branchId || null;
    if (name) dataToUpdate.name = name;
    if (password) {
      dataToUpdate.password = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    return withCors(
      NextResponse.json({
        success: true,
        user: updated,
        message: "Kullanıcı güncellendi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Kullanıcı güncellenemedi.", error: error.message },
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
        NextResponse.json({ success: false, message: "Kullanıcı ID gereklidir." }, { status: 400 })
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (user?.username === "admin") {
      return withCors(
        NextResponse.json({ success: false, message: "Ana admin hesabı silinemez." }, { status: 403 })
      );
    }

    await prisma.user.delete({ where: { id } });

    return withCors(
      NextResponse.json({
        success: true,
        message: "Kullanıcı başarıyla silindi.",
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Kullanıcı silinemedi.", error: error.message },
        { status: 500 }
      )
    );
  }
}
