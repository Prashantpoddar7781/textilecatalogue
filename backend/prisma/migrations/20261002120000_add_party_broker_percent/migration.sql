-- Default brokerage % on a party. Receipts can override it per customer + broker.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "brokerPercent" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "brokerPercent" DOUBLE PRECISION;
