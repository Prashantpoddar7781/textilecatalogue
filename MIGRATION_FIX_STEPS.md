# Fix Migration for Existing Data - Step by Step

## The Problem
You have 7 existing designs in your database, and we're trying to add a required `basePrice` column. Prisma can't add a required column to a table with existing data.

## Solution
I've updated the schema to make `basePrice` nullable. Now follow these steps:

### Step 1: Run the Migration

From the `backend` folder, run:

```bash
cd backend
npx prisma migrate dev --name add_flexible_pricing_and_share_links
```

This should now work because `basePrice` is nullable.

### Step 2: Populate basePrice for Existing Designs

After the migration succeeds, you need to populate `basePrice` from existing `retailPrice` values.

#### Option A: Using Prisma Studio (Easiest)

1. Open Prisma Studio:
   ```bash
   cd backend
   npx prisma studio
   ```

2. This opens a browser at `http://localhost:5555`
3. Click on "Design" table
4. For each design, set `basePrice` = `retailPrice` (or `wholesalePrice` if retail is 0)

#### Option B: Using SQL Directly

If you have direct database access (Railway dashboard, pgAdmin, etc.), run:

```sql
UPDATE "Design" 
SET "basePrice" = "retailPrice" 
WHERE "basePrice" IS NULL AND "retailPrice" > 0;

UPDATE "Design" 
SET "basePrice" = "wholesalePrice" 
WHERE "basePrice" IS NULL AND "wholesalePrice" > 0;

UPDATE "Design" 
SET "basePrice" = 0 
WHERE "basePrice" IS NULL;
```

#### Option C: Using Railway CLI

```bash
railway run psql -c "UPDATE \"Design\" SET \"basePrice\" = \"retailPrice\" WHERE \"basePrice\" IS NULL AND \"retailPrice\" > 0;"
railway run psql -c "UPDATE \"Design\" SET \"basePrice\" = \"wholesalePrice\" WHERE \"basePrice\" IS NULL AND \"wholesalePrice\" > 0;"
railway run psql -c "UPDATE \"Design\" SET \"basePrice\" = 0 WHERE \"basePrice\" IS NULL;"
```

### Step 3: Verify

Check that all designs now have a `basePrice`:

```sql
SELECT id, name, "basePrice", "retailPrice", "wholesalePrice" FROM "Design";
```

All rows should have a `basePrice` value.

## Summary

1. ✅ Schema updated - `basePrice` is now nullable
2. Run migration: `npx prisma migrate dev --name add_flexible_pricing_and_share_links`
3. Populate existing data using one of the options above
4. Done! Your migration is complete.

## Notes

- `basePrice` is kept nullable for backward compatibility
- The application code handles cases where `basePrice` might be null (falls back to `retailPrice`)
- New designs will always have a `basePrice` set
