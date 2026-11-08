import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { AdminDocument } from "../../lib/admin-types";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
test.beforeEach(async ({ context }) => {
  const token = "fixture-admin-token";
  const signature = createHmac(
    "sha256",
    "isolated-e2e-secret-never-use-in-production",
  )
    .update(token)
    .digest("base64");
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
async function editor(
  page: Page,
  markdown = "```typescript\nconst value = 1;\n```",
) {
  const initial: AdminDocument = await (
    await page.request.post("/api/admin/content", {
      headers: { Origin: "http://localhost:3100" },
      data: { kind: "BLOG" },
    })
  ).json();
  const saved = await page.request.put(`/api/admin/content/${initial.id}`, {
    headers: { Origin: "http://localhost:3100" },
    data: {
      revision: initial.revision,
      data: { ...initial.draft!.data, markdown },
    },
  });
  expect(saved.ok()).toBeTruthy();
  await page.goto(`/admin/edit/${initial.id}`);
  await page.locator(".cm-editor").waitFor();
  return initial.id;
}
async function contents(page: Page) {
  await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("콘텐츠");
}
const resources = [
  {
    path: "taxonomy",
    label: "카테고리·태그",
    row: ".taxonomy-row",
    value: "최신 분류",
    action: "이름 변경",
    item: {
      id: "fixture-taxon",
      kind: "BLOG",
      type: "TAG",
      count: 0,
      name: "최신 분류",
      slug: "fresh",
    },
  },
  {
    path: "media",
    label: "미디어",
    row: ".media-row",
    value: "최신 파일",
    action: "정보 저장",
    item: {
      id: "fixture-media",
      name: "최신 파일",
      alt: "",
      mime: "application/pdf",
      size: 1,
      status: "READY",
      uses: [],
      pathname: "fixture.pdf",
    },
  },
];
for (const resource of resources) {
  for (const fails of [false, true]) {
    test(`${resource.path} ignores an earlier activation's late ${fails ? "failure" : "collection"}`, async ({
      page,
    }) => {
      await page.route(`**/api/admin/${resource.path}`, (route) =>
        route.fulfill({ json: [] }),
      );
      await page.goto(`/admin/${resource.path}`);
      await expect(
        page.getByText(
          resource.path === "media"
            ? "등록된 파일이 없습니다."
            : "등록된 분류가 없습니다.",
        ),
      ).toBeVisible();
      await page.unroute(`**/api/admin/${resource.path}`);
      const arrived = gate();
      const held = gate();
      const delivered = gate();
      let gets = 0;
      await page.route(`**/api/admin/${resource.path}`, async (route) => {
        if (++gets !== 1) return route.fulfill({ json: [resource.item] });
        arrived.release();
        await held.promise;
        await route
          .fulfill(
            fails
              ? { status: 503, json: { error: "이전 활성화의 실패" } }
              : { json: [] },
          )
          .catch(() => {});
        delivered.release();
      });
      try {
        await contents(page);
        await page
          .getByRole("link", { name: resource.label, exact: true })
          .click();
        await arrived.promise;
        await contents(page);
        await page
          .getByRole("link", { name: resource.label, exact: true })
          .click();
        await expect(page.locator(`${resource.row} input`).first()).toHaveValue(
          resource.value,
        );
        held.release();
        await delivered.promise;
        await page.waitForTimeout(100);
        await expect(page.locator(`${resource.row} input`).first()).toHaveValue(
          resource.value,
        );
        await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      } finally {
        held.release();
      }
    });
  }
  test(`${resource.path} keeps the newest mutation reload`, async ({
    page,
  }) => {
    const arrived = gate();
    const held = gate();
    const delivered = gate();
    let patches = 0;
    await page.route(`**/api/admin/${resource.path}`, async (route) => {
      if (route.request().method() === "PATCH") {
        patches++;
        return route.fulfill({ json: {} });
      }
      if (patches !== 1)
        return route.fulfill({
          json: [
            {
              ...resource.item,
              name: patches === 2 ? `${resource.value} 갱신` : resource.value,
            },
          ],
        });
      arrived.release();
      await held.promise;
      await route.fulfill({ json: [] }).catch(() => {});
      delivered.release();
    });
    try {
      await page.goto(`/admin/${resource.path}`);
      const input = page.locator(`${resource.row} input`).first();
      await expect(input).toHaveValue(resource.value);
      await page
        .getByRole("button", { name: resource.action, exact: true })
        .click();
      await arrived.promise;
      await page
        .getByRole("button", { name: resource.action, exact: true })
        .click();
      await expect.poll(() => patches).toBe(2);
      async function expectLatest() {
        if (resource.path === "media")
          await expect(page.locator(".media-thumb a")).toHaveAttribute(
            "aria-label",
            `${resource.value} 갱신 PDF 열기`,
          );
        else await expect(input).toHaveValue(`${resource.value} 갱신`);
      }
      await expectLatest();
      held.release();
      await delivered.promise;
      await page.waitForTimeout(100);
      await expectLatest();
      await expect(page.locator(resource.row)).toHaveCount(1);
    } finally {
      held.release();
    }
  });
}

test("copy feedback renews its timer and Activity cleanup resets it", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => {} },
    }),
  );
  const id = await editor(page);
  await page.locator(".editor-preview .shiki").waitFor();
  const copy = page.getByRole("button", { name: "코드 복사" });
  await page.clock.install();
  await copy.click();
  await expect(copy).toHaveText("복사됨");
  await page.clock.runFor(1200);
  await copy.click();
  await page.clock.runFor(1000);
  await expect(copy).toHaveText("복사됨");
  await page.clock.runFor(1100);
  await expect(copy).toHaveText("복사");
  await copy.click();
  await contents(page);
  await page.locator(`a[href="/admin/edit/${id}"]`).click();
  await expect(copy).toHaveText("복사");
  await copy.click();
  await page.clock.runFor(1100);
  await expect(copy).toHaveText("복사됨");
  await page.clock.runFor(1000);
  await expect(copy).toHaveText("복사");
});

