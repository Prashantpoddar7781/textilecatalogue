-- Manual orders: optional design, remarks, batch grouping
ALTER TABLE "Order" ALTER COLUMN "designId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "manualType" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "manualBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_manualBatchId_idx" ON "Order"("manualBatchId");
