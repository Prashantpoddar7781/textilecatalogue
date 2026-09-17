-- E-way bill stamped on a saved sales document (Order = Finish Sales bill).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillNo" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillValidUpto" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillMode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillDistance" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillTransporterId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ewayBillRaw" JSONB;

-- Per-company e-way bill API access. Secrets are stored encrypted by the app.
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbMode" TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbProvider" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbBaseUrl" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbClientId" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbClientSecret" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbUsername" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbPassword" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbGstin" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "ewbDefaultDistance" INTEGER;
