-- Party master DHARA (default bill discount %) and INT. RATE (simple interest after grace).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "dhara" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "interestRate" DOUBLE PRECISION;
UPDATE "Customer" SET "dhara" = "discountRate" WHERE "dhara" IS NULL AND "discountRate" IS NOT NULL;

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "dhara" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "interestRate" DOUBLE PRECISION;
