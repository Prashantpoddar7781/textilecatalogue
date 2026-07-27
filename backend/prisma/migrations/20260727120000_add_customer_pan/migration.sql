-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "panNumber" TEXT;

-- CreateIndex
CREATE INDEX "Customer_gstNumber_idx" ON "Customer"("gstNumber");
