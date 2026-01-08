# Fix Database Migration Issue

## Problem
Error: "The table `public.User` does not exist in the current database"

This means Prisma migrations haven't been run to create the database tables.

## Solution: Run Migrations Manually

### Option 1: Run via Railway CLI (Recommended)

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Link to your project:**
   ```bash
   railway link
   ```

4. **Run migrations:**
   ```bash
   cd backend
   railway run npx prisma migrate deploy
   ```

### Option 2: Create Initial Migration Locally

1. **Set up local .env:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   
   Edit `.env` and add your Railway DATABASE_URL:
   ```
   DATABASE_URL="your-railway-database-url-here"
   ```

2. **Create and apply migration:**
   ```bash
   npx prisma migrate dev --name init
   ```

   This will:
   - Create the migration files
   - Apply them to your Railway database
   - Generate Prisma Client

3. **Push migration files to GitHub:**
   ```bash
   git add backend/prisma/migrations
   git commit -m "Add initial database migration"
   git push
   ```

### Option 3: Use Prisma Migrate Deploy in Railway

1. **Update Railway build command temporarily:**
   - Go to Railway → Backend Service → Settings
   - Change build command to:
     ```
     npm install && npx prisma generate && npx prisma migrate deploy
     ```
   - Save and redeploy

2. **After first deploy, change it back to:**
   ```
   npm install && npx prisma generate
   ```

## Verify Migrations Ran

After running migrations, check:

1. **Railway Logs:**
   - Should show "Migrations completed successfully"
   - No table errors

2. **Test the API:**
   - Try registering a user
   - Should work without "table does not exist" error

## Quick Fix (Fastest)

The fastest way is Option 1 (Railway CLI):

```bash
npm i -g @railway/cli
railway login
railway link
cd backend
railway run npx prisma migrate deploy
```

This will run migrations directly on Railway's infrastructure.
