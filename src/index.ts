import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import pool, { connectDB, disconnectDB } from './db.js';
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
import supplierReturnRoutes from './routes/supplierReturn.js'; // Added this line
import reportsRoutes from './routes/reports.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import financeRoutes from './routes/finance.js';
import collectionScheduleRoutes from './routes/collection-schedule.js';
import pickingListRoutes from './routes/picking-list.js';
import repostRoutes from './routes/repost.js';
import sessionsRoutes from './routes/sessions.js';
import territoryRoutes from './routes/territories.js';
import backupRoutes from './routes/backupRoutes.js';
import { BackupService } from './services/backupService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Dynamic Image Serving & Auto-Recovery Handler for /uploads
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, safeFilename);

    // 1. If image exists on local disk, serve it immediately
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    // 2. If missing on local disk (e.g. after container redeploy), restore from PostgreSQL ProductImage table
    const dbRes = await pool.query(
      `SELECT "mimeType", "fileData" FROM "ProductImage" WHERE "filename" = $1`,
      [safeFilename]
    );

    if (dbRes.rows.length > 0) {
      const { mimeType, fileData } = dbRes.rows[0];
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(filePath, fileData);

      res.setHeader('Content-Type', mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.send(fileData);
    }
  } catch (err) {
    console.error('Error serving product image:', err);
  }

  res.status(404).send('Image not found');
});

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
app.use('/api/admin/backups', backupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/service/repost-documents', repostRoutes);
app.use('/api/service/sessions', sessionsRoutes);
app.use('/api/admin', priceTypeRoutes);
app.use('/api/price-documents', priceDocumentRoutes);
app.use('/api', counterpartyRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/realizations', realizationRoutes);
app.use('/api/goods-receipt', goodsReceiptRoutes);
app.use('/api/buyer-returns', buyerReturnRoutes);
app.use('/api/supplier-returns', supplierReturnRoutes); // Added this line
app.use('/api/reports', reportsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/collection-schedule', collectionScheduleRoutes);
app.use('/api/picking-list', pickingListRoutes);
app.use('/api/territories', territoryRoutes);

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
import { runMigration as createSupplierReturnsMigration } from './migrations/add_supplier_returns.js';
import { runMigration as createDocumentLockMigration } from './migrations/100_document_lock.js';
import { runMigration as backfillBuyerReturnBatchMigration } from './migrations/15_backfill_buyer_return_batch.js';
import { runMigration as addWarehouseToDocumentsMigration } from './migrations/add_warehouse_to_documents.js';
import { runMigration as backfillWarehouseMigration } from './migrations/backfill_warehouse.js';
import { runMigration as addUserPermissionsMigration } from './migrations/101_add_user_permissions.js';
import { runMigration as addSortOrderMigration } from './migrations/102_add_sort_order.js';
import { runMigration as addInBoxToProductMigration } from './migrations/104_add_in_box_to_product.js';
import { runMigration as addPriceListFieldsMigration } from './migrations/105_add_price_list_fields_to_product.js';
import { runMigration as addWeightToProductMigration } from './migrations/106_add_weight_to_product.js';
import { runMigration as addCategoriesToOrganizationMigration } from './migrations/107_add_categories_to_organization.js';
import { runMigration as addVisibleWarehousesMigration } from './migrations/108_add_visible_warehouses.js';
import { runMigration as addVatCostCoefficientMigration } from './migrations/109_add_vat_cost_coefficient_to_organization.js';
import { runMigration as recalculateProfitWithVatCoefficientMigration } from './migrations/110_recalculate_profit_with_vat_coefficient.js';
import { runMigration as addTerritoriesMigration } from './migrations/111_add_territories.js';
import { runMigration as addUserIdToCollectionScheduleMigration } from './migrations/112_add_user_id_to_collection_schedule.js';
import { runMigration as addVisiblePriceTypesMigration } from './migrations/113_add_visible_price_types.js';
import { runMigration as addTernopilManagerMigration } from './migrations/114_add_ternopil_manager.js';
import { runMigration as fixCollectionSchedulePerUserMigration } from './migrations/115_fix_collection_schedule_per_user.js';
import { runMigration as repairCorruptedOrdersMigration } from './migrations/116_repair_corrupted_orders.js';
import { runMigration as addUserSessionsMigration } from './migrations/116_add_user_sessions.js';
import { runMigration as addDatabaseBackupTableMigration } from './migrations/117_add_database_backup_table.js';
import { runMigration as addProductImageTableMigration } from './migrations/118_add_product_image_table.js';

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
    await createSupplierReturnsMigration();
    await createDocumentLockMigration();
    await backfillBuyerReturnBatchMigration();
    await addWarehouseToDocumentsMigration();
    await backfillWarehouseMigration();
    await addUserPermissionsMigration();
    await addSortOrderMigration();
    await addInBoxToProductMigration();
    await addPriceListFieldsMigration();
    await addWeightToProductMigration();
    await addCategoriesToOrganizationMigration();
    await addVisibleWarehousesMigration();
    await addVatCostCoefficientMigration();
    await recalculateProfitWithVatCoefficientMigration();
    await addTerritoriesMigration();
    await addUserIdToCollectionScheduleMigration();
    await addVisiblePriceTypesMigration();
    await addTernopilManagerMigration();
    await fixCollectionSchedulePerUserMigration();
    await repairCorruptedOrdersMigration();
    await addUserSessionsMigration();
    await addDatabaseBackupTableMigration();
    await addProductImageTableMigration();

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${PORT}`);

      // Schedule automated daily backup (every 24 hours)
      const DAILY_MS = 24 * 60 * 60 * 1000;
      setInterval(() => {
        console.log('⏰ Running scheduled daily database backup...');
        BackupService.createBackup().catch(err => console.error('Daily backup error:', err));
      }, DAILY_MS);
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
