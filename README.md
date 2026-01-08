# TextileHub - Smart Category Manager

<div align="center">
  <h3>Professional Textile Design Catalogue Management System</h3>
  <p>Upload, organize, filter, and share your textile designs with ease</p>
</div>

## 🎨 Features

### Core Functionality
- **Design Upload**: Upload textile designs with images, wholesale/retail prices, fabric type, and descriptions
- **Smart Catalogue**: Browse your designs in a beautiful, organized grid layout
- **Advanced Filtering**: 
  - Filter by fabric type
  - Filter by price range (min/max)
  - Search by description or fabric
  - Sort by newest, price (low to high, high to low)
- **Multi-Select**: Select one or more designs for batch operations
- **WhatsApp Sharing**: Share selected designs to WhatsApp contacts with customizable embedded information

### Sharing Features
- **Customizable Embedding**: Choose what information to embed in shared images:
  - Retail Price
  - Wholesale Price
  - Fabric Type
  - Description
- **Mobile-Optimized**: Native share sheet on mobile devices
- **Desktop Support**: Download images and open WhatsApp Web

### Mobile-First Design
- Fully responsive design optimized for mobile devices
- Touch-friendly interface
- Safe area support for notched devices
- Optimized for iOS and Android

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (for backend)
- Backend API running (see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md))

### Frontend Setup

1. **Clone or download the repository**

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
Create a `.env` file:
```
VITE_API_URL=http://localhost:3001/api
```

4. **Run the development server:**
```bash
npm run dev
```

5. **Open your browser:**
Navigate to `http://localhost:3000`

### Backend Setup

See [backend/README.md](./backend/README.md) for detailed backend setup instructions.

**Quick Backend Start:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run db:generate
npm run db:migrate
npm run dev
```

## 📱 Usage

### Uploading a Design

1. Click the "Add Design" button (or the floating + button on mobile)
2. Upload an image of your textile design
3. Fill in:
   - Wholesale Price
   - Retail Price
   - Fabric Type
   - Description
4. Click "Add to Catalogue"

### Filtering Designs

- **Fabric Filter**: Select a specific fabric type or "All Fabrics"
- **Price Range**: Adjust the min/max price sliders or input values
- **Search**: Type to search by description or fabric name
- **Sort**: Choose sorting option (Latest, Price Low to High, Price High to Low)

### Sharing Designs

1. Select one or more designs by tapping/clicking on them
2. Click the "Share" button that appears
3. Choose which information to embed:
   - Retail Price
   - Wholesale Price
   - Fabric Info
   - Description
4. Preview the image with embedded information
5. Click "Prepare Images" (mobile) or "Go to WhatsApp" (desktop)

**On Mobile:**
- Uses native share sheet
- Select WhatsApp from the share options
- Choose your contact

**On Desktop:**
- Images are downloaded automatically
- WhatsApp Web opens
- Manually attach the downloaded images

## 🚢 Deployment

### Full Stack Deployment

**Backend (Railway):**
- See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete backend deployment guide
- Deploy PostgreSQL database and API to Railway

**Frontend (Vercel):**
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for frontend deployment
- Set `VITE_API_URL` environment variable to your Railway backend URL

### Quick Deploy

1. **Backend:**
   - Deploy to Railway (see RAILWAY_DEPLOYMENT.md)
   - Get your backend URL

2. **Frontend:**
   - Deploy to Vercel
   - Add environment variable: `VITE_API_URL=https://your-backend.railway.app/api`
   - Redeploy

## 🛠️ Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling (via CDN)
- **Lucide React** - Icons

## 📂 Project Structure

```
textilehub---smart-category-manager/
├── components/
│   ├── DesignCard.tsx      # Individual design card component
│   ├── ShareDialog.tsx     # WhatsApp sharing dialog
│   └── UploadForm.tsx      # Design upload form
├── App.tsx                 # Main application component
├── index.tsx               # React entry point
├── types.ts                # TypeScript type definitions
├── index.html              # HTML template
├── index.css               # Global styles
├── vite.config.ts          # Vite configuration
├── vercel.json             # Vercel deployment config
└── package.json            # Dependencies and scripts
```

## 💾 Data Storage

All designs are stored locally in the browser's `localStorage`. This means:
- ✅ No backend required
- ✅ Works offline
- ✅ Fast and private
- ⚠️ Data is browser-specific (not synced across devices)

## 🎯 Key Features Explained

### Image Embedding
When sharing designs, you can choose which information to embed at the bottom of the image:
- Selected information appears in a styled banner
- Text is optimized for readability
- Brand badge included
- High-quality JPEG output

### Mobile Optimization
- Touch-friendly buttons (minimum 44px touch targets)
- Prevents accidental zoom on input focus
- Safe area insets for notched devices
- Native share API support
- Optimized image rendering for mobile performance

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory, ready for deployment.

## 📝 Notes

- The app uses browser localStorage, so data persists across sessions
- WhatsApp sharing works best on mobile devices with native share support
- All images are processed client-side for privacy
- No external API keys or services required

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## 📄 License

This project is open source and available for use.

---

**Made with ❤️ for textile professionals**
