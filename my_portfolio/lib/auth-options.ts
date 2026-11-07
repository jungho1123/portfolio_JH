import type { BetterAuthOptions } from "better-auth";
import { assertGithubIdentity, isAdminAccount } from "@/lib/auth-policy";
import { APIError } from "better-auth/api";
export function adminAuthOptions(
  findAccounts: (
    userId: string,
  ) => Promise<{ providerId: string; accountId: string }[]>,
): BetterAuthOptions {
  return {
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || "not-configured",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "not-configured",
        mapProfileToUser: async (profile) => {
          assertGithubIdentity(profile.id);
          return { role: "ADMIN" as const };
        },
      },
    },
    user: {
      additionalFields: {
        role: {
          type: ["MEMBER", "ADMIN"],
          defaultValue: "ADMIN",
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const accounts = await findAccounts(session.userId);
            if (!isAdminAccount(accounts))
              throw new APIError("FORBIDDEN", {
                message: "관리자 세션을 발급할 수 없습니다.",
              });
            return { data: session };
          },
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  };
}
