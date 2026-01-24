import { defineConfig } from '@prisma/internals';
import { PrismaClient } from './src/generated/client';

export default defineConfig({
  seed: async () => {
    const prisma = new PrismaClient();
    // Add your seed logic here if needed
    await prisma.$disconnect();
  },
});
