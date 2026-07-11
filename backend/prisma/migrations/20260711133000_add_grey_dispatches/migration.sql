-- CreateTable
CREATE TABLE "GreyDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "greyPurchaseId" TEXT NOT NULL,
    "companyName" TEXT,
    "transactionType" TEXT NOT NULL DEFAULT 'PROCESS',
    "challanNo" TEXT,
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "millLotNo" TEXT,
    "purSr" INTEGER,
    "millName" TEXT NOT NULL,
    "ourMarka" TEXT,
    "purBillNo" TEXT,
    "purDate" TIMESTAMP(3),
    "weaverName" TEXT,
    "quality" TEXT,
    "cut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "despTaka" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "despMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "takaDetails" JSONB,
    "remark" TEXT,
    "brokerName" TEXT,
    "orderNo" TEXT,
    "checkerName" TEXT,
    "vehicleNo" TEXT,
    "ewayBillNo" TEXT,
    "srNo" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreyDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GreyDispatch_userId_idx" ON "GreyDispatch"("userId");
CREATE INDEX "GreyDispatch_greyPurchaseId_idx" ON "GreyDispatch"("greyPurchaseId");
CREATE INDEX "GreyDispatch_dispatchDate_idx" ON "GreyDispatch"("dispatchDate");
CREATE INDEX "GreyDispatch_purSr_idx" ON "GreyDispatch"("purSr");
CREATE INDEX "GreyDispatch_millName_idx" ON "GreyDispatch"("millName");
CREATE INDEX "GreyDispatch_status_idx" ON "GreyDispatch"("status");

-- AddForeignKey
ALTER TABLE "GreyDispatch" ADD CONSTRAINT "GreyDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreyDispatch" ADD CONSTRAINT "GreyDispatch_greyPurchaseId_fkey" FOREIGN KEY ("greyPurchaseId") REFERENCES "GreyPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
