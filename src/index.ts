import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from './db.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'RemoteOrder Server with PostgreSQL & Prisma' });
});

app.use('/api', syncRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
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
