import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "../../scripts/test-db.mjs";
let database: Awaited<ReturnType<typeof testDatabase>>;
let content: typeof import("../../lib/content");
let queries: typeof import("../../lib/public-data");
let taxonomy: typeof import("../../lib/taxonomy");
let db: (typeof import("../../lib/prisma"))["db"];
before(async () => {
  database = await testDatabase(55439);
  process.env.DATABASE_URL = database.url;
  process.env.DB_POOL_MAX = "1";
  ({ db } = await import("../../lib/prisma"));
  content = await import("../../lib/content");
  queries = await import("../../lib/public-data");
  taxonomy = await import("../../lib/taxonomy");
});
after(async () => {
  await db?.$disconnect();
  await database?.close();
});
test("draft isolation, atomic publishing, optimistic conflicts, slug visibility and lifecycle", async () => {
  let post = await content.createPost("BLOG");
  const id = post.id;
  const cat = await taxonomy.createTaxon("BLOG", "CATEGORY", "개발");
  const base = {
    ...(post.draft!.data as object),
    title: "공개 제목",
    slug: "first-post",
    markdown: "## 공개 본문",
    categoryId: cat.id,
  };
  post = await content.saveDraft(id, post.revision, base);
  assert.equal(
    (
      await queries.publicList("BLOG", {
        sort: "newest",
        category: "",
        tags: [],
        page: 1,
      })
    ).total,
    0,
  );
  assert.equal(await queries.publicPost("BLOG", "first-post"), null);
  await assert.rejects(
    content.saveDraft(id, post.revision - 1, base),
    (e: unknown) => (e as { code: string }).code === "CONFLICT",
  );
  post = await content.publishContent(id, post.revision);
  const firstPublished = post.firstPublishedAt!.toISOString();
  post = await content.saveDraft(id, post.revision, {
    ...base,
    title: "비밀 수정",
    markdown: "비밀 본문",
    slug: "new-post",
  });
  assert.equal(
    (await queries.publicPost("BLOG", "first-post"))!.data.title,
    "공개 제목",
  );
  assert.equal(await queries.publicPost("BLOG", "new-post"), null);
  post = await content.publishContent(id, post.revision);
  assert.equal(
    (await queries.publicPost("BLOG", "first-post"))!.data.slug,
    "new-post",
  );
  assert.equal(
    (await queries.publicPost("BLOG", "new-post"))!.data.title,
    "비밀 수정",
  );
  assert.equal(post.firstPublishedAt!.toISOString(), firstPublished);
  const privatePost = await content.transitionContent(
    id,
    post.revision,
    "private",
  );
  assert.equal(await queries.publicPost("BLOG", "first-post"), null);
  assert.equal(
    (
      await queries.publicList("BLOG", {
        sort: "newest",
        category: "",
        tags: [],
        page: 1,
      })
    ).total,
    0,
  );
  const trashed = await content.transitionContent(
    id,
    privatePost!.revision,
    "trash",
  );
  const restored = await content.transitionContent(
    id,
    trashed!.revision,
    "restore",
  );
  assert.equal(restored!.state, "PRIVATE");
  assert.equal(restored!.firstPublishedAt!.toISOString(), firstPublished);
  assert.equal(await queries.publicPost("BLOG", "new-post"), null);
  const trashAgain = await content.transitionContent(
    id,
    restored!.revision,
    "trash",
  );
  await content.transitionContent(id, trashAgain!.revision, "delete");
  assert.equal(await db.content.findUnique({ where: { id } }), null);
});
test("home draft snapshots and media references protect the public snapshot", async () => {
  let home = await content.ensureHome();
  const media = await db.media.create({
    data: {
      pathname: "test/private-photo",
      name: "photo.png",
      mime: "image/png",
      size: 100,
      status: "READY",
    },
  });
  home = await content.saveDraft(home.id, home.revision, {
    ...(home.draft!.data as object),
    name: "테스트 관리자",
    job: "테스트 개발자",
    photoId: media.id,
  });
  assert.equal(
    await db.mediaUse.count({
      where: {
        mediaId: media.id,
        revision: { publicOf: { state: "PUBLISHED" } },
      },
    }),
    0,
  );
  home = await content.publishContent(home.id, home.revision);
  home = await content.saveDraft(home.id, home.revision, {
    ...(home.draft!.data as object),
    name: "미게시 이름",
    photoId: null,
  });
  assert.equal(
    (home.published!.data as { name: string }).name,
    "테스트 관리자",
  );
  assert.equal(
    await db.mediaUse.count({
      where: {
        mediaId: media.id,
        revision: { publicOf: { state: "PUBLISHED" } },
      },
    }),
    1,
  );
  await assert.rejects(db.media.delete({ where: { id: media.id } }));
  home = (await content.transitionContent(home.id, home.revision, "discard"))!;
  assert.equal((home.draft!.data as { name: string }).name, "테스트 관리자");
});
test("keyset pages handle equal dates, removal, sorting and AND category/tag filters", async () => {
  const cat = await taxonomy.createTaxon("BLOG", "CATEGORY", "Pagination");
  const a = await taxonomy.createTaxon("BLOG", "TAG", "TypeScript");
  const b = await taxonomy.createTaxon("BLOG", "TAG", "React");
  await assert.rejects(taxonomy.createTaxon("BLOG", "TAG", "  typescript  "));
  const ids: string[] = [];
  for (let i = 0; i < 27; i++) {
    let post = await content.createPost("BLOG");
    ids.push(post.id);
    post = await content.saveDraft(post.id, post.revision, {
      ...(post.draft!.data as object),
      title: `글 ${i}`,
      slug: `page-${i}`,
      categoryId: cat.id,
      tagIds: i < 25 ? [a.id, b.id] : [a.id],
    });
    await content.publishContent(post.id, post.revision);
  }
  await db.content.updateMany({
    where: { id: { in: ids } },
    data: { firstPublishedAt: new Date("2026-01-01T00:00:00Z") },
  });
  const filters = {
    sort: "newest" as const,
    category: cat.id,
    tags: [a.id, b.id],
    page: 1,
  };
  const first = await queries.publicList("BLOG", filters);
  assert.equal(first.total, 25);
  assert.equal(first.items.length, 12);
  // Removing the last row of page one does not invalidate the keyset cursor.
  await db.content.update({
    where: { id: first.items.at(-1)!.id },
    data: { state: "PRIVATE" },
  });
  const second = await queries.publicList("BLOG", {
    ...filters,
    cursor: first.nextCursor!,
  });
  const third = await queries.publicList("BLOG", {
    ...filters,
    cursor: second.nextCursor!,
  });
  assert.equal(
    new Set([...first.items, ...second.items, ...third.items].map((p) => p.id))
      .size,
    25,
  );
  assert.equal(third.nextCursor, null);
  const oldest = await queries.publicList("BLOG", {
    ...filters,
    sort: "oldest",
  });
  assert.ok(oldest.items[0].id < oldest.items.at(-1)!.id);
  await assert.rejects(
    queries.publicList("BLOG", {
      ...filters,
      sort: "oldest",
      cursor: first.nextCursor!,
    }),
  );
  assert.ok(first.items.every((p) => !("markdown" in p.data)));
});
test("taxonomy merge updates snapshots and invalidates stale editor versions", async () => {
  const from = await taxonomy.createTaxon("PROJECT", "TAG", " Old ");
  const target = await taxonomy.createTaxon("PROJECT", "TAG", "New");
  let post = await content.createPost("PROJECT");
  post = await content.saveDraft(post.id, post.revision, {
    ...(post.draft!.data as object),
    title: "분류 테스트",
    tagIds: [from.id, target.id],
  });
  const revision = post.revision;
  await taxonomy.changeTaxon(from.id, "merge", undefined, target.id);
  const changed = await content.adminContent(post.id);
  assert.deepEqual((changed.draft!.data as { tagIds: string[] }).tagIds, [
    target.id,
  ]);
  assert.equal(changed.revision, revision + 1);
  await assert.rejects(
    content.saveDraft(post.id, revision, changed.draft!.data),
  );
});

