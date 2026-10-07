import { NextRequest, NextResponse } from "next/server";
import { withCors } from "@/lib/cors";
import {
  ROLES,
  ROLE_INFO,
  PERMISSION_CATEGORIES,
  getRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  Role,
} from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET: Tüm rollerin ve kategorilerin yetki matrisini getir
export async function GET() {
  try {
    const permissions = await getRolePermissions();

    return withCors(
      NextResponse.json({
        success: true,
        roles: ROLES,
        roleInfo: ROLE_INFO,
        categories: PERMISSION_CATEGORIES,
        permissions,
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Rol yetkileri alınamadı.", error: error.message },
        { status: 500 }
      )
    );
  }
}

// POST: Rol izinlerini güncelle
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, permissions: rolePerms, allPermissions } = body;

    let updated;

    if (allPermissions) {
      // Tüm matrisi güncelle
      updated = await saveRolePermissions(allPermissions);
    } else if (role && rolePerms) {
      // Tek bir rolün izinlerini güncelle
      const validRole = role.toUpperCase() as Role;
      if (!ROLES.includes(validRole)) {
        return withCors(
          NextResponse.json(
            { success: false, message: `Geçersiz rol: ${role}` },
            { status: 400 }
          )
        );
      }

      updated = await saveRolePermissions({
        [validRole]: rolePerms,
      });
    } else {
      return withCors(
        NextResponse.json(
          { success: false, message: "Geçersiz istek gövdesi. 'role' ve 'permissions' gereklidir." },
          { status: 400 }
        )
      );
    }

    return withCors(
      NextResponse.json({
        success: true,
        message: "Rol izinleri başarıyla güncellendi.",
        permissions: updated,
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Rol izinleri güncellenirken hata oluştu.", error: error.message },
        { status: 500 }
      )
    );
  }
}

// DELETE: Rol izinlerini varsayılanlara sıfırla
export async function DELETE() {
  try {
    const reset = await resetRolePermissions();

    return withCors(
      NextResponse.json({
        success: true,
        message: "Rol izinleri başarıyla varsayılan fabrika ayarlarına sıfırlandı.",
        permissions: reset,
      })
    );
  } catch (error: any) {
    return withCors(
      NextResponse.json(
        { success: false, message: "İzinler sıfırlanırken hata oluştu.", error: error.message },
        { status: 500 }
      )
    );
  }
}
