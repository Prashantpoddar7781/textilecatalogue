# Database Migration Instructions

## How to Run the Migration

### Step 1: Navigate to the Backend Folder

Open your terminal/command prompt and navigate to the `backend` folder:

```bash
cd backend
```

**Important:** You must be in the `backend` folder to run the migration commands.

### Step 2: Ensure Dependencies are Installed

Make sure all npm packages are installed:

```bash
npm install
```

### Step 3: Generate Prisma Client

First, generate the Prisma client with the updated schema:

```bash
npm run db:generate
```

Or directly:
```bash
npx prisma generate
```

### Step 4: Create and Run the Migration

Create a new migration for the schema changes:

```bash
npm run db:migrate -- --name add_flexible_pricing_and_share_links
```

Or directly:
```bash
npx prisma migrate dev --name add_flexible_pricing_and_share_links
```

This will:
1. Create a new migration file in `backend/prisma/migrations/`
2. Apply the migration to your database
3. Update the Prisma client

### Step 5: Verify the Migration

You can verify the migration was successful by:

1. **Check migration files:**
   ```bash
   ls backend/prisma/migrations/
   ```
   You should see a new folder with the migration name.

2. **Open Prisma Studio (optional):**
   ```bash
   npm run db:studio
   ```
   This opens a visual database browser at `http://localhost:5555`

## For Production (Railway)

If you're deploying to Railway, the migration will run automatically on deploy because:
- Railway runs `npx prisma migrate deploy` automatically (configured in `server.js`)
- Or you can run it manually via Railway CLI:

```bash
railway run npm run db:migrate
```

## Troubleshooting

### Error: "Migration engine failed to connect"

- Check your `DATABASE_URL` in `.env` file
- Ensure the database is accessible
- Verify the connection string format: `postgresql://user:password@host:port/database`

### Error: "Migration already applied"

- This is normal if you've run the migration before
- You can check migration status: `npx prisma migrate status`

### Error: "Schema drift detected"

- This means your database schema doesn't match your Prisma schema
- You may need to reset the database (⚠️ **WARNING: This deletes all data**):
  ```bash
  npx prisma migrate reset
  ```

## Migration Summary

This migration adds:
- `basePrice` field to Design model
- `additionalPrices` JSON field to Design model
- `ShareLink` model with all its fields
- Relations between User, Design, and ShareLink

The migration maintains backward compatibility with existing `wholesalePrice` and `retailPrice` fields.
