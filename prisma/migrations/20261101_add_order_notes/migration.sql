-- CreateTable
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_notes_orderId_idx" ON "order_notes"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_notes_orderNumber_idx" ON "order_notes"("orderNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "order_notes_createdAt_idx" ON "order_notes"("createdAt");
