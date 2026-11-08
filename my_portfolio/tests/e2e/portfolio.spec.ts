import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import type { ListingPage } from "../../components/public/use-public-listing";
const secret = "isolated-e2e-secret-never-use-in-production";
function session(token = "fixture-admin-token") {
  return encodeURIComponent(
    `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`,
  );
}
async function login(page: Page, token?: string) {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: session(token),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function createBlog(page: Page) {
  const response = await page.request.post("/api/admin/content", {
    headers: { Origin: "http://localhost:3100" },
    data: { kind: "BLOG" },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
test("home order, featured count, no public login and GitHub fallback", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "테스트 프로필",
  );
  expect(
    await page
      .locator("main section[id]")
      .evaluateAll((nodes) => nodes.map((n) => n.id)),
  ).toEqual([
    "profile",
    "about",
    "education",
    "stack",
    "experience",
    "projects",
    "blog",
  ]);
  await expect(page.locator("#projects article")).toHaveCount(3);
  await expect(page.locator("#blog article")).toHaveCount(3);
  await expect(
    page.getByText("활동 정보를 준비 중입니다.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GitHub로 로그인" }),
  ).toHaveCount(0);
});
test("public endpoints reject unauthenticated and forged-role legacy sessions", async ({
  page,
}) => {
  for (const url of [
    "/api/admin/content",
    "/api/admin/content/home",
    "/api/admin/taxonomy",
    "/api/admin/media",
    "/api/admin/export",
  ])
    expect((await page.request.get(url)).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/admin/content", {
        headers: { Origin: "http://localhost:3100" },
        data: { kind: "BLOG" },
      })
    ).status(),
  ).toBe(401);
  await login(page, "fixture-intruder-token");
  expect((await page.request.get("/api/admin/content")).status()).toBe(401);
  expect((await page.request.get("/media/nonexistent?w=400")).status()).toBe(
    404,
  );
  await page.goto("/admin/preview/home");
  await expect(
    page.getByRole("button", { name: "GitHub로 로그인" }),
  ).toBeVisible();
});
test("theme choice persists and mobile menu closes with visible section heading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "테마 선택" }).click();
  await page.getByRole("menuitem", { name: "다크" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator("#projects h2")
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeGreaterThan(67);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("lists paginate on server, filter in URL, and restore loaded list and scroll", async ({
  page,
}) => {
  const cards = page.locator("main article:visible");
  const sentinel = page.locator(".load-more:visible");
  const cursorRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/public/posts" && url.searchParams.has("cursor"))
      cursorRequests.push(request.url());
  });
  const hydrated = page.waitForResponse(
    (response) =>
      response.url().includes("/api/public/posts?") && response.ok(),
  );
  await page.goto("/blog");
  await hydrated;
  await expect(sentinel.getByRole("status")).toHaveCount(0);
  await expect(cards).toHaveCount(12);
  const additional = page.waitForResponse(
    (response) =>
      response.url().includes("/api/public/posts?") &&
      new URL(response.url()).searchParams.has("cursor") &&
      response.ok(),
  );
  // Scrolling the button into view also triggers the real observer. Clicking
  // after it finishes would request another page instead of just page two.
  await sentinel.scrollIntoViewIfNeeded();
  const secondResponse = await additional;
  const secondPage: ListingPage = await secondResponse.json();
  await expect(sentinel.getByRole("status")).toHaveCount(0);
  await expect(cards).toHaveCount(24);
  const addresses = await cards
    .locator(".card-title")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(new Set(addresses).size).toBe(24);
  const last = cards.nth(15).locator(".card-title");
  await last.scrollIntoViewIfNeeded();
  const title = await last.textContent();
  const scroll = await page.evaluate(() => scrollY);
  expect(scroll).toBeGreaterThan(200);
  await last.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
  // Activity cleanup must save the list's position before navigation resets it.
  expect(
    await page.evaluate(() =>
      JSON.parse(
        sessionStorage.getItem('portfolio:list:["BLOG","newest","",[],1]') ||
          "null",
      ),
    ),
  ).toEqual({ pages: 2, scroll });
  const restored = page.waitForResponse(
    (response) => response.url() === secondResponse.url() && response.ok(),
  );
  await page.getByRole("link", { name: "목록으로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await restored;
  await expect(sentinel.getByRole("status")).toHaveCount(0);
  await expect(cards).toHaveCount(24);
  expect(
    await cards
      .locator(".card-title")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
  ).toEqual(addresses);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll);
  expect(cursorRequests).toEqual([secondResponse.url(), secondResponse.url()]);

  // The observer must still load the next page after restoration, without duplicates.
  const next = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/public/posts" &&
      new URL(response.url()).searchParams.get("cursor") ===
        secondPage.nextCursor &&
      response.ok(),
  );
  await sentinel.scrollIntoViewIfNeeded();
  const finalPage: ListingPage = await (await next).json();
  await expect(sentinel.getByRole("status")).toHaveCount(0);
  const expected = addresses.concat(
    finalPage.items.map((post) => `/blog/${post.data.slug}`),
  );
  await expect(cards).toHaveCount(expected.length);
  const finalAddresses = await cards
    .locator(".card-title")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(finalAddresses).toEqual(expected);
  expect(new Set(finalAddresses).size).toBe(expected.length);
  await page.locator("#sort").selectOption("oldest");
  await expect(page).toHaveURL(/sort=oldest/);
  await page.getByRole("button", { name: "테스트 태그", exact: true }).click();
  await expect(page).toHaveURL(/tag=/);
});
test("detail markdown, table of contents, copy and share controls", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/blog/blog-1");
  await expect(page.locator("#heading-문제와-접근")).toBeVisible();
  await page
    .getByRole("navigation", { name: "본문 목차" })
    .getByRole("link", { name: "구현", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("#heading-구현")
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeGreaterThan(67);
  await page.getByRole("button", { name: "코드 복사" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("const value = 1");
  await page.getByRole("button", { name: "링크 복사" }).click();
  await expect(page.getByRole("status")).toContainText(
    "공유 링크를 복사했습니다.",
  );
});
test("admin autosave preserves published snapshot, publish swaps metadata and body, stale tab conflicts", async ({
  page,
  context,
}) => {
  await login(page);
  const created = await createBlog(page);
  const cats = await (await page.request.get("/api/admin/taxonomy")).json();
  const cat = cats.find(
    (t: { kind: string; type: string }) =>
      t.kind === "BLOG" && t.type === "CATEGORY",
  );
  await page.goto(`/admin/edit/${created.id}`);
  await page
    .getByLabel("제목", { exact: true })
    .fill("브라우저 테스트 공개 제목");
  await page.getByLabel("카테고리", { exact: true }).selectOption(cat.id);
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "수정사항 게시" }).click();
  await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
  const published = await (
    await page.request.get(`/api/admin/content/${created.id}`)
  ).json();
  const slug = published.published.data.slug;
  const other = await context.newPage();
  await other.goto(`/admin/edit/${created.id}`);
  await other.getByLabel("제목", { exact: true }).fill("다른 탭 최신 초안");
  await expect(other.getByText("저장 완료", { exact: true })).toBeVisible();
  await page.getByLabel("제목", { exact: true }).fill("오래된 탭 충돌");
  await expect(
    page.getByRole("alert").filter({ hasText: "다른 탭" }),
  ).toContainText("다른 탭");
  const visitor = await context.browser()!.newContext();
  const publicPage = await visitor.newPage();
  await publicPage.goto(`/blog/${slug}`);
  await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(
    "브라우저 테스트 공개 제목",
  );
  expect(await publicPage.content()).not.toContain("다른 탭 최신 초안");
  expect(await publicPage.content()).not.toContain("오래된 탭 충돌");
  await other.getByRole("button", { name: "수정사항 게시" }).click();
  await expect(other.getByText("게시 완료", { exact: true })).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(
    "다른 탭 최신 초안",
  );
  await visitor.close();
  await other.close();
});
test("failed saves keep recovery across reload and block cross-origin writes", async ({
  page,
}) => {
  await login(page);
  const created = await createBlog(page);
  await page.goto(`/admin/edit/${created.id}`);
  await page.context().clearCookies();
  await page.getByLabel("제목", { exact: true }).fill("복구해야 할 내용");
  await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await login(page);
  await page.reload();
  await expect(
    page.getByText("기기에 남아 있는 편집 내용이 있습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
    "복구해야 할 내용",
  );
  expect(
    (
      await page.request.post("/api/admin/content", {
        headers: { Origin: "https://evil.example" },
        data: { kind: "BLOG" },
      })
    ).status(),
  ).toBe(403);
});
test("SEO excludes draft and private data; trash restoration remains private; export is authenticated", async ({
  page,
}) => {
  await login(page);
  let created = await createBlog(page);
  const cats = await (await page.request.get("/api/admin/taxonomy")).json();
  const cat = cats.find(
    (t: { kind: string; type: string }) =>
      t.kind === "BLOG" && t.type === "CATEGORY",
  );
  const put = await page.request.put(`/api/admin/content/${created.id}`, {
    headers: { Origin: "http://localhost:3100" },
    data: {
      revision: created.revision,
      data: {
        ...created.draft.data,
        title: "보안 검증 글",
        slug: "security-lifecycle",
        categoryId: cat.id,
      },
    },
  });
  created = await put.json();
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(
    "security-lifecycle",
  );
  expect((await page.request.get(`/og/${created.id}`)).status()).toBe(404);
  for (const action of ["publish", "private", "trash", "restore"]) {
    const res = await page.request.post(`/api/admin/content/${created.id}`, {
      headers: { Origin: "http://localhost:3100" },
      data: { revision: created.revision, action },
    });
    expect(res.ok()).toBeTruthy();
    created = await res.json();
    if (action === "publish") {
      const saved = await page.request.put(`/api/admin/content/${created.id}`, {
        headers: { Origin: "http://localhost:3100" },
        data: {
          revision: created.revision,
          data: { ...created.draft.data, slug: "security-lifecycle-new" },
        },
      });
      created = await saved.json();
      created = await (
        await page.request.post(`/api/admin/content/${created.id}`, {
          headers: { Origin: "http://localhost:3100" },
          data: { revision: created.revision, action: "publish" },
        })
      ).json();
      const old = await page.request.get("/blog/security-lifecycle", {
        maxRedirects: 0,
      });
      expect(old.status()).toBe(308);
      expect(old.headers().location).toContain("/blog/security-lifecycle-new");
    }
  }
  expect(created.state).toBe("PRIVATE");
  expect((await page.request.get("/blog/security-lifecycle")).status()).toBe(
    404,
  );
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(
    "security-lifecycle",
  );
  const exported = await page.request.get("/api/admin/export");
  expect(exported.ok()).toBeTruthy();
  expect(exported.headers()["cache-control"]).toBe("private, no-store");
  const bytes = await exported.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(
    manifest.contents.some(
      (c: { id: string; state: string }) =>
        c.id === created.id && c.state === "PRIVATE",
    ),
  ).toBeTruthy();
  expect(Object.keys(files).some((p) => p.endsWith("/draft.md"))).toBeTruthy();
});
test("desktop and small mobile layouts pass core accessibility checks in both themes", async ({
  page,
}) => {
  for (const width of [1280, 768, 360])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByRole("button", { name: "테마 선택" }).click();
      await page
        .getByRole("menuitem", { name: theme === "light" ? "라이트" : "다크" })
        .click();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.evaluate(() => document.fonts.ready);
      if (width === 1280 && theme === "dark")
        await page.screenshot({
          path: "test-results/home-desktop.png",
          fullPage: true,
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});

test("home settings publish together and empty sections disappear with their menus", async ({
  page,
}) => {
  await login(page);
  let home = await (await page.request.get("/api/admin/content/home")).json();
  const original = home.draft.data;
  async function publish(data: unknown) {
    home = await (
      await page.request.put("/api/admin/content/home", {
        headers: { Origin: "http://localhost:3100" },
        data: { revision: home.revision, data },
      })
    ).json();
    const response = await page.request.post("/api/admin/content/home", {
      headers: { Origin: "http://localhost:3100" },
      data: { revision: home.revision, action: "publish" },
    });
    expect(response.ok()).toBeTruthy();
    home = await response.json();
  }
  try {
    await publish({
      ...original,
      featuredIds: [...original.featuredIds].reverse(),
      projectCount: 2,
      blogCount: 1,
    });
    await page.goto("/");
    await expect(page.locator("#projects article:visible")).toHaveCount(2);
    await expect(page.locator("#blog article:visible")).toHaveCount(1);
    await expect(page.locator("#projects .card-title").first()).toHaveAttribute(
      "href",
      "/projects/project-3",
    );
    await publish({
      ...original,
      about: "",
      education: [],
      stack: [],
      experience: [],
      projectCount: 0,
      blogCount: 0,
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "테스트 프로필",
    );
    await expect(page.locator("main section[id]")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "주 메뉴" }).locator("a"),
    ).toHaveCount(0);
  } finally {
    await publish(original);
  }
});

test("Korean composition waits for compositionend before autosaving", async ({
  page,
}) => {
  await login(page);
  const created = await createBlog(page);
  await page.goto(`/admin/edit/${created.id}`);
  const title = page.getByLabel("제목", { exact: true });
  await title.dispatchEvent("compositionstart", { data: "ㅎ" });
  await title.fill("한글 입력 중");
  // Deliberately cross the documented debounce interval while composition is active.
  await page.waitForTimeout(1300);
  const unsaved = await (
    await page.request.get(`/api/admin/content/${created.id}`)
  ).json();
  expect(unsaved.draft.data.title).toBe("");
  await title.dispatchEvent("compositionend", { data: "한글 입력 중" });
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
  const saved = await (
    await page.request.get(`/api/admin/content/${created.id}`)
  ).json();
  expect(saved.draft.data.title).toBe("한글 입력 중");
});

test("additional loading failures retain items and retry without duplicates", async ({
  page,
}) => {
  await page.goto("/blog");
  await expect(page.locator("main article:visible")).toHaveCount(12);
  await page.route("**/api/public/posts?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "추가 로딩 실패" }),
      });
    await route.continue();
  });
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "추가 로딩 실패" }),
  ).toBeVisible();
  await expect(page.locator("main article:visible")).toHaveCount(12);
  await page.unroute("**/api/public/posts?**");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("main article:visible")).toHaveCount(24);
  const addresses = await page
    .locator("main article:visible .card-title")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  expect(new Set(addresses).size).toBe(24);
});

