import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import authRoutes from './routes/auth.js';
import designRoutes from './routes/designs.js';
import userRoutes from './routes/users.js';
import catalogueRoutes from './routes/catalogues.js';
import contactRoutes from './routes/contacts.js';
import shareLinkRoutes from './routes/shareLinks.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Run migrations on startup
async function runMigrations() {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { 
      stdio: 'inherit', 
      cwd: process.cwd(),
      env: { ...process.env }
    });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Migration error details:', error);
    // Don't block server start - migrations can be run manually if needed
    console.log('⚠️  Server will start but migration failed. Check logs above.');
  }
}

// Run migrations before starting server (async, don't block server start)
if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATIONS === 'true') {
  runMigrations().catch(err => {
    console.error('Migration error (non-blocking):', err);
    // Server will still start even if migrations fail
  });
}

// Middleware
// CORS configuration - handle trailing slashes and multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL?.replace(/\/$/, ''), // Remove trailing slash
  process.env.FRONTEND_URL?.replace(/\/$/, '') + '/', // Add trailing slash
  'http://localhost:3000',
  'https://textilecatalogue.vercel.app',
  'https://textilecatalogue.vercel.app/'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowed => {
      // Remove trailing slashes for comparison
      const normalizedOrigin = origin.replace(/\/$/, '');
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // In development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
console.log('Setting up routes...');
app.use('/api/auth', authRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/users', userRoutes);
app.use('/api/catalogues', catalogueRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/share-links', shareLinkRoutes);
console.log('Routes configured: /api/auth, /api/designs, /api/users, /api/catalogues, /api/contacts, /api/share-links');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔐 Auth routes: http://${HOST}:${PORT}/api/auth/*`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;

