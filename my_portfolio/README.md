This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Installed tooling

Use pnpm (the version is pinned in `package.json`) to install dependencies:

```bash
pnpm install
pnpm lint
```

- Tailwind CSS 4 uses the existing Turbopack loader in `next.config.ts` and the import in `app/globals.css`.
- ESLint uses the Next.js and TypeScript rules in `eslint.config.mjs`.
- Prisma 7 reads the Next.js environment files, including `.env.local`, through `prisma.config.ts`. CLI commands prefer `DATABASE_URL_UNPOOLED` for direct connections and fall back to `DATABASE_URL`. The shared client in `lib/prisma.ts` uses `DATABASE_URL` with `@prisma/adapter-pg` and is generated in `generated/prisma`.
- [Better Auth](https://better-auth.com/docs/installation) provides email/password authentication through the Prisma adapter. Server configuration is in `lib/auth.ts`, the React client is in `lib/auth-client.ts`, and the API is mounted at `/api/auth/[...all]`.

## Authentication setup

For a new checkout, copy `.env.example` to `.env.local`. Keep an existing `.env.local` and its database credentials. Set `DATABASE_URL`, `BETTER_AUTH_URL` (the application origin), and `BETTER_AUTH_SECRET` (a random secret of at least 32 characters). Generate a secret with:

```bash
openssl rand -base64 32
```

Apply the checked-in migration to your development database before signing up or signing in:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

For React components, import `authClient` from `@/lib/auth-client` and use `authClient.signUp.email({ name, email, password })`, `authClient.signIn.email({ email, password })`, `authClient.signOut()`, or `authClient.useSession()`. For server code, import `auth` from `@/lib/auth` and call `auth.api.getSession({ headers: await headers() })`, importing `headers` from `next/headers`.

Authentication uses email and password only. OAuth providers and verification emails are not configured, and users can sign in without verifying their email. The `Account` model stores the password hash for the `credential` provider. OAuth token columns, `emailVerified`, and the `Verification` model remain because Better Auth validates its core schema.

Roles are `GUEST` (no session), `MEMBER` (registered user), and `ADMIN`. `getRole(session)` from `@/lib/roles` returns the application role. Only `MEMBER` and `ADMIN` are stored in `User.role`; new users default to `MEMBER`. The role is included in server and React client session types, and client requests cannot choose or update it. Promote an administrator only through trusted server code or a database operation. Check the server session and role before allowing a restricted operation.

Run the authentication policy checks with `pnpm test:auth`. They use an isolated in-memory database and do not access your configured PostgreSQL database.

On deployment, configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` with the deployed HTTPS origin. Keep secrets in environment variables and out of Git.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
