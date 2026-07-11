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
import customerRoutes from './routes/customers.js';
import shareLinkRoutes from './routes/shareLinks.js';
import orderRoutes from './routes/orders.js';
import billingRoutes from './routes/billing.js';
import invoiceRoutes from './routes/invoices.js';
import purchaseRoutes from './routes/purchases.js';
import bankEntryRoutes from './routes/bankEntries.js';
import creditDebitNoteRoutes from './routes/creditDebitNotes.js';
import ledgerRoutes from './routes/ledger.js';
import erpUserRoutes from './routes/erpUsers.js';
import erpAuthRoutes from './routes/erpAuth.js';
import greyPurchaseRoutes from './routes/greyPurchases.js';
import greyDispatchRoutes from './routes/greyDispatches.js';

dotenv.config();

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - let the server try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the server try to continue
});

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

console.log('Starting server...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

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
// Note: Migrations run in background and won't block server startup
if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATIONS === 'true') {
  // Run migrations asynchronously without blocking
  setImmediate(() => {
    runMigrations().catch(err => {
      console.error('Migration error (non-blocking):', err);
      // Server will still start even if migrations fail
    });
  });
}

// Middleware setup
console.log('Setting up middleware...');

// CORS configuration - handle trailing slashes and multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL?.replace(/\/$/, ''), // Remove trailing slash
  process.env.FRONTEND_URL?.replace(/\/$/, '') + '/', // Add trailing slash
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://textilecatalogue.vercel.app',
  'https://textilecatalogue.vercel.app/',
  ...(process.env.MOBILE_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
].filter(Boolean);

const isAllowedMobileOrigin = (origin) => {
  if (origin === 'null') return true;
  try {
    const url = new URL(origin);
    const isLocalHost = ['localhost', '127.0.0.1'].includes(url.hostname);
    const isLocalScheme = ['http:', 'https:', 'capacitor:', 'ionic:'].includes(url.protocol);
    return isLocalHost && isLocalScheme;
  } catch {
    return false;
  }
};

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
    
    if (isAllowed || isAllowedMobileOrigin(origin)) {
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
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    if (req.originalUrl === '/api/billing/razorpay/webhook') {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

console.log('Middleware configured');

// Health check - must be before routes to ensure it's always available
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2026-07-10-grey-godown'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

console.log('Health check endpoint configured');

// Routes
console.log('Setting up routes...');
try {
  app.use('/api/auth', authRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/designs', designRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/catalogues', catalogueRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/share-links', shareLinkRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/bank-entries', bankEntryRoutes);
  app.use('/api/credit-debit-notes', creditDebitNoteRoutes);
  app.use('/api/ledger', ledgerRoutes);
  app.use('/api/erp-users', erpUserRoutes);
  app.use('/api/erp-auth', erpAuthRoutes);
  app.use('/api/grey-purchases', greyPurchaseRoutes);
  app.use('/api/grey-dispatches', greyDispatchRoutes);
  console.log('Routes configured: /api/auth, /api/billing, /api/designs, /api/users, /api/catalogues, /api/contacts, /api/customers, /api/share-links, /api/orders, /api/invoices, /api/purchases, /api/bank-entries, /api/credit-debit-notes, /api/ledger, /api/erp-users, /api/erp-auth, /api/grey-purchases, /api/grey-dispatches');
} catch (error) {
  console.error('Error setting up routes:', error);
  // Server will still start, but routes may not work
}

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

// Start server with error handling
const HOST = process.env.HOST || '0.0.0.0';

try {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: http://${HOST}:${PORT}/health`);
    console.log(`🔐 Auth routes: http://${HOST}:${PORT}/api/auth/*`);
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    }
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;

