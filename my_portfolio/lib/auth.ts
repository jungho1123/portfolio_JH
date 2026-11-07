import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "@/lib/prisma";
import { adminAuthOptions } from "@/lib/auth-options";
export const auth = betterAuth({
  ...adminAuthOptions((userId) => db.account.findMany({ where: { userId } })),
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
});
