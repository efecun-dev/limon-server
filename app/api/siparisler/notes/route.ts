import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/siparisler/notes
// Desteklenen parametreler:
// - orderId: Tek sipariş ID veya paket ID
// - orderNumber: Tek sipariş numarası
// - orderIds: Virgülle ayrılmış sipariş ID'leri (toplu listeleme için optimize)
export async function GET(request: Request) {
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

      const notes = await prisma.orderNote.findMany({
        where: {
          OR: [{ orderId: { in: ids } }, { orderNumber: { in: ids } }],
        },
        orderBy: { createdAt: "asc" },
      });

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

    // 2. Tek Sipariş Not Sorgusu
    if (!orderId && !orderNumber) {
      return NextResponse.json(
        { success: false, error: "orderId veya orderNumber parametresi zorunludur." },
        { status: 400 }
      );
    }

    const whereConditions: any[] = [];
    if (orderId) whereConditions.push({ orderId });
    if (orderNumber) whereConditions.push({ orderNumber });

    const notes = await prisma.orderNote.findMany({
      where: {
        OR: whereConditions,
      },
      orderBy: { createdAt: "asc" },
    });

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
// Body: { orderId: string, orderNumber?: string, authorName: string, authorId?: string, note: string }
export async function POST(request: Request) {
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

    const newNote = await prisma.orderNote.create({
      data: {
        orderId: String(orderId || orderNumber),
        orderNumber: orderNumber ? String(orderNumber) : null,
        authorName: cleanAuthor,
        authorId: authorId ? String(authorId) : null,
        note: trimmedNote,
      },
    });

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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id parametresi zorunludur." },
        { status: 400 }
      );
    }

    await prisma.orderNote.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error("[OrderNotes] DELETE Hatası:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Not silinemedi." },
      { status: 500 }
    );
  }
}
