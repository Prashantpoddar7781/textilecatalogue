# Get Public Database URL for Local Migrations

## Important: Internal URL Won't Work Locally

The URL you have (`postgres.railway.internal`) is an **internal** Railway URL that only works inside Railway's network. For local migrations, you need the **public/external** URL.

## How to Get Public DATABASE_URL

### Option 1: From Railway PostgreSQL Service

1. Go to Railway Dashboard
2. Click on your **PostgreSQL** service
3. Go to **"Connect"** or **"Data"** tab
4. Look for **"Connection String"** or **"Public Network"**
5. Copy the URL that looks like:
   ```
   postgresql://postgres:password@xxxxx.railway.app:5432/railway
   ```
   (Note: `xxxxx.railway.app` instead of `postgres.railway.internal`)

### Option 2: From Railway Variables (if available)

1. Go to Railway Dashboard
2. Click on your **PostgreSQL** service
3. Go to **"Variables"** tab
4. Look for `PUBLIC_DATABASE_URL` or similar
5. If not available, check the **"Connect"** tab

### Option 3: Construct from Connection Info

If Railway shows connection details separately:
- Host: `xxxxx.railway.app` (public hostname)
- Port: `5432`
- Database: `railway`
- User: `postgres`
- Password: `ogLefAnGcPaVeqBOtvSNZEpZGbmMkJBY`

Construct as:
```
postgresql://postgres:ogLefAnGcPaVeqBOtvSNZEpZGbmMkJBY@xxxxx.railway.app:5432/railway
```

## Update .env File

Once you have the public URL, update `backend/.env`:

```
DATABASE_URL="postgresql://postgres:ogLefAnGcPaVeqBOtvSNZEpZGbmMkJBY@xxxxx.railway.app:5432/railway"
```

Replace `xxxxx.railway.app` with the actual public hostname from Railway.

## Then Run Migration

```powershell
cd backend
npx prisma@5.7.1 migrate dev --name init
```
