import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL Connected via Prisma');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Database Error: ${error.message}`);
    } else {
      console.error('❌ An unknown error occurred');
    }
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  await prisma.$disconnect();
};

export default prisma;
