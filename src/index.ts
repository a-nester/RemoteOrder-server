import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from './db.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import priceTypeRoutes from './routes/priceTypes.js';
import priceDocumentRoutes from './routes/priceDocumentRoutes.js';
import counterpartyRoutes from './routes/counterparties.js';
import organizationRoutes from './routes/organization.js';
import realizationRoutes from './routes/realization.js';
import goodsReceiptRoutes from './routes/goodsReceipt.js';
import authRoutes from './routes/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Serve static files from the React app
// Using local copy of build for Render deployment
// Copied to dist/client_dist by build script
const clientBuildPath = path.join(__dirname, 'client_dist');
app.use(express.static(clientBuildPath));

// Routes

app.use('/api/auth', authRoutes);
app.use('/api', syncRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', priceTypeRoutes);
app.use('/api/price-documents', priceDocumentRoutes);
app.use('/api', counterpartyRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/realizations', realizationRoutes);
app.use('/api/goods-receipt', goodsReceiptRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
// Express 5 requires regex for wildcard matching
app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API Endpoint not found' });
  }
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      // Don't crash if headers are already sent or if file is missing
      if (!res.headersSent) {
        res.status(404).send('Client application not found. Please ensure the client build is generated and copied to dist/client_dist.');
      }
    }
  });
});

import { runMigration as addCommentMigration } from './migrations/add_comment_to_order.js';
import { runMigration as addDocNumberMigration } from './migrations/add_doc_number.js';

const start = async () => {
  try {
    await connectDB();
    console.log('Starting RemoteOrder Server v5...');

    // Run migrations
    await addCommentMigration();
    await addDocNumberMigration();

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await disconnectDB();
  process.exit(0);
});

start();
