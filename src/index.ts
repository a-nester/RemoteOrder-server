import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from './db.js';
import { lockMiddleware } from './middleware/lockMiddleware.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import priceTypeRoutes from './routes/priceTypes.js';
import priceDocumentRoutes from './routes/priceDocumentRoutes.js';
import counterpartyRoutes from './routes/counterparties.js';
import organizationRoutes from './routes/organization.js';
import realizationRoutes from './routes/realization.js';
import goodsReceiptRoutes from './routes/goodsReceipt.js';
import buyerReturnRoutes from './routes/buyerReturn.js';
import reportsRoutes from './routes/reports.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import financeRoutes from './routes/finance.js';
import collectionScheduleRoutes from './routes/collection-schedule.js';
import pickingListRoutes from './routes/picking-list.js';
import repostRoutes from './routes/repost.js';
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
app.use(lockMiddleware);

// Serve static files from the React app
// Using local copy of build for Render deployment
// Located in the repo root at client_dist
const clientBuildPath = path.join(__dirname, '../client_dist');
app.use(express.static(clientBuildPath));

// Routes

app.use('/api/auth', authRoutes);
app.use('/api', syncRoutes);
app.use('/api/admin/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/service/repost-documents', repostRoutes);
app.use('/api/admin', priceTypeRoutes);
app.use('/api/price-documents', priceDocumentRoutes);
app.use('/api', counterpartyRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/realizations', realizationRoutes);
app.use('/api/goods-receipt', goodsReceiptRoutes);
app.use('/api/buyer-returns', buyerReturnRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/collection-schedule', collectionScheduleRoutes);
app.use('/api/picking-list', pickingListRoutes);

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
import { runMigration as addUserCounterpartyMigration } from './migrations/add_user_counterparty.js';
import { runMigration as alterQuantityDecimalsMigration } from './migrations/alter_quantity_decimals.js';
import { runMigration as addCounterpartySubgroupsMigration } from './migrations/add_counterparty_subgroups.js';
import { runMigration as createCollectionScheduleMigration } from './migrations/010_collection_planner.js';
import { runMigration as collectionScheduleCyclicalMigration } from './migrations/011_collection_planner_cyclical.js';
import { runMigration as addBuyerReturnsMigration } from './migrations/add_buyer_returns.js';
import { runMigration as fixBuyerReturnCreatedByMigration } from './migrations/fix_buyerreturn_createdby.js';
import { runMigration as createDocumentLockMigration } from './migrations/100_document_lock.js';

const start = async () => {
  try {
    await connectDB();
    console.log('Starting RemoteOrder Server v5...');

    // Run migrations
    await addCommentMigration();
    await addDocNumberMigration();
    await addUserCounterpartyMigration();
    await alterQuantityDecimalsMigration();
    await addCounterpartySubgroupsMigration();
    await createCollectionScheduleMigration();
    await collectionScheduleCyclicalMigration();
    await addBuyerReturnsMigration();
    await fixBuyerReturnCreatedByMigration();
    await createDocumentLockMigration();

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
