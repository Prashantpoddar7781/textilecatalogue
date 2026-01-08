# Railway Deployment Guide

Complete guide to deploy TextileHub backend and frontend to Railway.

## Prerequisites

1. Railway account (sign up at [railway.app](https://railway.app))
2. GitHub account
3. PostgreSQL database (Railway provides this)

## Step 1: Deploy Backend to Railway

### 1.1 Prepare Backend

1. Push your code to GitHub (if not already done)
2. Make sure `backend/` folder is in your repository

### 1.2 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

### 1.3 Add PostgreSQL Database

1. In your Railway project, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Railway will automatically create a PostgreSQL database
4. Note the connection details (you'll need the `DATABASE_URL`)

### 1.4 Configure Backend Service

1. Railway should auto-detect your backend
2. If not, click "+ New" → "GitHub Repo" and select your repo
3. Set the **Root Directory** to `backend`
4. Go to "Settings" → "Variables" and add:

```
DATABASE_URL=<from PostgreSQL service>
JWT_SECRET=<generate-a-strong-random-secret>
FRONTEND_URL=<your-frontend-url>
NODE_ENV=production
PORT=3001
```

**To get DATABASE_URL:**
- Click on your PostgreSQL service
- Go to "Variables" tab
- Copy the `DATABASE_URL` value

**To generate JWT_SECRET:**
```bash
# On Mac/Linux
openssl rand -base64 32

# Or use any random string generator
```

### 1.5 Configure Build Settings

Railway should auto-detect, but verify in "Settings" → "Deploy":

- **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start Command**: `npm start`

### 1.6 Deploy

1. Railway will automatically deploy when you push to GitHub
2. Or click "Deploy" manually
3. Wait for deployment to complete
4. Note your backend URL (e.g., `https://your-backend.railway.app`)

## Step 2: Update Frontend Configuration

### 2.1 Add Environment Variable

1. In your frontend Vercel project (or Railway frontend service)
2. Go to "Settings" → "Environment Variables"
3. Add:
   ```
   VITE_API_URL=https://your-backend.railway.app/api
   ```
   Replace with your actual Railway backend URL

### 2.2 Redeploy Frontend

1. Push a commit or manually redeploy
2. Your frontend will now connect to the Railway backend

## Step 3: Verify Deployment

### 3.1 Test Backend

1. Visit `https://your-backend.railway.app/health`
2. Should return: `{"status":"ok","timestamp":"..."}`

### 3.2 Test Frontend

1. Visit your frontend URL
2. Try to register/login
3. Upload a design
4. Verify it appears in your catalogue

## Step 4: Database Migrations

Railway automatically runs migrations on deploy, but you can also run manually:

1. Connect to Railway CLI:
```bash
railway login
railway link
```

2. Run migrations:
```bash
cd backend
railway run npm run db:migrate
```

## Troubleshooting

### Backend won't start

- Check Railway logs for errors
- Verify `DATABASE_URL` is correct
- Ensure `JWT_SECRET` is set
- Check that Prisma migrations ran successfully

### Database connection errors

- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Check PostgreSQL service is running
- Ensure migrations have been applied

### Frontend can't connect to backend

- Verify `VITE_API_URL` is set correctly
- Check CORS settings in backend (should include frontend URL)
- Verify backend is accessible (visit `/health` endpoint)

### Authentication not working

- Check JWT_SECRET is set in backend
- Verify token is being stored in localStorage
- Check browser console for API errors

## Environment Variables Summary

### Backend (Railway)
```
DATABASE_URL=<from-postgres-service>
JWT_SECRET=<your-secret-key>
FRONTEND_URL=<your-frontend-url>
NODE_ENV=production
PORT=3001
```

### Frontend (Vercel/Railway)
```
VITE_API_URL=https://your-backend.railway.app/api
```

## Monitoring

- **Railway Dashboard**: View logs, metrics, and deployments
- **Database**: Use Prisma Studio locally or Railway's database viewer
- **API Health**: Monitor `/health` endpoint

## Scaling

Railway automatically scales your services. For production:

1. Enable **Auto-Deploy** from main branch
2. Set up **Custom Domain** for backend
3. Configure **Environment Variables** for production
4. Set up **Backup** for PostgreSQL database

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

