import { PrismaClient } from '@prisma/client';

// Next.js hot-reloads modules in dev; reuse one client so we don't exhaust
// SQLite connections across reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
