import { NextRequest, NextResponse } from "next/server";
import { signJwtToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCors } from "@/lib/cors";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, userId, password } = body;

    const identifier = username || userId;

    if (!identifier || !password) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Kullanıcı seçimi/adı ve şifre zorunludur." },
          { status: 400 }
        )
      );
    }

    let user: any = null;
    let isDbChecked = false;

    // 1. Veritabanından kullanıcıyı ara
    try {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: identifier },
            { id: identifier },
          ],
          isActive: true,
        },
        include: {
          branch: true,
        },
      });
      isDbChecked = true;
    } catch (dbError) {
      console.warn("Veritabanı bağlantısı kurulamadı veya tablo hazır değil, fallback kontrol yapılıyor:", dbError);
    }

    // 2. Veritabanında kullanıcı bulunduysa şifre doğrulaması yap
    if (user) {
      const isPasswordValid = await verifyPassword(password, user.password);

      if (!isPasswordValid) {
        return withCors(
          NextResponse.json(
            { success: false, message: "Kullanıcı adı veya şifre hatalı." },
            { status: 401 }
          )
        );
      }

      // Son giriş tarihini asenkron güncelle
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch {}

      // JWT Token üret
      const token = await signJwtToken({
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch?.name || null,
      });

      const userResponse = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        branch: user.branch ? { id: user.branch.id, name: user.branch.name } : null,
      };

      const response = NextResponse.json(
        {
          success: true,
          message: "Giriş başarılı.",
          token,
          user: userResponse,
        },
        { status: 200 }
      );

      response.cookies.set({
        name: "auth-token",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 1 day
      });

      return withCors(response);
    }

    // 3. Fallback: Veritabanı yoksa veya veritabanında bulunamadıysa .env.local admin kontrolü
    const envAdminUser = process.env.ADMIN_USERNAME || "admin";
    const envAdminPass = process.env.ADMIN_PASSWORD || "Trendyolpanel55.";

    if (identifier === envAdminUser && password === envAdminPass) {
      const token = await signJwtToken({
        userId: "env-admin",
        username: envAdminUser,
        name: "Sistem Yöneticisi",
        role: "ADMIN",
        branchId: null,
      });

      const response = NextResponse.json(
        {
          success: true,
          message: "Giriş başarılı (Sistem Admini).",
          token,
          user: {
            id: "env-admin",
            username: envAdminUser,
            name: "Sistem Yöneticisi",
            role: "ADMIN",
            branchId: null,
            branch: null,
          },
        },
        { status: 200 }
      );

      response.cookies.set({
        name: "auth-token",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });

      return withCors(response);
    }

    return withCors(
      NextResponse.json(
        { success: false, message: "Kullanıcı adı veya şifre hatalı." },
        { status: 401 }
      )
    );
  } catch (error: any) {
    console.error("Giriş işlemi sırasında hata:", error);
    return withCors(
      NextResponse.json(
        { success: false, message: "Sunucu hatası oluştu.", details: error.message },
        { status: 500 }
      )
    );
  }
}
