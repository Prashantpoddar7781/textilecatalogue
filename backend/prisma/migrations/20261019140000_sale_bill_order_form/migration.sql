-- A Finish Sales bill can remember the catalogue order form it was copied from.
ALTER TABLE "Order" ADD COLUMN "sourceOrderFormId" TEXT;

CREATE INDEX "Order_sourceOrderFormId_idx" ON "Order"("sourceOrderFormId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceOrderFormId_fkey"
  FOREIGN KEY ("sourceOrderFormId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
