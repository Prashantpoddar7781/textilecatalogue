-- Finish Purchase header fields (mirror Finish Sales entry)
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "partyGstin" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "partyMsme" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "station" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "agentName" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "haste" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "hasteGstin" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "transportName" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "lrNo" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "vehicleNo" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "gstType" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "dhara" DOUBLE PRECISION;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "grace" DOUBLE PRECISION;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "screenSeries" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "challanNo" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "orderRef" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "supplierBillNo" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseBill_agentName_idx" ON "PurchaseBill"("agentName");
CREATE INDEX IF NOT EXISTS "PurchaseBill_station_idx" ON "PurchaseBill"("station");
