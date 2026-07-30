-- CreateTable
CREATE TABLE "WorkDespatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "transactionType" TEXT NOT NULL DEFAULT 'WORK DESP.SUIT CHALLAN',
    "partyName" TEXT NOT NULL,
    "partyGstin" TEXT,
    "placeOfSupply" TEXT,
    "stateCode" TEXT,
    "gstType" TEXT,
    "challanNo" TEXT,
    "despatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brokerName" TEXT,
    "vehicleNo" TEXT,
    "workType" TEXT,
    "hsnCode" TEXT DEFAULT '5407',
    "remarks" TEXT,
    "receivedBy" TEXT,
    "deliveryDays" INTEGER NOT NULL DEFAULT 0,
    "deliveryDueDate" TIMESTAMP(3),
    "lrNo" TEXT,
    "ewayBillNo" TEXT,
    "dhara" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grace" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rateInChallan" BOOLEAN NOT NULL DEFAULT false,
    "srNo" INTEGER,
    "lineItems" JSONB NOT NULL,
    "totalBundles" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPcs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDespatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDespatchId" TEXT NOT NULL,
    "companyName" TEXT,
    "transactionType" TEXT NOT NULL DEFAULT 'WORK REC. CHALLAN',
    "partyName" TEXT NOT NULL,
    "partyGstin" TEXT,
    "placeOfSupply" TEXT,
    "stateCode" TEXT,
    "gstType" TEXT,
    "challanNo" TEXT,
    "voucherNo" INTEGER,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brokerName" TEXT,
    "vehicleNo" TEXT,
    "workType" TEXT,
    "hsnCode" TEXT DEFAULT '5407',
    "remarks" TEXT,
    "receivedBy" TEXT,
    "billNo" TEXT,
    "lineItems" JSONB NOT NULL,
    "totalPcs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkDespatch_userId_idx" ON "WorkDespatch"("userId");
CREATE INDEX "WorkDespatch_despatchDate_idx" ON "WorkDespatch"("despatchDate");
CREATE INDEX "WorkDespatch_partyName_idx" ON "WorkDespatch"("partyName");
CREATE INDEX "WorkDespatch_challanNo_idx" ON "WorkDespatch"("challanNo");
CREATE INDEX "WorkDespatch_status_idx" ON "WorkDespatch"("status");

CREATE INDEX "WorkReceipt_userId_idx" ON "WorkReceipt"("userId");
CREATE INDEX "WorkReceipt_workDespatchId_idx" ON "WorkReceipt"("workDespatchId");
CREATE INDEX "WorkReceipt_receiptDate_idx" ON "WorkReceipt"("receiptDate");
CREATE INDEX "WorkReceipt_partyName_idx" ON "WorkReceipt"("partyName");
CREATE INDEX "WorkReceipt_status_idx" ON "WorkReceipt"("status");

-- AddForeignKey
ALTER TABLE "WorkDespatch" ADD CONSTRAINT "WorkDespatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkReceipt" ADD CONSTRAINT "WorkReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkReceipt" ADD CONSTRAINT "WorkReceipt_workDespatchId_fkey" FOREIGN KEY ("workDespatchId") REFERENCES "WorkDespatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
