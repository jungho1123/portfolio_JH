import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { testDatabase } from "./test-db.mjs";
const database = await testDatabase(55440);
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/portfolio-e2e-db", database.name);
Object.assign(process.env, {
  DATABASE_URL: database.url,
  DATABASE_URL_UNPOOLED: database.url,
  DB_POOL_MAX: "5",
  BETTER_AUTH_URL: "http://localhost:3100",
  SITE_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "isolated-e2e-secret-never-use-in-production",
  ADMIN_GITHUB_ID: "12345",
  GITHUB_CLIENT_ID: "fixture-client",
  GITHUB_CLIENT_SECRET: "fixture-secret",
  GITHUB_TOKEN: "",
  BLOB_READ_WRITE_TOKEN: "fixture-token-no-real-storage-access",
  CRON_SECRET: "fixture-cron",
  NEXT_DIST_DIR: ".next-e2e",
});
const { db } = await import("../lib/prisma");
const { createPost, ensureHome, saveDraft, publishContent } =
  await import("../lib/content");
const { createTaxon } = await import("../lib/taxonomy");
const { emptyHome } = await import("../lib/schemas");
const cat = await createTaxon("BLOG", "CATEGORY", "테스트 개발");
const tag = await createTaxon("BLOG", "TAG", "테스트 태그");
const projectCat = await createTaxon("PROJECT", "CATEGORY", "테스트 프로젝트");
for (const [id, githubId, token] of [
  ["fixture-admin", "12345", "fixture-admin-token"],
  ["fixture-intruder", "99999", "fixture-intruder-token"],
]) {
  await db.user.create({
    data: {
      id,
      name: "테스트 계정",
      email: `${id}@example.test`,
      role: "ADMIN",
    },
  });
  await db.account.create({
    data: {
      id: `${id}-account`,
      userId: id,
      providerId: "github",
      accountId: githubId,
    },
  });
  await db.session.create({
    data: {
      id: `${id}-session`,
      userId: id,
      token,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}
const featured: string[] = [];
for (const kind of ["BLOG", "PROJECT"] as const) {
  for (let i = 1; i <= (kind === "BLOG" ? 27 : 3); i++) {
    let post = await createPost(kind);
    post = await saveDraft(post.id, post.revision, {
      ...(post.draft!.data as object),
      title: `테스트 ${kind === "BLOG" ? "글" : "프로젝트"} ${i}`,
      slug: `${kind.toLowerCase()}-${i}`,
      summary: "자동 검증용 콘텐츠입니다.",
      markdown: `## 문제와 접근\n\n테스트 본문 ${i}\n\n## 구현\n\n\`\`\`typescript\nconst value = ${i};\n\`\`\`\n\n| 항목 | 값 |\n| --- | --- |\n| 결과 | 확인 |`,
      categoryId: kind === "BLOG" ? cat.id : projectCat.id,
      tagIds: kind === "BLOG" ? [tag.id] : [],
    });
    post = await publishContent(post.id, post.revision);
    if (kind === "PROJECT") featured.push(post.id);
  }
}
let home = await ensureHome();
home = await saveDraft(home.id, home.revision, {
  ...emptyHome(),
  name: "테스트 프로필",
  job: "테스트 개발자",
  intro: "브라우저 검증용 프로필입니다.",
  about: "테스트 소개입니다.",
  github: "fixture-profile",
  education: [
    {
      id: "edu",
      title: "테스트 교육",
      subtitle: "검증용",
      period: "2026",
      description: "테스트 과정",
    },
  ],
  stack: [{ id: "typescript", name: "TypeScript", group: "Language", url: "" }],
  experience: [
    {
      id: "exp",
      title: "테스트 경험",
      subtitle: "검증용",
      period: "2026",
      description: "테스트 역할",
    },
  ],
  featuredIds: featured,
});
await publishContent(home.id, home.revision);
await db.cacheJob.deleteMany();
await db.$disconnect();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", "3100"],
  { env: process.env, stdio: "inherit" },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await database.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
child.on("exit", async () => {
  if (!closing) {
    await database.close();
    process.exit(1);
  }
});
