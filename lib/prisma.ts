import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across warm serverless invocations. Caching it on
// the global (in ALL environments, including production) avoids re-establishing
// the client — and its pooled connection — on every request, which was adding
// latency and connection churn on Vercel. A fresh client per request is a
// common serverless performance pitfall.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