test("removed Stack technologies can be cleared before republishing a project", async ({
  page,
}) => {
  await login(page);
  let home = await (await page.request.get("/api/admin/content/home")).json();
  const original = home.draft.data;
  const headers = { Origin: "http://localhost:3100" };
  async function publishHome(data: unknown) {
    home = await (
      await page.request.put("/api/admin/content/home", {
        headers,
        data: { revision: home.revision, data },
      })
    ).json();
    home = await (
      await page.request.post("/api/admin/content/home", {
        headers,
        data: { revision: home.revision, action: "publish" },
      })
    ).json();
  }
  try {
    let post = await (
      await page.request.post("/api/admin/content", {
        headers,
        data: { kind: "PROJECT" },
      })
    ).json();
    const taxons = await (await page.request.get("/api/admin/taxonomy")).json();
    const cat = taxons.find(
      (t: { kind: string; type: string }) =>
        t.kind === "PROJECT" && t.type === "CATEGORY",
    );
    post = await (
      await page.request.put(`/api/admin/content/${post.id}`, {
        headers,
        data: {
          revision: post.revision,
          data: {
            ...post.draft.data,
            title: "기술 제거 검증",
            categoryId: cat.id,
            technologyIds: ["typescript"],
          },
        },
      })
    ).json();
    post = await (
      await page.request.post(`/api/admin/content/${post.id}`, {
        headers,
        data: { revision: post.revision, action: "publish" },
      })
    ).json();
    await publishHome({ ...original, stack: [] });
    await page.goto(`/admin/edit/${post.id}`);
    await page.getByRole("checkbox", { name: /현재 Stack에서 제거됨/ }).click();
    await expect(
      page.getByRole("checkbox", { name: /현재 Stack에서 제거됨/ }),
    ).toHaveCount(0);
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "수정사항 게시" }).click();
    await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
  } finally {
    await publishHome(original);
  }
});
