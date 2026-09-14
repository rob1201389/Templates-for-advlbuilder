import { PrismaClient } from "@prisma/client";

// Singleton base client. Do NOT import this from feature code — feature code
// must go through tenantDb() (src/lib/tenant-db.ts) so tenant scoping is
// always enforced. Direct use is reserved for auth (pre-tenant context),
// SUPER_ADMIN tooling, and migrations/seeds.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
