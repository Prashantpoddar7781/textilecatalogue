# How to Verify Backend and Database are Working

## Step 1: Test Health Endpoint

The easiest way to verify your backend is running:

1. **Get your backend URL from Railway:**
   - Go to Railway dashboard
   - Click on your backend service
   - Copy the Public URL (e.g., `https://your-backend.up.railway.app`)

2. **Test the health endpoint:**
   Open in browser or use curl:
   ```
   https://your-backend.up.railway.app/health
   ```

   **Expected response:**
   ```json
   {
     "status": "ok",
     "timestamp": "2026-01-09T12:00:00.000Z"
   }
   ```

   ✅ **If you see this, your backend is running!**

## Step 2: Check Railway Logs

1. Go to Railway dashboard
2. Click on your backend service
3. Go to **"Deployments"** tab
4. Click on the latest deployment
5. Check the logs for:
   - ✅ "Server running on port XXXX"
   - ✅ "Migrations completed successfully" (if migrations ran)
   - ❌ No database connection errors

## Step 3: Test Database Connection

### Option A: Test via API (Recommended)

Test by trying to register a user:

**Using Browser (or Postman/Insomnia):**

1. **Register a test user:**
   ```
   POST https://your-backend.up.railway.app/api/auth/register
   Content-Type: application/json
   
   {
     "email": "test@example.com",
     "password": "test123456",
     "name": "Test User"
   }
   ```

   **Expected response (200 OK):**
   ```json
   {
     "user": {
       "id": "...",
       "email": "test@example.com",
       "name": "Test User"
     },
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

   ✅ **If you get a token, database is working!**

2. **Test login:**
   ```
   POST https://your-backend.up.railway.app/api/auth/login
   Content-Type: application/json
   
   {
     "email": "test@example.com",
     "password": "test123456"
   }
   ```

### Option B: Using cURL (Command Line)

```bash
# Test health
curl https://your-backend.up.railway.app/health

# Register user
curl -X POST https://your-backend.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456","name":"Test User"}'

# Login
curl -X POST https://your-backend.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'
```

## Step 4: Test Creating a Design

1. **First, login and get a token** (from Step 3)

2. **Create a design:**
   ```
   POST https://your-backend.up.railway.app/api/designs
   Authorization: Bearer YOUR_TOKEN_HERE
   Content-Type: application/json
   
   {
     "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
     "wholesalePrice": 100,
     "retailPrice": 200,
     "fabric": "Cotton",
     "description": "Test design"
   }
   ```

   **Expected response (201 Created):**
   ```json
   {
     "id": "...",
     "userId": "...",
     "image": "data:image/png;base64,...",
     "wholesalePrice": 100,
     "retailPrice": 200,
     "fabric": "Cotton",
     "description": "Test design",
     "createdAt": "2026-01-09T12:00:00.000Z"
   }
   ```

   ✅ **If you get a design ID, database write is working!**

3. **Get all designs:**
   ```
   GET https://your-backend.up.railway.app/api/designs
   Authorization: Bearer YOUR_TOKEN_HERE
   ```

   ✅ **Should return your created design**

## Step 5: Test Frontend Connection

1. **Make sure frontend has the correct API URL:**
   - Go to Vercel dashboard
   - Settings → Environment Variables
   - Verify `VITE_API_URL` is set to: `https://your-backend.up.railway.app/api`

2. **Visit your frontend URL:**
   - Try to register/login
   - Upload a design
   - Check browser console (F12) for any errors

## Step 6: Check Database Directly (Optional)

If you want to verify the database directly:

1. **In Railway:**
   - Click on your PostgreSQL service
   - Go to **"Data"** tab
   - You can view tables and data there

2. **Or use Prisma Studio locally:**
   ```bash
   cd backend
   # Set DATABASE_URL in .env
   npx prisma studio
   ```

## Common Issues & Solutions

### ❌ Health endpoint returns error
- **Check:** Railway logs for server errors
- **Fix:** Verify all environment variables are set

### ❌ Database connection errors
- **Check:** DATABASE_URL in Railway environment variables
- **Fix:** Make sure it's the full connection string from PostgreSQL service

### ❌ 401 Unauthorized errors
- **Check:** JWT_SECRET is set in Railway
- **Fix:** Generate a new JWT_SECRET and set it

### ❌ CORS errors in frontend
- **Check:** FRONTEND_URL is set in Railway backend
- **Fix:** Set it to your Vercel frontend URL

### ❌ Migrations not running
- **Check:** Railway logs for migration errors
- **Fix:** Verify DATABASE_URL is correct and database is accessible

## Quick Verification Checklist

- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Can register a new user
- [ ] Can login with registered user
- [ ] Can create a design (with auth token)
- [ ] Can get list of designs
- [ ] Frontend can connect to backend
- [ ] No errors in Railway logs
- [ ] No errors in browser console

## Test Script (Quick Test)

Save this as `test-backend.js` and run: `node test-backend.js`

```javascript
const API_URL = 'https://your-backend.up.railway.app/api';

async function test() {
  try {
    // 1. Health check
    console.log('1. Testing health...');
    const health = await fetch(`${API_URL.replace('/api', '')}/health`);
    console.log('Health:', await health.json());

    // 2. Register
    console.log('2. Registering user...');
    const register = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test${Date.now()}@example.com`,
        password: 'test123456',
        name: 'Test User'
      })
    });
    const { token, user } = await register.json();
    console.log('Registered:', user.email);
    console.log('Token received:', !!token);

    // 3. Get designs
    console.log('3. Getting designs...');
    const designs = await fetch(`${API_URL}/designs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const designsData = await designs.json();
    console.log('Designs count:', designsData.designs?.length || 0);

    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
```

## Success Indicators

✅ **Backend is working if:**
- Health endpoint responds
- You can register/login
- You can create/read designs
- No errors in logs

✅ **Database is working if:**
- Migrations completed successfully
- You can create records (register user, create design)
- You can read records (get designs)
- No connection errors in logs

## Next Steps

Once verified:
1. Update frontend with backend URL
2. Test full user flow (register → login → upload → share)
3. Monitor Railway logs for any issues
4. Set up monitoring/alerts if needed
