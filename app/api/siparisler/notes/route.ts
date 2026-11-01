import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

let isTableChecked = false;

// Veritabanında order_notes tablosunun varlığını garanti eden otomatik onarım fonksiyonu
async function ensureOrderNotesTable() {
  if (isTableChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "order_notes" (
        "id" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "orderNumber" TEXT,
        "authorName" TEXT NOT NULL,
        "authorId" TEXT,
        "note" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "order_notes_orderId_idx" ON "order_notes"("orderId");
      CREATE INDEX IF NOT EXISTS "order_notes_orderNumber_idx" ON "order_notes"("orderNumber");
      CREATE INDEX IF NOT EXISTS "order_notes_createdAt_idx" ON "order_notes"("createdAt");
    `);
    isTableChecked = true;
  } catch (err: any) {
    console.warn("[OrderNotes] ensureOrderNotesTable uyarısı:", err.message);
  }
}

// GET /api/siparisler/notes
export async function GET(request: Request) {
  await ensureOrderNotesTable();

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");
    const orderNumber = searchParams.get("orderNumber");
    const orderIdsParam = searchParams.get("orderIds");

    // 1. Toplu Not Sorgusu (Siparişler tablosu için 1 istekte tüm notları çeker)
    if (orderIdsParam) {
      const ids = orderIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        return NextResponse.json({ success: true, notesByOrder: {} });
      }

      let notes: any[] = [];
      try {
        notes = await prisma.orderNote.findMany({
          where: {
            OR: [{ orderId: { in: ids } }, { orderNumber: { in: ids } }],
          },
          orderBy: { createdAt: "asc" },
        });
      } catch (prismaErr: any) {
        // Fallback: Raw query
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
        notes = await prisma.$queryRawUnsafe(
          `SELECT * FROM "order_notes" WHERE "orderId" IN (${placeholders}) OR "orderNumber" IN (${placeholders}) ORDER BY "createdAt" ASC`,
          ...ids
        );
      }

      const notesByOrder: Record<string, typeof notes> = {};
      for (const note of notes) {
        const key = note.orderId || note.orderNumber || "unknown";
        if (!notesByOrder[key]) notesByOrder[key] = [];
        notesByOrder[key].push(note);
        if (note.orderNumber && note.orderNumber !== key) {
          if (!notesByOrder[note.orderNumber]) notesByOrder[note.orderNumber] = [];
          notesByOrder[note.orderNumber].push(note);
        }
      }

      return NextResponse.json({ success: true, notesByOrder, count: notes.length });
    }

    // 2. Tek Sipariş Not Sorgusu veya Tüm Notların Haritası
    if (!orderId && !orderNumber) {
      let allNotes: any[] = [];
      try {
        allNotes = await prisma.orderNote.findMany({
          select: { orderId: true, orderNumber: true },
        });
      } catch {
        allNotes = (await prisma.$queryRawUnsafe(
          `SELECT "orderId", "orderNumber" FROM "order_notes"`
        )) as any[];
      }

      const counts: Record<string, number> = {};
      for (const n of allNotes) {
        if (n.orderId) counts[n.orderId] = (counts[n.orderId] || 0) + 1;
        if (n.orderNumber && n.orderNumber !== n.orderId) {
          counts[n.orderNumber] = (counts[n.orderNumber] || 0) + 1;
        }
      }
      return NextResponse.json({ success: true, counts, total: allNotes.length });
    }

    let notes: any[] = [];
    try {
      const whereConditions: any[] = [];
      if (orderId) whereConditions.push({ orderId });
      if (orderNumber) whereConditions.push({ orderNumber });

      notes = await prisma.orderNote.findMany({
        where: {
          OR: whereConditions,
        },
        orderBy: { createdAt: "asc" },
      });
    } catch (e: any) {
      notes = await prisma.$queryRawUnsafe(
        `SELECT * FROM "order_notes" WHERE "orderId" = $1 OR "orderNumber" = $2 ORDER BY "createdAt" ASC`,
        orderId || "",
        orderNumber || ""
      );
    }

    return NextResponse.json({ success: true, notes });
  } catch (error: any) {
    console.error("[OrderNotes] GET Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Notlar alınamadı." },
      { status: 500 }
    );
  }
}

// POST /api/siparisler/notes
export async function POST(request: Request) {
  await ensureOrderNotesTable();

  try {
    const body = await request.json();
    const { orderId, orderNumber, authorName, authorId, note } = body;

    if (!orderId && !orderNumber) {
      return NextResponse.json(
        { success: false, error: "orderId veya orderNumber zorunludur." },
        { status: 400 }
      );
    }

    if (!note || typeof note !== "string" || !note.trim()) {
      return NextResponse.json(
        { success: false, error: "Not içeriği boş olamaz." },
        { status: 400 }
      );
    }

    const trimmedNote = note.trim();
    const cleanAuthor = (authorName || "Kullanıcı").trim();
    const targetOrderId = String(orderId || orderNumber);
    const targetOrderNumber = orderNumber ? String(orderNumber) : null;
    const targetAuthorId = authorId ? String(authorId) : null;

    let newNote: any = null;
    try {
      newNote = await prisma.orderNote.create({
        data: {
          orderId: targetOrderId,
          orderNumber: targetOrderNumber,
          authorName: cleanAuthor,
          authorId: targetAuthorId,
          note: trimmedNote,
        },
      });
    } catch (prismaErr: any) {
      // Raw SQL Fallback
      const generatedId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "order_notes" ("id", "orderId", "orderNumber", "authorName", "authorId", "note", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        generatedId,
        targetOrderId,
        targetOrderNumber,
        cleanAuthor,
        targetAuthorId,
        trimmedNote
      );

      newNote = {
        id: generatedId,
        orderId: targetOrderId,
        orderNumber: targetOrderNumber,
        authorName: cleanAuthor,
        authorId: targetAuthorId,
        note: trimmedNote,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return NextResponse.json({ success: true, note: newNote });
  } catch (error: any) {
    console.error("[OrderNotes] POST Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Not kaydedilemedi." },
      { status: 500 }
    );
  }
}

// DELETE /api/siparisler/notes?id=...
export async function DELETE(request: Request) {
  await ensureOrderNotesTable();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id parametresi zorunludur." },
        { status: 400 }
      );
    }

    try {
      await prisma.orderNote.delete({
        where: { id },
      });
    } catch (e: any) {
      await prisma.$executeRawUnsafe(`DELETE FROM "order_notes" WHERE "id" = $1`, id);
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error("[OrderNotes] DELETE Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Not silinemedi." },
      { status: 500 }
    );
  }
}
