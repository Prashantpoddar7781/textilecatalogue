-- AlterTable
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'stockUnit') THEN
    ALTER TABLE "Design" ADD COLUMN "stockUnit" TEXT DEFAULT 'pcs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'pcsPerParcel') THEN
    ALTER TABLE "Design" ADD COLUMN "pcsPerParcel" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'moq') THEN
    ALTER TABLE "Design" ADD COLUMN "moq" INTEGER;
  END IF;
END $$;
