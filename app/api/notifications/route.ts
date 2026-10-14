import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCors, handleOptions } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return handleOptions();
}

// In-memory fallback in case PostgreSQL is offline
interface FallbackNotif {
  id: string;
  type: string;
  title: string;
  message: string;
  entityId?: string;
  targetUrl: string;
  targetUser?: string;
  createdAt: string;
}

const memoryNotifs: FallbackNotif[] = [];
const memoryReads: Record<string, Record<string, boolean>> = {}; // notifId -> { userId: true }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "admin";
    const type = searchParams.get("type");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    try {
      const whereClause: any = {
        OR: [
          { targetUser: "all" },
          { targetUser: null },
          { targetUser: userId },
        ],
      };

      if (type && type !== "all") {
        whereClause.type = type;
      }

      const notifs = await prisma.notification.findMany({
        where: whereClause,
        include: {
          userReads: {
            where: { userId },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      });

      const list = notifs.map((n: any) => {
        const readRecord = n.userReads && n.userReads.length > 0 ? n.userReads[0] : null;
        return {
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          entityId: n.entityId,
          targetUrl: n.targetUrl,
          targetUser: n.targetUser,
          createdAt: n.createdAt.toISOString(),
          isRead: Boolean(readRecord),
          readAt: readRecord ? readRecord.readAt.toISOString() : null,
        };
      });

      const filteredList = unreadOnly ? list.filter((n: any) => !n.isRead) : list;
      const unreadCount = list.filter((n: any) => !n.isRead).length;

      // Grouped counts for bottom-right alert badge
      const unreadCounts = {
        review: list.filter((n: any) => !n.isRead && n.type === "review").length,
        return: list.filter((n: any) => !n.isRead && n.type === "return").length,
        cancellation: list.filter((n: any) => !n.isRead && (n.type === "cancellation" || n.type === "cancel")).length,
        order: list.filter((n: any) => !n.isRead && n.type === "order").length,
        system: list.filter((n: any) => !n.isRead && n.type === "system").length,
      };

      return withCors(
        NextResponse.json({
          success: true,
          notifications: filteredList,
          unreadCount,
          unreadCounts,
          source: "database",
        })
      );
    } catch (dbErr: any) {
      console.warn("[Notifications API] DB connection unavailable, using memory store:", dbErr.message);

      // Memory fallback
      let list = memoryNotifs.map((n) => {
        const isRead = Boolean(memoryReads[n.id]?.[userId]);
        return {
          ...n,
          isRead,
          readAt: isRead ? new Date().toISOString() : null,
        };
      });

      if (type && type !== "all") {
        list = list.filter((n) => n.type === type);
      }

      const unreadCount = list.filter((n) => !n.isRead).length;
      const unreadCounts = {
        review: list.filter((n) => !n.isRead && n.type === "review").length,
        return: list.filter((n) => !n.isRead && n.type === "return").length,
        cancellation: list.filter((n) => !n.isRead && (n.type === "cancellation" || n.type === "cancel")).length,
        order: list.filter((n) => !n.isRead && n.type === "order").length,
        system: list.filter((n) => !n.isRead && n.type === "system").length,
      };

      const filteredList = unreadOnly ? list.filter((n) => !n.isRead) : list;

      return withCors(
        NextResponse.json({
          success: true,
          notifications: filteredList,
          unreadCount,
          unreadCounts,
          source: "memory_fallback",
        })
      );
    }
  } catch (err: any) {
    return withCors(
      NextResponse.json({ success: false, message: err.message }, { status: 500 })
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      type,
      title,
      message,
      entityId,
      targetUrl = "/",
      targetUser = "all",
    } = body;

    if (!type || !title || !message) {
      return withCors(
        NextResponse.json(
          { success: false, message: "Eksik parametreler (type, title, message gereklidir)" },
          { status: 400 }
        )
      );
    }

    try {
      // 10 dakika içindeki aynı entityId ve type bildirimlerini tekilleştir
      if (entityId) {
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const existing = await prisma.notification.findFirst({
          where: {
            entityId: entityId.toString(),
            type,
            createdAt: { gte: tenMinsAgo },
          },
        });
        if (existing) {
          return withCors(
            NextResponse.json({
              success: true,
              notification: existing,
              deduplicated: true,
            })
          );
        }
      }

      const created = await prisma.notification.create({
        data: {
          type,
          title,
          message,
          entityId: entityId ? entityId.toString() : null,
          targetUrl,
          targetUser,
        },
      });

      return withCors(
        NextResponse.json({
          success: true,
          notification: created,
        })
      );
    } catch (dbErr: any) {
      console.warn("[Notifications API] DB create failed, fallback to memory:", dbErr.message);

      const id = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
      const newNotif: FallbackNotif = {
        id,
        type,
        title,
        message,
        entityId: entityId ? entityId.toString() : undefined,
        targetUrl,
        targetUser,
        createdAt: new Date().toISOString(),
      };

      const isDup = memoryNotifs.some(
        (n) => n.entityId === newNotif.entityId && n.type === newNotif.type
      );

      if (!isDup) {
        memoryNotifs.unshift(newNotif);
        if (memoryNotifs.length > 200) memoryNotifs.pop();
      }

      return withCors(
        NextResponse.json({
          success: true,
          notification: newNotif,
          source: "memory_fallback",
        })
      );
    }
  } catch (err: any) {
    return withCors(
      NextResponse.json({ success: false, message: err.message }, { status: 500 })
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, markAll, type, userId = "admin" } = body;

    try {
      // 1. Kategori bazlı otomatik okundu işaretleme (örn: Yorumlar sayfasına gidildiğinde)
      if (type) {
        const notifsOfType = await prisma.notification.findMany({
          where: {
            type: type === "cancel" ? { in: ["cancellation", "cancel"] } : type,
            NOT: {
              userReads: {
                some: { userId },
              },
            },
          },
          select: { id: true },
        });

        for (const n of notifsOfType) {
          await prisma.userNotificationRead.upsert({
            where: {
              notificationId_userId: {
                notificationId: n.id,
                userId,
              },
            },
            create: {
              notificationId: n.id,
              userId,
            },
            update: {},
          });
        }

        return withCors(
          NextResponse.json({
            success: true,
            markedType: type,
            count: notifsOfType.length,
          })
        );
      }

      // 2. Tümünü okundu işaretleme
      if (markAll) {
        const unreadNotifs = await prisma.notification.findMany({
          where: {
            NOT: {
              userReads: {
                some: { userId },
              },
            },
          },
          select: { id: true },
        });

        for (const n of unreadNotifs) {
          await prisma.userNotificationRead.upsert({
            where: {
              notificationId_userId: {
                notificationId: n.id,
                userId,
              },
            },
            create: {
              notificationId: n.id,
              userId,
            },
            update: {},
          });
        }

        return withCors(
          NextResponse.json({
            success: true,
            markedCount: unreadNotifs.length,
          })
        );
      }

      // 3. Tekil bildirim okundu işaretleme
      if (id) {
        await prisma.userNotificationRead.upsert({
          where: {
            notificationId_userId: {
              notificationId: id,
              userId,
            },
          },
          create: {
            notificationId: id,
            userId,
          },
          update: {},
        });

        return withCors(NextResponse.json({ success: true, id }));
      }

      return withCors(
        NextResponse.json(
          { success: false, message: "Geçersiz istek (id, type veya markAll belirtilmelidir)" },
          { status: 400 }
        )
      );
    } catch (dbErr: any) {
      console.warn("[Notifications API] DB mark failed, fallback to memory:", dbErr.message);

      if (type) {
        memoryNotifs
          .filter((n) => n.type === type || (type === "cancel" && n.type === "cancellation"))
          .forEach((n) => {
            if (!memoryReads[n.id]) memoryReads[n.id] = {};
            memoryReads[n.id][userId] = true;
          });
        return withCors(NextResponse.json({ success: true, markedType: type }));
      }

      if (markAll) {
        memoryNotifs.forEach((n) => {
          if (!memoryReads[n.id]) memoryReads[n.id] = {};
          memoryReads[n.id][userId] = true;
        });
        return withCors(NextResponse.json({ success: true, markAll: true }));
      }

      if (id) {
        if (!memoryReads[id]) memoryReads[id] = {};
        memoryReads[id][userId] = true;
        return withCors(NextResponse.json({ success: true, id }));
      }

      return withCors(
        NextResponse.json({ success: false, message: "Parametre eksik" }, { status: 400 })
      );
    }
  } catch (err: any) {
    return withCors(
      NextResponse.json({ success: false, message: err.message }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return withCors(
        NextResponse.json({ success: false, message: "id parametresi gereklidir" }, { status: 400 })
      );
    }

    try {
      await prisma.notification.delete({ where: { id } });
      return withCors(NextResponse.json({ success: true, deleted: true }));
    } catch {
      const idx = memoryNotifs.findIndex((n) => n.id === id);
      if (idx !== -1) {
        memoryNotifs.splice(idx, 1);
        delete memoryReads[id];
      }
      return withCors(NextResponse.json({ success: true, deleted: true }));
    }
  } catch (err: any) {
    return withCors(
      NextResponse.json({ success: false, message: err.message }, { status: 500 })
    );
  }
}
