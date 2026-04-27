-- Saved customers and richer manual order metadata
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "gstNumber" TEXT,
    "contactPersonName" TEXT,
    "mobileNumber" TEXT,
    "agentName" TEXT,
    "category" TEXT,
    "state" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "discountRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Customer_userId_idx" ON "Customer"("userId");
CREATE INDEX IF NOT EXISTS "Customer_organizationName_idx" ON "Customer"("organizationName");
CREATE INDEX IF NOT EXISTS "Customer_mobileNumber_idx" ON "Customer"("mobileNumber");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priceCategory" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "agentName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "transportName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountRate" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingCharge" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "expectedDate" TIMESTAMP(3);

ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX IF NOT EXISTS "Order_orderNumber_idx" ON "Order"("orderNumber");
