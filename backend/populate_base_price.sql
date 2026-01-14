-- Run this SQL after the migration to populate basePrice for existing designs
-- This copies retailPrice to basePrice for all existing rows

UPDATE "Design" 
SET "basePrice" = "retailPrice" 
WHERE "basePrice" IS NULL AND "retailPrice" > 0;

-- If retailPrice is 0, use wholesalePrice
UPDATE "Design" 
SET "basePrice" = "wholesalePrice" 
WHERE "basePrice" IS NULL AND "wholesalePrice" > 0;

-- If both are 0, set basePrice to 0
UPDATE "Design" 
SET "basePrice" = 0 
WHERE "basePrice" IS NULL;
