-- Header fields shown on the legacy Sales Order / Finish Sales form.
ALTER TABLE "SalesOrder"
  ADD COLUMN "challanNo" TEXT,
  ADD COLUMN "gstType" TEXT,
  ADD COLUMN "hasteGstin" TEXT,
  ADD COLUMN "dhara" DOUBLE PRECISION,
  ADD COLUMN "grace" DOUBLE PRECISION,
  ADD COLUMN "screenSeries" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "challanNo" TEXT,
  ADD COLUMN "gstType" TEXT,
  ADD COLUMN "lrNo" TEXT,
  ADD COLUMN "hasteGstin" TEXT,
  ADD COLUMN "vehicleNo" TEXT,
  ADD COLUMN "dhara" DOUBLE PRECISION,
  ADD COLUMN "grace" DOUBLE PRECISION,
  ADD COLUMN "screenSeries" TEXT;
