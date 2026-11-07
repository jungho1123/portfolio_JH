import type { BetterAuthOptions } from "better-auth/minimal";

export const authOptions = {
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: ["MEMBER", "ADMIN"] as Array<"MEMBER" | "ADMIN">,
        required: true,
        defaultValue: "MEMBER",
        input: false,
      },
    },
  },
} satisfies BetterAuthOptions;
