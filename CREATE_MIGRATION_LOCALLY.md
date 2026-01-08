# Create Migration Locally

## The Problem
- `railway run` can't access the internal database URL from your local machine
- We need to create the migration files locally, then Railway will apply them

## Solution: Create Migration with Railway DATABASE_URL

### Step 1: Get Your Railway DATABASE_URL

1. Go to Railway Dashboard
2. Click on your **PostgreSQL** service (not the backend)
3. Go to **"Variables"** tab
4. Copy the **`DATABASE_URL`** value
   - It should look like: `postgresql://postgres:password@host:port/railway`

### Step 2: Create Local .env File

In your PowerShell (in the `backend` folder), create a `.env` file:

```powershell
# Create .env file
notepad .env
```

Or manually create `.env` in the `backend` folder with:
```
DATABASE_URL="your-railway-database-url-here"
```

**Important:** Paste the full DATABASE_URL from Railway (the one that starts with `postgresql://`)

### Step 3: Create Initial Migration

In PowerShell (in the `backend` folder), run:

```powershell
npx prisma@5.7.1 migrate dev --name init
```

This will:
- Create the migration files
- Apply them to your Railway database
- Create the User and Design tables

### Step 4: Commit and Push Migration Files

After migration succeeds:

```powershell
cd ..
git add backend/prisma/migrations
git commit -m "Add initial database migration"
git push
```

### Step 5: Verify

1. Check Railway logs - should show migrations applied
2. Try registering in your app - should work now!

## Alternative: Close VS Code First

If you get file lock errors, close VS Code and any other programs using the files, then try again.
