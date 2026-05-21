# Railway Deployment Guide

Complete guide to deploy ThreadX backend and frontend to Railway.

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
RAZORPAY_KEY_ID=<your Razorpay key id>
RAZORPAY_KEY_SECRET=<your Razorpay key secret>
RAZORPAY_PLAN_MONTHLY=<monthly plan_xxxxx>
RAZORPAY_PLAN_ANNUAL=<annual plan_xxxxx>
RAZORPAY_WEBHOOK_SECRET=<webhook secret>
FORCE_FREE=false
SMS_PROVIDER=<fast2sms|msg91|twilio>
OTP_SECRET=<strong random otp secret>
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

### 2.3 Google Drive import (optional — developer only)

**Who configures what**

- **Developer / app owner (you):** Configures Google **once** for the whole app. You create OAuth credentials in Google Cloud and add two environment variables to your **hosted** frontend (Vercel, Railway, etc.). You redeploy after changing them.
- **End users (shop staff, catalogue users):** **Do not** configure anything. They tap **Google Drive**, sign in with **their own** Google account if asked, and choose a file from **their** Drive—same idea as “Sign in with Google” on any website.

If you skip this section, the **Google Drive** button will show a short message and users can still use **Gallery** or **Camera**.

**One-time setup in Google Cloud Console**

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create a project.
2. **APIs & Services → Library:** enable **Google Picker API** and **Google Drive API**.
3. **APIs & Services → Credentials:**
   - **Create credentials → OAuth client ID.** Application type: **Web application**. Under **Authorized JavaScript origins**, add your real site URL(s), for example `https://your-app.vercel.app` and, for local testing, `http://localhost:3000` (or the port your Vite dev server uses).
   - **Create credentials → API key.** Restrict the key: **Application restrictions** → HTTP referrers (websites), add the same origins; **API restrictions** → limit to **Google Picker API** and **Google Drive API** (or a custom list that includes both).
4. Copy the **OAuth 2.0 Client ID** and the **API key** string.

**Add to your frontend hosting (not per user)**

In Vercel/Railway (or `.env.local` for local builds), set:

```
VITE_GOOGLE_CLIENT_ID=<OAuth Web client ID from step 3>
VITE_GOOGLE_API_KEY=<Browser API key from step 3>
```

Rebuild/redeploy the frontend so Vite embeds these at build time. Every user of your deployed app then uses **your** OAuth client to sign in, but each user only ever authorizes **their own** Drive.

### 2.4 Razorpay subscriptions

Use Razorpay for web/iPhone users who access the app through the browser link. Android users installed from Google Play should later use Google Play Billing.

**Create plans in Razorpay**

1. Open Razorpay Dashboard.
2. Go to **Subscriptions** → **Plans**.
3. Create a monthly plan:
   - Amount: `599`
   - Currency: `INR`
   - Billing cycle: every `1 month`
4. Create an annual plan:
   - Amount: `6499`
   - Currency: `INR`
   - Billing cycle: every `1 year`
5. Copy both plan IDs. They look like `plan_xxxxx`.

**Add backend variables in Railway**

Add these to the backend service variables:

```
RAZORPAY_KEY_ID=<your Razorpay key id>
RAZORPAY_KEY_SECRET=<your Razorpay key secret>
RAZORPAY_PLAN_MONTHLY=<monthly plan_xxxxx>
RAZORPAY_PLAN_ANNUAL=<annual plan_xxxxx>
RAZORPAY_WEBHOOK_SECRET=<a strong webhook secret>
FORCE_FREE=false
```

Optional:

```
RAZORPAY_MONTHLY_TOTAL_COUNT=120
RAZORPAY_ANNUAL_TOTAL_COUNT=10
FREE_EMAILS=sunitapoddar95@gmail.com
```

`RAZORPAY_MONTHLY_TOTAL_COUNT=120` means the monthly subscription can renew for 120 monthly cycles unless the user cancels. `RAZORPAY_ANNUAL_TOTAL_COUNT=10` means the annual subscription can renew for 10 yearly cycles unless cancelled.

