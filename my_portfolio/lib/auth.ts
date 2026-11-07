import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  ...authOptions,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [nextCookies()],
});
