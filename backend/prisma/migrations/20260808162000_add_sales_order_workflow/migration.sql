-- Dedicated non-accounting sales orders and ERP sales item master.
CREATE TABLE "SalesOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerId" TEXT,
  "companyName" TEXT,
  "partyName" TEXT NOT NULL,
  "partyGstin" TEXT,
  "state" TEXT,
  "station" TEXT,
  "brokerName" TEXT,
  "transportName" TEXT,
  "vehicleNo" TEXT,
  "lrNo" TEXT,
  "orderNo" INTEGER NOT NULL,
  "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDate" TIMESTAMP(3),
  "haste" TEXT,
  "remarks" TEXT,
  "hsnCode" TEXT DEFAULT '5407',
  "lineItems" JSONB NOT NULL,
  "totalBundles" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalPcs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesItemMaster" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mainScreen" TEXT NOT NULL,
  "packing" TEXT DEFAULT 'NAKED',
  "cut" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "greyQuality" TEXT,
  "finishType" TEXT DEFAULT 'FINISH',
  "itemType" TEXT DEFAULT 'SAREE',
  "screenSeries" TEXT,
  "category" TEXT,
  "unit" TEXT DEFAULT 'PCS',
  "sellingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate2" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rate3" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "workCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hsnSac" TEXT,
  "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesItemMaster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "sourceSalesOrderId" TEXT;

CREATE UNIQUE INDEX "SalesOrder_userId_orderNo_key" ON "SalesOrder"("userId", "orderNo");
CREATE INDEX "SalesOrder_userId_idx" ON "SalesOrder"("userId");
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");
CREATE INDEX "SalesOrder_partyName_idx" ON "SalesOrder"("partyName");
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");
CREATE UNIQUE INDEX "SalesItemMaster_userId_name_mainScreen_key" ON "SalesItemMaster"("userId", "name", "mainScreen");
CREATE INDEX "SalesItemMaster_userId_idx" ON "SalesItemMaster"("userId");
CREATE INDEX "SalesItemMaster_mainScreen_idx" ON "SalesItemMaster"("mainScreen");
CREATE INDEX "SalesItemMaster_name_idx" ON "SalesItemMaster"("name");
CREATE INDEX "Order_sourceSalesOrderId_idx" ON "Order"("sourceSalesOrderId");

ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesItemMaster" ADD CONSTRAINT "SalesItemMaster_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceSalesOrderId_fkey"
  FOREIGN KEY ("sourceSalesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
