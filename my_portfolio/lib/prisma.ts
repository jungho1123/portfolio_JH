import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { portfolioDb?: PrismaClient };
export const db =
  globalDb.portfolioDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      connectionTimeoutMillis: 10000,
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.portfolioDb = db;