test("a clipboard result from a hidden activation cannot revive copy feedback", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            document.documentElement.dataset.copyPending = "true";
            addEventListener("release-copy", () => resolve(), { once: true });
          }),
      },
    }),
  );
  const id = await editor(page);
  const copy = page.getByRole("button", { name: "코드 복사" });
  await copy.click();
  await page.waitForFunction(
    () => document.documentElement.dataset.copyPending === "true",
  );
  await contents(page);
  await page.locator(`a[href="/admin/edit/${id}"]`).click();
  await page.evaluate(() => dispatchEvent(new Event("release-copy")));
  await expect(copy).toHaveText("복사");
});

test("a rejected highlighting import keeps plain code without an unhandled rejection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let imports = 0;
  await editor(page, "강조 없는 본문");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  // Turbopack registers async loaders during hydration. Fail the actual import
  // after hydration, when the first fenced block requests its implementation.
  await page.route(/\/_next\/static\/chunks\/[^/]*\.js/, (route) => {
    imports++;
    return route.abort();
  });
  await page
    .locator(".cm-content")
    .fill("```typescript\nconst value = 1;\n```");
  await expect.poll(() => imports).toBeGreaterThan(0);
  await expect(page.locator(".editor-preview pre code")).toHaveText(
    "const value = 1;",
  );
  await expect(page.locator(".editor-preview .shiki")).toHaveCount(0);
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
});

test("changing only language hides old highlighting and ignores a late result", async ({
  page,
}) => {
  await editor(page);
  await page.locator(".editor-preview .shiki").waitFor();
  const arrived = gate();
  const held = gate();
  const delivered = gate();
  await page.route(
    /\/_next\/static\/chunks\/[^/]*langs_dist_python[^/]*\.js/,
    async (route) => {
      arrived.release();
      await held.promise;
      await route.continue().catch(() => {});
      delivered.release();
    },
  );
  try {
    const source = page.locator(".cm-content");
    await source.fill("```python\nconst value = 1;\n```");
    await arrived.promise;
    await expect(page.locator(".editor-preview .code-toolbar span")).toHaveText(
      "python",
    );
    await expect(page.locator(".editor-preview .shiki")).toHaveCount(0);
    await source.fill("```text\nconst value = 1;\n```");
    await page.locator(".editor-preview .shiki").waitFor();
    const current = await page.locator(".editor-preview .shiki").innerHTML();
    held.release();
    await delivered.promise;
    await page.waitForTimeout(100);
    await expect(page.locator(".editor-preview .code-toolbar span")).toHaveText(
      "text",
    );
    expect(await page.locator(".editor-preview .shiki").innerHTML()).toBe(
      current,
    );
  } finally {
    held.release();
  }
});
