-- Add design metadata fields for AI matching
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'designCode') THEN
        ALTER TABLE "Design" ADD COLUMN "designCode" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'color') THEN
        ALTER TABLE "Design" ADD COLUMN "color" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'stockQuantity') THEN
        ALTER TABLE "Design" ADD COLUMN "stockQuantity" INTEGER;
    END IF;
END $$;
