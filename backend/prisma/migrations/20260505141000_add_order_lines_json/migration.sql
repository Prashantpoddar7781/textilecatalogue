-- Store multiple design lines on one manual/scanned order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderLines" JSONB;