test("draft-only classifications and slug reservations stay out of public interfaces", async () => {
  const hidden = await taxonomy.createTaxon("BLOG", "TAG", "초안 전용 태그");
  const draft = await content.createPost("BLOG");
  await content.saveDraft(draft.id, draft.revision, {
    ...(draft.draft!.data as object),
    title: "초안",
    slug: "draft-reserved-slug",
    tagIds: [hidden.id],
  });
  assert.equal(
    (await queries.publicTaxons("BLOG")).some((t) => t.id === hidden.id),
    false,
  );
  assert.equal(await queries.publicPost("BLOG", "draft-reserved-slug"), null);
  const another = await content.createPost("BLOG");
  await assert.rejects(
    content.saveDraft(another.id, another.revision, {
      ...(another.draft!.data as object),
      slug: "draft-reserved-slug",
    }),
  );
});

test("GitHub activity excludes private repositories, caches successes and survives API failure", async () => {
  const { refreshGithub, githubActivity } = await import("../../lib/github");
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-only-public-token";
  let calls = 0;
  globalThis.fetch = (async (_input: unknown, options: RequestInit) => {
    calls++;
    const { variables } = JSON.parse(String(options.body));
    const occurredAt = new Date(
      new Date(variables.from).getTime() + 3_600_000,
    ).toISOString();
    const empty = {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: "" },
    };
    return Response.json({
      data: {
        user: {
          contributionsCollection: {
            totalRepositoriesWithContributedCommits: 2,
            commitContributionsByRepository: [
              {
                repository: { isPrivate: false },
                contributions: {
                  nodes: [{ occurredAt, commitCount: 2 }],
                  pageInfo: { hasNextPage: false },
                },
              },
              {
                repository: { isPrivate: true },
                contributions: {
                  nodes: [{ occurredAt, commitCount: 999 }],
                  pageInfo: { hasNextPage: false },
                },
              },
            ],
            issueContributions: {
              nodes: [
                { occurredAt, issue: { repository: { isPrivate: false } } },
                { occurredAt, issue: { repository: { isPrivate: true } } },
              ],
              pageInfo: { hasNextPage: false, endCursor: "" },
            },
            pullRequestContributions: empty,
            pullRequestReviewContributions: empty,
            repositoryContributions: empty,
          },
        },
      },
    });
  }) as typeof fetch;
  try {
    await refreshGithub("fixture-public-activity");
    const first = await githubActivity("fixture-public-activity");
    assert.equal(first.days.length, 365);
    assert.ok(first.days.some((d) => d.count > 0));
    assert.ok(first.days.every((d) => d.count < 999));
    const afterFirst = calls;
    await refreshGithub("fixture-public-activity");
    assert.equal(calls, afterFirst);
    await db.githubCache.update({
      where: { username: "fixture-public-activity" },
      data: { checkedAt: new Date(0) },
    });
    globalThis.fetch = async () => {
      throw new Error("Simulated outage");
    };
    await refreshGithub("fixture-public-activity");
    const fallback = await githubActivity("fixture-public-activity");
    assert.deepEqual(fallback.days, first.days);
    assert.equal(fallback.fetchedAt, first.fetchedAt);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test("GitHub OAuth callback creates only the allowed account with the real Prisma adapter", async () => {
  const { betterAuth } = await import("better-auth/minimal");
  const { prismaAdapter } = await import("@better-auth/prisma-adapter");
  const { adminAuthOptions } = await import("../../lib/auth-options");
  const originalFetch = globalThis.fetch;
  const originalAdmin = process.env.ADMIN_GITHUB_ID;
  process.env.ADMIN_GITHUB_ID = "12345";
  let githubId = 99999;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://github.com/login/oauth/access_token"))
      return Response.json({
        access_token: "mock-oauth",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (url.startsWith("https://api.github.com/user/emails"))
      return Response.json([
        { email: "oauth-test@example.test", primary: true, verified: true },
      ]);
    if (url.startsWith("https://api.github.com/user"))
      return Response.json({
        id: githubId,
        login: "test",
        name: "Test",
        email: "oauth-test@example.test",
        avatar_url: "",
      });
    throw new Error("Unexpected network request");
  }) as typeof fetch;
  try {
    const auth = betterAuth({
      ...adminAuthOptions((userId) =>
        db.account.findMany({ where: { userId } }),
      ),
      database: prismaAdapter(db, {
        provider: "postgresql",
        transaction: true,
      }),
      baseURL: "http://localhost:3000",
      secret: "integration-secret-with-more-than-32-characters",
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
          `http://localhost:3000/api/auth/callback/github?code=test&state=${encodeURIComponent(state)}`,
          { headers: { Cookie: cookie } },
        ),
      );
    }
    await login();
    assert.equal(await db.user.count(), 0);
    assert.equal(await db.account.count(), 0);
    assert.equal(await db.session.count(), 0);
    githubId = 12345;
    await login();
    assert.equal(await db.user.count(), 1);
    assert.equal(await db.account.count(), 1);
    assert.equal(await db.session.count(), 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAdmin === undefined) delete process.env.ADMIN_GITHUB_ID;
    else process.env.ADMIN_GITHUB_ID = originalAdmin;
  }
});