**Add Razorpay webhook**

In Razorpay Dashboard, add this webhook URL:

```
https://textilecatalogue-production.up.railway.app/api/billing/razorpay/webhook
```

Use the same value as `RAZORPAY_WEBHOOK_SECRET`. Enable subscription events such as activated, charged, cancelled, completed, authenticated, pending, halted, and paused/resumed if available.

**Test**

1. Redeploy Railway backend after adding variables.
2. Open the web app billing page.
3. Buy the monthly or annual plan in Razorpay checkout.
4. Confirm the app shows **Pro Active**.
5. Test **Cancel subscription** from the billing page and confirm Razorpay schedules cancellation at the end of the paid cycle.

### 2.5 Google Play Billing for Android

Use Google Play Billing for Android users who install the app from Play Store. The app uses these default subscription product IDs:

```
sutra_monthly_599
sutra_annual_6499
```

If you choose different IDs in Play Console, set matching frontend build variables before building the Android app:

```
VITE_GOOGLE_PLAY_MONTHLY_PRODUCT_ID=<your monthly product id>
VITE_GOOGLE_PLAY_ANNUAL_PRODUCT_ID=<your annual product id>
```

**Backend verification variables**

Add these to the Railway backend service:

```
GOOGLE_PLAY_PACKAGE_NAME=com.textilehub.catalogue
GOOGLE_PLAY_MONTHLY_PRODUCT_ID=sutra_monthly_599
GOOGLE_PLAY_ANNUAL_PRODUCT_ID=sutra_annual_6499
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<service account json or base64 encoded json>
SMS_PROVIDER=<fast2sms|msg91|twilio>
OTP_SECRET=<strong random otp secret>
```

For SMS OTP, also add variables for the provider you choose:

Fast2SMS:
```
FAST2SMS_API_KEY=<your Fast2SMS API key>
FAST2SMS_ROUTE=otp
```

MSG91:
```
MSG91_AUTH_KEY=<your MSG91 auth key>
MSG91_OTP_TEMPLATE_ID=<approved OTP template id>
```

Twilio:
```
TWILIO_ACCOUNT_SID=<your Twilio account sid>
TWILIO_AUTH_TOKEN=<your Twilio auth token>
TWILIO_FROM_NUMBER=<your Twilio phone number>
```

The service account must have access to the app in Play Console API access, with permission to read/manage subscriptions.

**Play Console flow**

1. Upload a billing-enabled AAB to internal or closed testing.
2. Go to **Monetise with Play** → **Products** → **Subscriptions**.
3. Create monthly and annual subscription products using the exact product IDs above.
4. Add and activate base plans:
   - Monthly: `599 INR`, every `1 month`
   - Annual: `6499 INR`, every `1 year`
5. Add license testers and test from the Play Store testing link.

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
RAZORPAY_KEY_ID=<your Razorpay key id>
RAZORPAY_KEY_SECRET=<your Razorpay key secret>
RAZORPAY_PLAN_MONTHLY=<monthly plan_xxxxx>
RAZORPAY_PLAN_ANNUAL=<annual plan_xxxxx>
RAZORPAY_WEBHOOK_SECRET=<webhook secret>
FORCE_FREE=false
GOOGLE_PLAY_PACKAGE_NAME=com.textilehub.catalogue
GOOGLE_PLAY_MONTHLY_PRODUCT_ID=sutra_monthly_599
GOOGLE_PLAY_ANNUAL_PRODUCT_ID=sutra_annual_6499
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<service account json or base64 encoded json>
```

### Frontend (Vercel/Railway)
```
VITE_API_URL=https://your-backend.railway.app/api
VITE_GOOGLE_PLAY_MONTHLY_PRODUCT_ID=sutra_monthly_599
VITE_GOOGLE_PLAY_ANNUAL_PRODUCT_ID=sutra_annual_6499
```

Optional (Google Drive button — set once by deployer, see §2.3):

```
VITE_GOOGLE_CLIENT_ID=<OAuth Web client ID>
VITE_GOOGLE_API_KEY=<Browser API key>
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

