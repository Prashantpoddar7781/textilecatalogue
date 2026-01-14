# How to Use Prisma Studio to Populate basePrice

## Step-by-Step Instructions

### Step 1: Navigate to the Design Table

1. In your browser at `http://localhost:5555`, you should see a list of tables:
   - User
   - Catalogue
   - **Design** ← Click on this one
   - Contact
   - ShareLink

2. Click on **"Design"** to open the Design table

### Step 2: View Your Designs

You should now see a list of your 7 designs. Each row shows:
- id
- name
- image
- basePrice (this will be empty/null for existing designs)
- retailPrice (this has a value)
- wholesalePrice
- fabric
- description
- etc.

### Step 3: Update Each Design

For each design row:

1. **Click on the row** to open the edit view (or click the edit icon)

2. **Find the `basePrice` field** - it will likely show as empty or `null`

3. **Copy the value from `retailPrice`**:
   - Look at the `retailPrice` value (e.g., `500.00`)
   - Copy that number

4. **Paste it into `basePrice`**:
   - Click in the `basePrice` field
   - Paste or type the same value as `retailPrice`
   - For example, if `retailPrice` is `500`, set `basePrice` to `500`

5. **Save the changes**:
   - Click the "Save" button (usually at the bottom or top of the form)
   - Or press `Ctrl+S` (Windows) / `Cmd+S` (Mac)

6. **Repeat for all 7 designs**

### Step 4: Verify

After updating all designs:

1. Scroll through the list
2. Check that all designs now have a value in `basePrice`
3. The `basePrice` should match `retailPrice` (or `wholesalePrice` if retail was 0)

### Alternative: Bulk Update (Faster)

If you want to update all at once, you can:

1. Click on any design row
2. Look at the URL - it will be something like `http://localhost:5555/Design/[id]`
3. Note the pattern
4. Or better yet, use SQL directly (see below)

## Quick SQL Method (Faster!)

Instead of updating manually, you can run SQL directly:

1. **In Prisma Studio**, look for a "Raw SQL" or "Query" tab (if available)
2. **Or use Railway Dashboard**:
   - Go to your Railway project
   - Click on PostgreSQL service
   - Go to "Data" or "Query" tab
   - Run this SQL:

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

This will update all 7 designs at once!

## Visual Guide

```
Prisma Studio Interface:
┌─────────────────────────────────────┐
│  User  │  Catalogue  │  Design  │... │  ← Click "Design"
└─────────────────────────────────────┘

Design Table View:
┌─────┬──────────────┬───────────┬─────────────┐
│ id  │ name         │ basePrice │ retailPrice │
├─────┼──────────────┼───────────┼─────────────┤
│ 1   │ Design 1     │ [null]   │ 500.00      │  ← Click row
│ 2   │ Design 2     │ [null]   │ 750.00      │
│ ... │ ...          │ ...      │ ...         │
└─────┴──────────────┴───────────┴─────────────┘

Edit View (after clicking a row):
┌─────────────────────────────────────┐
│  Design Details                     │
│                                     │
│  name: Design 1                     │
│  basePrice: [empty] ← Type 500 here│
│  retailPrice: 500.00                │
│  wholesalePrice: 400.00              │
│  ...                                │
│                                     │
│  [Save] [Cancel]                    │
└─────────────────────────────────────┘
```

## Troubleshooting

**Can't see the Design table?**
- Make sure Prisma Studio is connected to the right database
- Check that the migration ran successfully

**Can't edit a field?**
- Make sure you clicked on the row to open the edit view
- Some fields might be read-only (like `id`, `createdAt`)

**Changes not saving?**
- Make sure you click "Save" button
- Check for any error messages
- Verify the value is a valid number

## After Completing

Once all designs have `basePrice` populated:
- ✅ Your migration is complete
- ✅ All existing designs will work with the new pricing system
- ✅ You can now use the new features (additional prices, share links)
