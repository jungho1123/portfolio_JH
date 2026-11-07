import { test } from "node:test";
import assert from "node:assert/strict";
import { assertGithubIdentity, isAdminAccount } from "../lib/auth-policy";
test("GitHub numeric ID is mandatory and names/email/role cannot authorize", (t) => {
  t.mock.method(console, "warn", () => {});
  assert.doesNotThrow(() => assertGithubIdentity(12345, "12345"));
  for (const id of [12346, "admin", "admin@example.com", undefined, null])
    assert.throws(() => assertGithubIdentity(id, "12345"));
  assert.throws(() => assertGithubIdentity(12345, ""));
  assert.equal(
    isAdminAccount([{ providerId: "credential", accountId: "12345" }], "12345"),
    false,
  );
  assert.equal(
    isAdminAccount([{ providerId: "github", accountId: "12346" }], "12345"),
    false,
  );
  assert.equal(
    isAdminAccount([{ providerId: "github", accountId: "12345" }], "12345"),
    true,
  );
});

import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { adminAuthOptions } from "../lib/auth-options";
test("OAuth callback rejects an unallowed account before creating user/account/session", async (t) => {
  t.mock.method(console, "warn", () => {});
  const originalFetch = globalThis.fetch;
  const previousId = process.env.ADMIN_GITHUB_ID;
  process.env.ADMIN_GITHUB_ID = "12345";
  let githubId = 99999;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://github.com/login/oauth/access_token"))
      return Response.json({
        access_token: "mock-oauth-token",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (url.startsWith("https://api.github.com/user/emails"))
      return Response.json([
        { email: "test@example.test", primary: true, verified: true },
      ]);
    if (url.startsWith("https://api.github.com/user"))
      return Response.json({
        id: githubId,
        login: "fake-admin",
        name: "Test",
        email: "test@example.test",
        avatar_url: "",
      });
    throw new Error("Unexpected network request in isolated auth test");
  }) as typeof fetch;
  try {
    const database = {
      user: [],
      session: [],
      account: [],
      verification: [],
    } as Record<string, Record<string, unknown>[]>;
    const auth = betterAuth({
      ...adminAuthOptions(
        async (userId) =>
          database.account.filter((a) => a.userId === userId) as {
            providerId: string;
            accountId: string;
          }[],
      ),
      database: memoryAdapter(database),
      baseURL: "http://localhost:3000",
      secret: "test-only-auth-secret-with-more-than-32-characters",
      rateLimit: { enabled: false },
      logger: { disabled: true },
      advanced: { useSecureCookies: false },
    });
    async function login() {
      const signin = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/social", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
          },
          body: JSON.stringify({ provider: "github", callbackURL: "/admin" }),
        }),
      );
      const start = await signin.json();
      assert.ok(start.url, JSON.stringify(start));
      const state = new URL(start.url).searchParams.get("state")!;
      const cookie = signin.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      return auth.handler(
        new Request(
          `http://localhost:3000/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`,
          { headers: { Cookie: cookie } },
        ),
      );
    }
    const rejected = await login();
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, "GITHUB_ACCOUNT_NOT_ALLOWED");
    delete process.env.ADMIN_GITHUB_ID;
    const missing = await login();
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).code, "ADMIN_GITHUB_ID_MISSING");
    process.env.ADMIN_GITHUB_ID = '\"12345\"';
    const invalid = await login();
    assert.equal(invalid.status, 403);
    assert.equal((await invalid.json()).code, "ADMIN_GITHUB_ID_INVALID");
    process.env.ADMIN_GITHUB_ID = "12345";
    assert.equal(database.user.length, 0);
    assert.equal(database.account.length, 0);
    assert.equal(database.session.length, 0);
    githubId = 12345;
    const accepted = await login();
    assert.ok(accepted.status >= 300);
    assert.equal(database.user.length, 1);
    assert.equal(database.account.length, 1);
    assert.equal(database.session.length, 1);
    const signup = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "intruder",
          email: "intruder@example.test",
          password: "test-password",
        }),
      }),
    );
    assert.notEqual(signup.status, 200);
    assert.equal(database.user.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousId === undefined) delete process.env.ADMIN_GITHUB_ID;
    else process.env.ADMIN_GITHUB_ID = previousId;
  }
});

test("deployment configuration failures are distinct from an account mismatch", (t) => {
  const warnings = t.mock.method(console, "warn", () => {});
  const expectCode = (id: unknown, allowed: string, code: string) => {
    assert.throws(
      () => assertGithubIdentity(id, allowed),
      (error: unknown) =>
        (error as { body?: { code?: string } }).body?.code === code,
    );
  };
  expectCode(12345, "", "ADMIN_GITHUB_ID_MISSING");
  expectCode(12345, " \n", "ADMIN_GITHUB_ID_MISSING");
  expectCode(12345, '\"12345\"', "ADMIN_GITHUB_ID_INVALID");
  expectCode(12345, "github-username", "ADMIN_GITHUB_ID_INVALID");
  expectCode(12346, "12345", "GITHUB_ACCOUNT_NOT_ALLOWED");
  assert.equal(warnings.mock.callCount(), 5);
  const diagnostic = warnings.mock.calls.at(-1)!.arguments;
  assert.equal(diagnostic[0], "[portfolio-auth] github_identity_rejected");
  assert.equal(diagnostic[1].configuredIdSuffix, "2345");
  assert.equal(diagnostic[1].authenticatedIdSuffix, "2346");
  assert.equal(JSON.stringify(diagnostic).includes("12345"), false);
  assert.equal(JSON.stringify(diagnostic).includes("12346"), false);
});

test("surrounding deployment whitespace is normalized consistently without accepting other identities", (t) => {
  t.mock.method(console, "warn", () => {});
  assert.doesNotThrow(() => assertGithubIdentity(12345, " 12345\n"));
  assert.equal(
    isAdminAccount([{ providerId: "github", accountId: "12345" }], " 12345\n"),
    true,
  );
  assert.throws(() => assertGithubIdentity(12346, " 12345\n"));
  assert.equal(
    isAdminAccount(
      [{ providerId: "github", accountId: "github-username" }],
      "github-username",
    ),
    false,
  );
});
