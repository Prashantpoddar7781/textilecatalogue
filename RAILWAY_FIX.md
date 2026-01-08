# Railway Build Fix - Root Directory Configuration

## The Problem
Railway is trying to build from the repository root, but the backend code is in the `backend/` folder. The build command `cd backend` fails because Railway needs to be configured to use `backend` as the root directory.

## Solution: Set Root Directory in Railway

### Step 1: Configure Service Root Directory

1. Go to your Railway project dashboard
2. Click on your **backend service** (the one that's failing to build)
3. Go to **"Settings"** tab
4. Scroll down to **"Source"** section
5. Find **"Root Directory"** setting
6. Set it to: `backend`
7. Click **"Save"**

### Step 2: Verify Build Settings

In the same Settings page, check:

- **Build Command**: Should be `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start Command**: Should be `npm start`

Railway should auto-detect these from `backend/package.json`, but verify they're correct.

### Step 3: Redeploy

1. Go to **"Deployments"** tab
2. Click **"Redeploy"** on the latest deployment
3. Or push a new commit to trigger automatic redeploy

## Alternative: If Root Directory Setting Doesn't Work

If Railway doesn't have a "Root Directory" setting, you can:

1. Create a new service and point it directly to the `backend/` folder
2. Or use a monorepo setup (more complex)

## What Changed

- Removed `railway.json` from root (was causing conflicts)
- Updated `backend/railway.toml` with proper build commands
- Added `backend/nixpacks.toml` for Nixpacks configuration

## Expected Build Output

After fixing, you should see:
```
✓ npm install
✓ npx prisma generate
✓ npx prisma migrate deploy
✓ npm start
```

## Still Having Issues?

1. **Check Railway logs** - Look for specific error messages
2. **Verify DATABASE_URL** - Make sure it's set correctly
3. **Check Prisma schema** - Ensure `backend/prisma/schema.prisma` exists
4. **Verify package.json** - Check `backend/package.json` has all dependencies

## Quick Checklist

- [ ] Set Root Directory to `backend` in Railway service settings
- [ ] Verify build command is correct
- [ ] Verify start command is `npm start`
- [ ] DATABASE_URL environment variable is set
- [ ] JWT_SECRET environment variable is set
- [ ] Redeployed the service
