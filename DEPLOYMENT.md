# Deployment Guide for TextileHub

## Deploying to Vercel

### Prerequisites
1. A GitHub account
2. A Vercel account (sign up at [vercel.com](https://vercel.com))
3. A Gemini API key (for AI features - optional)

### Step 1: Push to GitHub

1. Initialize git repository (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. Create a new repository on GitHub and push:
```bash
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Vercel

#### Option A: Using Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a Vite project
5. Configure environment variables (if using Gemini AI):
   - Add `GEMINI_API_KEY` with your API key value
6. Click "Deploy"
7. Your app will be live in minutes!

#### Option B: Using Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. For production deployment:
```bash
vercel --prod
```

### Step 3: Environment Variables (Optional)

If you want to use the AI image analysis feature:

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key
4. Redeploy the application

### Step 4: Verify Deployment

1. Visit your Vercel deployment URL
2. Test the following features:
   - Upload a design
   - Filter designs
   - Select and share designs via WhatsApp
   - Mobile responsiveness

## Mobile Testing

The app is fully responsive and works on mobile devices. Test on:
- iOS Safari
- Android Chrome
- Mobile browsers

## Features

✅ Upload designs with image, prices, fabric, and description
✅ Filter by fabric type, price range, and search
✅ Select multiple designs
✅ Share to WhatsApp with embedded information
✅ Mobile-responsive design
✅ Local storage persistence

## Troubleshooting

### Build Fails
- Ensure all dependencies are in `package.json`
- Check that Node.js version is compatible (v18+)

### Images Not Loading
- Check browser console for CORS errors
- Ensure images are valid base64 or URLs

### WhatsApp Sharing Not Working
- On mobile: Use native share sheet
- On desktop: Images will download, then open WhatsApp Web

## Support

For issues or questions, check the code comments or create an issue in the repository.

