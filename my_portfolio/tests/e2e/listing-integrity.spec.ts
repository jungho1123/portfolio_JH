import { test, expect, type Page } from "@playwright/test";

// These tests control pagination explicitly. Scrolling a button into view must
// not start a second observer-driven request while its response is held.
// The portfolio E2E exercises the real scroll/observer behavior separately.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      observe() {}
    };
  });
});

async function openListing(page: Page) {
  const hydrated = page.waitForResponse(
    (response) =>
      response.url().includes("/api/public/posts?") && response.ok(),
  );
  await page.goto("/blog");
  await hydrated;
  await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("a delayed cursor response cannot mix items into a new filter or browser history", async ({
  page,
}) => {
  await openListing(page);
  const arrived = gate();
  const held = gate();
  await page.route("**/api/public/posts?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("cursor"))
      return route.continue();
    const response = await route.fetch();
    arrived.release();
    await held.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole("button", { name: "더 보기", exact: true }).click();
    await arrived.promise;
    await page.getByLabel("정렬", { exact: true }).selectOption("oldest");
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
    held.release();
    const expected = await (
      await page.request.get("/api/public/posts?kind=BLOG&sort=oldest")
    ).json();
    await expect(page.locator(".card-title")).toHaveCount(12);
    expect(
      await page
        .locator(".card-title")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ).toEqual(
      expected.items.map(
        (post: { data: { slug: string } }) => `/blog/${post.data.slug}`,
      ),
    );
    await page.goBack();
    await expect(page.getByLabel("정렬", { exact: true })).toHaveValue(
      "newest",
    );
    await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
    await expect(page.locator(".card-title")).toHaveCount(12);
  } finally {
    held.release();
  }
});

test("overlapping pageshow and visibility events coalesce into one follow-up revalidation", async ({
  page,
}) => {
  await openListing(page);
  const arrived = gate();
  const held = gate();
  let requests = 0;
  await page.route("**/api/public/posts?**", async (route) => {
    requests++;
    if (requests !== 1) return route.continue();
    const response = await route.fetch();
    arrived.release();
    await held.promise;
    await route.fulfill({ response });
  });
  try {
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await arrived.promise;
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requests).toBe(1);
    held.release();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
    await expect(page.locator(".card-title")).toHaveCount(12);
    expect(requests).toBe(2);
  } finally {
    held.release();
  }
});

test("revalidation during additional loading preserves the loaded page count without duplicates", async ({
  page,
}) => {
  await openListing(page);
  const arrived = gate();
  const held = gate();
  let cursorRequests = 0;
  await page.route("**/api/public/posts?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("cursor"))
      return route.continue();
    cursorRequests++;
    if (cursorRequests !== 1) return route.continue();
    const response = await route.fetch();
    arrived.release();
    await held.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "더 보기", exact: true }).click();
    await arrived.promise;
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(cursorRequests).toBe(1);
    held.release();
    await expect(page.locator(".card-title")).toHaveCount(24);
    await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
    // One cursor fetch loads page two; another reconstructs it during the queued revalidation.
    expect(cursorRequests).toBe(2);
    const links = await page
      .locator(".card-title")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(new Set(links).size).toBe(24);
  } finally {
    held.release();
  }
});

for (const scenario of [
  { name: "last page", url: "/projects", count: 3 },
  { name: "empty list", url: "/projects?category=missing", count: 0 },
]) {
  test(`a failed refresh on the ${scenario.name} has a working retry without a cursor`, async ({
    page,
  }) => {
    let failing = true;
    const cursors: boolean[] = [];
    await page.route("**/api/public/posts?**", (route) => {
      if (failing)
        return route.fulfill({
          status: 503,
          json: { error: "일시적인 조회 실패" },
        });
      cursors.push(new URL(route.request().url()).searchParams.has("cursor"));
      return route.continue();
    });
    await page.goto(scenario.url);
    await expect(page.locator(".load-more [role=alert]")).toHaveText(
      "일시적인 조회 실패",
    );
    await expect(page.getByText("모든 글을 확인했습니다.")).toHaveCount(0);
    failing = false;
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
    await expect(page.locator(".load-more [role=alert]")).toHaveCount(0);
    await expect(page.locator("main article:visible")).toHaveCount(
      scenario.count,
    );
    expect(cursors).toEqual([false]);
  });
}

test("retrying a failed revalidation reconstructs the loaded pages instead of appending", async ({
  page,
}) => {
  await openListing(page);
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  await expect(page.locator("main article:visible")).toHaveCount(24);
  await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
  let failing = true;
  const cursors: boolean[] = [];
  await page.route("**/api/public/posts?**", (route) => {
    if (failing)
      return route.fulfill({ status: 503, json: { error: "재조회 실패" } });
    cursors.push(new URL(route.request().url()).searchParams.has("cursor"));
    return route.continue();
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(page.locator(".load-more [role=alert]")).toHaveText(
    "재조회 실패",
  );
  await expect(page.locator("main article:visible")).toHaveCount(24);
  failing = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
  await expect(page.locator(".load-more [role=alert]")).toHaveCount(0);
  await expect(page.locator("main article:visible")).toHaveCount(24);
  expect(cursors).toEqual([false, true]);
  const links = await page
    .locator(".card-title:visible")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(new Set(links).size).toBe(24);
});
