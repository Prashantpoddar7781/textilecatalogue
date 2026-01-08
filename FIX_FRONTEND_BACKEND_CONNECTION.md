# Fix Frontend-Backend Connection Issues

## Issue 1: Frontend Connecting to localhost

**Problem:** Frontend is trying to connect to `localhost:3001` instead of your Railway backend.

**Solution:** Set `VITE_API_URL` in Vercel environment variables.

### Steps:

1. **Go to Vercel Dashboard:**
   - Visit [vercel.com](https://vercel.com)
   - Select your project: `textilecatalogue`

2. **Add Environment Variable:**
   - Go to **Settings** → **Environment Variables**
   - Click **"Add New"**
   - **Name:** `VITE_API_URL`
   - **Value:** `https://textilecatalogue-production.up.railway.app/api`
     - ⚠️ **Important:** Use your actual Railway backend URL + `/api`
   - Select environments: **Production**, **Preview**, **Development**
   - Click **"Save"**

3. **Redeploy Frontend:**
   - Go to **Deployments** tab
   - Click **"..."** on latest deployment
   - Click **"Redeploy"**
   - Or push a new commit to trigger redeploy

## Issue 2: Backend Route Not Found

**Problem:** `/api/auth/register` returns "Route not found"

**Possible causes:**
1. Routes not loading properly
2. Server not starting correctly
3. Route files have errors

### Check Railway Logs:

1. Go to Railway dashboard
2. Click your backend service
3. Go to **Deployments** → Latest deployment → **View Logs**
4. Look for:
   - ✅ "Server running on port..."
   - ✅ Routes being registered
   - ❌ Any import/require errors
   - ❌ Route file errors

### Test Backend Directly:

Try these endpoints:

1. **Health check:**
   ```
   https://textilecatalogue-production.up.railway.app/health
   ```
   Should return: `{"status":"ok"}`

2. **Test auth route:**
   ```
   POST https://textilecatalogue-production.up.railway.app/api/auth/register
   Content-Type: application/json
   
   {
     "email": "test@example.com",
     "password": "test123456",
     "name": "Test"
   }
   ```

### If Routes Still Don't Work:

The route files might not be loading. Check:

1. **Verify route files exist:**
   - `backend/routes/auth.js`
   - `backend/routes/designs.js`
   - `backend/routes/users.js`

2. **Check Railway logs for import errors**

3. **Verify server.js is loading routes correctly**

## Quick Fix Checklist

- [ ] Set `VITE_API_URL` in Vercel to: `https://textilecatalogue-production.up.railway.app/api`
- [ ] Redeploy frontend on Vercel
- [ ] Test health endpoint: `/health`
- [ ] Check Railway logs for errors
- [ ] Test `/api/auth/register` with Postman/curl
- [ ] Verify routes are loading in Railway logs

## After Fixing:

1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Try registering again
4. Check browser console - should now show requests to Railway URL, not localhost
