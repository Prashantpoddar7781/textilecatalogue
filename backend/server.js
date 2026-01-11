import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import authRoutes from './routes/auth.js';
import designRoutes from './routes/designs.js';
import userRoutes from './routes/users.js';
import catalogueRoutes from './routes/catalogues.js';
import groupRoutes from './routes/groups.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Run migrations on startup
async function runMigrations() {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: process.cwd() });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // Try to create initial migration if no migrations exist
    try {
      console.log('Attempting to create initial migration...');
      execSync('npx prisma migrate dev --name init --create-only', { stdio: 'inherit', cwd: process.cwd() });
      execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: process.cwd() });
      console.log('✅ Initial migration created and applied');
    } catch (migrationError) {
      console.error('❌ Failed to create migration:', migrationError.message);
      console.log('⚠️  Server will start but database may not be initialized');
    }
  }
}

// Run migrations before starting server (async, don't block server start)
if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATIONS === 'true') {
  runMigrations().catch(err => {
    console.error('Migration error (non-blocking):', err);
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
app.use('/api/groups', groupRoutes);
console.log('Routes configured: /api/auth, /api/designs, /api/users, /api/catalogues, /api/groups');

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

