import assert from "node:assert/strict";
import { test } from "node:test";
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { authOptions } from "../lib/auth-options.ts";

function createTestAuth() {
  const database = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    ...authOptions,
    database: memoryAdapter(database),
    baseURL: "http://localhost:3000",
    secret: "authentication-tests-only-never-use-in-production",
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });

  return { auth, database };
}

const credentials = {
  name: "Test Member",
  email: "member@example.com",
  password: "test-password-only",
};

test("unverified users can sign up and sign in with a hashed credential account", async () => {
  const { auth, database } = createTestAuth();
  const signup = await auth.api.signUpEmail({ body: credentials });

  assert.equal(signup.user.role, "MEMBER");
  assert.equal(signup.user.emailVerified, false);
  assert.ok(signup.token);
  assert.equal(database.account.length, 1);
  assert.equal(database.account[0].providerId, "credential");
  assert.ok(database.account[0].password);
  assert.notEqual(database.account[0].password, credentials.password);
  assert.equal(database.verification.length, 0);

  const signin = await auth.api.signInEmail({ body: credentials });
  assert.equal(signin.user.role, "MEMBER");
  assert.equal(signin.user.emailVerified, false);
  assert.ok(signin.token);
});

test("sign-up input cannot grant the ADMIN role", async () => {
  const { auth, database } = createTestAuth();
  const signup = await auth.api.signUpEmail({
    body: { ...credentials, role: "ADMIN" },
  });

  assert.equal(signup.user.role, "MEMBER");
  assert.equal(database.user[0].role, "MEMBER");
});

test("a member cannot promote themselves through update-user", async () => {
  const { auth, database } = createTestAuth();
  const signup = await auth.api.signUpEmail({
    body: credentials,
    asResponse: true,
  });
  const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie);

  const update = await auth.handler(new Request("http://localhost:3000/api/auth/update-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Cookie: cookie,
    },
    body: JSON.stringify({ role: "ADMIN" }),
  }));

  assert.equal(update.status, 400);
  assert.equal(database.user[0].role, "MEMBER");
});
