# Database Migration Instructions

## New Schema Changes

The following changes have been made to the database schema:

1. **User model**: Added `firmName` field
2. **Catalogue model**: New model for organizing designs
3. **Design model**: Added `name` and `catalogueId` fields

## Run Migration

You need to create and apply a new migration for these changes.

### Step 1: Create Migration

In PowerShell (in the `backend` folder):

```powershell
cd backend
npx prisma@5.7.1 migrate dev --name add_catalogues_and_fields
```

This will:
- Create migration files
- Apply them to your Railway database
- Update the database schema

### Step 2: Verify Migration

After migration completes, you should see:
- ✅ Migration files created in `backend/prisma/migrations/`
- ✅ Database tables updated
- ✅ No errors

### Step 3: Commit Migration Files

```powershell
cd ..
git add backend/prisma/migrations
git commit -m "Add migration for catalogues, design names, and firm names"
git push
```

## What Gets Created

- **Catalogue table**: For organizing designs into catalogues
- **User.firmName**: Field for storing firm/business name
- **Design.name**: Field for design name
- **Design.catalogueId**: Foreign key to Catalogue

## After Migration

1. Railway will automatically redeploy with new schema
2. Your app will have all new features:
   - Design names
   - Catalogue management
   - Firm names
   - Camera capture

## Troubleshooting

If migration fails:
- Check that `.env` file has correct DATABASE_URL
- Verify database is accessible
- Check Railway logs for errors
