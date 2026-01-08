# How to Get Your Backend URL for Vercel

## Step 1: Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) and sign in
2. Create a new project or open your existing project
3. Deploy your backend service (from the `backend/` folder)

## Step 2: Find Your Backend URL

After Railway deploys your backend, you'll get a URL automatically.

### Method 1: From Railway Dashboard (Easiest)

1. **Click on your backend service** (not the PostgreSQL service)
2. Look at the top of the service page
3. You'll see a section like:
   ```
   🔗 Public URL
   https://your-backend-name.up.railway.app
   ```
4. **Copy this URL** - this is your backend URL!

### Method 2: From Settings

1. Click on your backend service
2. Go to **"Settings"** tab
3. Scroll down to **"Networking"** section
4. Find **"Public Domain"** or **"Generate Domain"**
5. Railway will show you the URL like:
   ```
   https://your-service-name.up.railway.app
   ```

### Method 3: From Deployments

1. Click on your backend service
2. Go to **"Deployments"** tab
3. Click on the latest successful deployment
4. The URL will be shown in the deployment details

## Step 3: Add to Vercel Environment Variables

1. Go to your **Vercel project** dashboard
2. Click on **"Settings"**
3. Click on **"Environment Variables"**
4. Click **"Add New"**
5. Add:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://your-backend-name.up.railway.app/api`
   
   ⚠️ **Important**: Add `/api` at the end!
   
   Example:
   ```
   VITE_API_URL=https://textilehub-backend.up.railway.app/api
   ```

6. Select **"Production"**, **"Preview"**, and **"Development"** (or just Production)
7. Click **"Save"**

## Step 4: Redeploy Frontend

After adding the environment variable:

1. Go to **"Deployments"** tab in Vercel
2. Click the **"..."** menu on the latest deployment
3. Click **"Redeploy"**
4. Or push a new commit to trigger automatic redeploy

## Verify It's Working

1. Visit your Vercel frontend URL
2. Open browser console (F12)
3. Try to register/login
4. Check Network tab - you should see requests to:
   ```
   https://your-backend-name.up.railway.app/api/auth/login
   ```

## Common Issues

### Backend URL not working?
- Make sure backend is deployed and running
- Check Railway logs for errors
- Verify the URL includes `/api` at the end
- Test the backend directly: `https://your-backend.up.railway.app/health`

### CORS errors?
- Make sure `FRONTEND_URL` in Railway backend is set to your Vercel URL
- Example: `FRONTEND_URL=https://your-app.vercel.app`

### 404 errors?
- Make sure you added `/api` to the end of the URL
- Check that your backend routes are under `/api` prefix

## Example URLs

**Railway Backend:**
```
https://textilehub-backend-production.up.railway.app
```

**Vercel Environment Variable:**
```
VITE_API_URL=https://textilehub-backend-production.up.railway.app/api
```

**Vercel Frontend:**
```
https://textilehub.vercel.app
```

**Railway Backend Environment Variable (FRONTEND_URL):**
```
FRONTEND_URL=https://textilehub.vercel.app
```

## Quick Checklist

- [ ] Backend deployed to Railway
- [ ] Backend URL copied from Railway
- [ ] Added `VITE_API_URL` to Vercel with `/api` suffix
- [ ] Added `FRONTEND_URL` to Railway backend
- [ ] Redeployed frontend on Vercel
- [ ] Tested login/register functionality

