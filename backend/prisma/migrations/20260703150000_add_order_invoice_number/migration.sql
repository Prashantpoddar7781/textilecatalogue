-- AlterTable
ALTER TABLE "Order" ADD COLUMN "invoiceNumber" INTEGER;

-- Backfill earliest orders with invoice numbers starting from 1 per user
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Order"
)
UPDATE "Order" AS o
SET "invoiceNumber" = numbered.rn
FROM numbered
WHERE o.id = numbered.id;

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_invoiceNumber_key" ON "Order"("userId", "invoiceNumber");
