import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { AdminDocument } from "../../lib/admin-types";

const origin = { Origin: "http://localhost:3100" };
const cacheError = "데이터 반영은 완료했지만 캐시 갱신에 실패했습니다.";
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
async function readDocument(page: Page, id: string): Promise<AdminDocument> {
  const response = await page.request.get(`/api/admin/content/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function createDocument(page: Page): Promise<AdminDocument> {
  const created = await (
    await page.request.post("/api/admin/content", {
      headers: origin,
      data: { kind: "BLOG" },
    })
  ).json();
  const taxons: { id: string; kind: string; type: string }[] = await (
    await page.request.get("/api/admin/taxonomy")
  ).json();
  const response = await page.request.put(`/api/admin/content/${created.id}`, {
    headers: origin,
    data: {
      revision: created.revision,
      data: {
        ...created.draft.data,
        title: "기준 제목",
        categoryId: taxons.find(
          (t) => t.kind === "BLOG" && t.type === "CATEGORY",
        )!.id,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function holdImageImport(page: Page) {
  const arrived = gate();
  const held = gate();
  await page.route("**/api/admin/media", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    arrived.release();
    await held.promise;
    await route.fulfill({
      json: {
        id: "stability-image",
        name: "test.png",
        mime: "image/png",
        size: 1,
        alt: "test",
        pathname: "test.png",
        status: "READY",
        uses: [],
      },
    });
  });
  return { arrived: arrived.promise, release: held.release };
}
async function beginImageImport(page: Page, label: string) {
  const field = page.getByRole("group", { name: label, exact: true });
  await page
    .getByLabel(`${label} 외부 이미지 주소`)
    .fill("https://example.test/test.png");
  await field.getByRole("button", { name: "가져오기", exact: true }).click();
  return field;
}

for (const kind of ["home", "post"] as const) {
  test(`a delayed ${kind} image import preserves other fields and saves their latest values`, async ({
    page,
  }) => {
    const original =
      kind === "home"
        ? await readDocument(page, "home")
        : await createDocument(page);
    const held = await holdImageImport(page);
    try {
      await page.goto(`/admin/edit/${original.id}`);
      await page.locator(".cm-content").waitFor();
      const field = await beginImageImport(
        page,
        kind === "home" ? "프로필 사진" : "대표 이미지",
      );
      await held.arrived;
      const input = page.getByLabel(kind === "home" ? "이름" : "제목", {
        exact: true,
      });
      const value = "이미지 처리 중 새로 입력한 값";
      await input.fill(value);
      held.release();
      await expect(field.getByRole("combobox")).toHaveValue("stability-image");
      await expect(input).toHaveValue(value);
      // The import is mocked; remove its synthetic ID before testing the real DB save.
      await field.getByRole("combobox").selectOption("");
      await expect
        .poll(async () => (await readDocument(page, original.id)).draft!.data)
        .toMatchObject(
          kind === "home"
            ? { name: value, photoId: null }
            : { title: value, imageId: null },
        );
    } finally {
      held.release();
      if (kind === "home") {
        const current = await readDocument(page, original.id);
        const restored = await page.request.put(
          `/api/admin/content/${original.id}`,
          {
            headers: origin,
            data: { revision: current.revision, data: original.draft!.data },
          },
        );
        expect(restored.ok()).toBeTruthy();
      }
    }
  });
}

test("a delayed inline image appends to the latest Markdown without reverting the title", async ({
  page,
}) => {
  const initial = await createDocument(page);
  const held = await holdImageImport(page);
  try {
    await page.goto(`/admin/edit/${initial.id}`);
    const input = page.locator(".cm-content");
    await input.fill("이전 본문");
    await page
      .getByRole("button", { name: "이미지 삽입", exact: true })
      .click();
    await beginImageImport(page, "본문 이미지");
    await held.arrived;
    await input.fill("## 작업 중 입력한 최신 본문");
    await page.getByLabel("제목", { exact: true }).fill("최신 제목");
    held.release();
    await expect(input).toContainText("/media/stability-image");
    await expect(input).toContainText("작업 중 입력한 최신 본문");
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "최신 제목",
    );
    await input.fill("## 작업 중 입력한 최신 본문");
    await expect
      .poll(async () => (await readDocument(page, initial.id)).draft!.data)
      .toMatchObject({
        title: "최신 제목",
        markdown: "## 작업 중 입력한 최신 본문",
      });
  } finally {
    held.release();
  }
});

test("late tag creation merges into current tags and preserves other input", async ({
  page,
}) => {
  const initial = await createDocument(page);
  const arrived = gate();
  const held = gate();
  await page.route("**/api/admin/taxonomy", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    arrived.release();
    await held.promise;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`/admin/edit/${initial.id}`);
    await page.getByLabel("새 분류 이름").fill("지연 생성 태그");
    await page.getByRole("button", { name: "추가", exact: true }).click();
    await arrived.promise;
    await page
      .getByRole("checkbox", { name: "테스트 태그", exact: true })
      .check();
    await page.getByLabel("제목", { exact: true }).fill("분류 생성 중 새 제목");
    held.release();
    await expect(
      page.getByRole("checkbox", { name: "지연 생성 태그", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "테스트 태그", exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "분류 생성 중 새 제목",
    );
    await expect
      .poll(async () => (await readDocument(page, initial.id)).draft!.data)
      .toMatchObject({
        title: "분류 생성 중 새 제목",
        tagIds: [expect.any(String), expect.any(String)],
      });
  } finally {
    held.release();
  }
});

test("discard applies once on cache failure and clears recovery without re-saving discarded input", async ({
  page,
}) => {
  const initial = await createDocument(page);
  let puts = 0;
  let discards = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() === "PUT" && ++puts === 1)
      return route.fulfill({
        status: 503,
        json: { error: "일시적인 저장 실패" },
      });
    if (route.request().method() !== "POST") return route.continue();
    discards++;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.fulfill({
      status: 503,
      json: {
        error: cacheError,
        code: "CACHE_PENDING",
        content: await response.json(),
      },
    });
  });
  await page.goto(`/admin/edit/${initial.id}`);
  await page
    .getByLabel("제목", { exact: true })
    .fill("폐기해야 할 미저장 제목");
  await expect(page.locator(".save-status")).toContainText("저장 실패");
  await page
    .getByRole("button", { name: "수정사항 폐기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue("");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    cacheError,
  );
  // Verify absence of a delayed autosave that would reverse the committed discard.
  await page.waitForTimeout(1300);
  expect(puts).toBe(1);
  expect((await readDocument(page, initial.id)).draft!.data).toMatchObject({
    title: "",
  });
  await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(discards).toBe(1);
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "기기 내용으로 복구" }),
  ).toHaveCount(0);
});

test("publish partial success keeps newer input and the cache retry notice through autosave", async ({
  page,
}) => {
  const initial = await createDocument(page);
  const arrived = gate();
  const held = gate();
  let publishes = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    publishes++;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    const content = await response.json();
    arrived.release();
    await held.promise;
    await route.fulfill({
      status: 503,
      json: { error: cacheError, code: "CACHE_PENDING", content },
    });
  });
  try {
    await page.goto(`/admin/edit/${initial.id}`);
    await page.getByRole("button", { name: "수정사항 게시" }).click();
    await arrived.promise;
    await page.getByLabel("제목", { exact: true }).fill("게시 이후 새 초안");
    held.release();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    const saved = await readDocument(page, initial.id);
    expect(saved.draft!.data).toMatchObject({ title: "게시 이후 새 초안" });
    expect(saved.published!.data).toMatchObject({ title: "기준 제목" });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      cacheError,
    );
    await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(publishes).toBe(1);
  } finally {
    held.release();
  }
});

test("delete partial success shows a terminal view and retries only the cache operation", async ({
  page,
}) => {
  const initial = await createDocument(page);
  const trash = await page.request.post(`/api/admin/content/${initial.id}`, {
    headers: origin,
    data: { action: "trash", revision: initial.revision },
  });
  expect(trash.ok()).toBeTruthy();
  let deletes = 0;
  let retries = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    deletes++;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toBeNull();
    await route.fulfill({
      status: 503,
      json: { error: cacheError, code: "CACHE_PENDING", content: null },
    });
  });
  await page.route("**/api/admin/cache", (route) => {
    if (++retries === 1)
      return route.fulfill({
        status: 503,
        json: { error: "캐시 재시도 실패" },
      });
    return route.continue();
  });
  await page.goto(`/admin/edit/${initial.id}`);
  await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "콘텐츠를 삭제했습니다." }),
  ).toBeVisible();
  await expect(page.locator(".editor-bottom-actions")).toHaveCount(0);
  expect(
    (await page.request.get(`/api/admin/content/${initial.id}`)).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "캐시 재시도 실패",
  );
  await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(deletes).toBe(1);
  expect(retries).toBe(2);
});

test("discard cancels pending media callbacks before they can modify the reset draft", async ({
  page,
}) => {
  const initial = await createDocument(page);
  const held = await holdImageImport(page);
  try {
    await page.goto(`/admin/edit/${initial.id}`);
    await beginImageImport(page, "대표 이미지");
    await held.arrived;
    await page
      .getByRole("button", { name: "수정사항 폐기", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확인", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/media") &&
        response.request().method() === "POST",
    );
    held.release();
    await response;
    await page.getByLabel("제목", { exact: true }).fill("폐기 후 새 초안");
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await readDocument(page, initial.id)).draft!.data).toMatchObject({
      title: "폐기 후 새 초안",
      imageId: null,
    });
  } finally {
    held.release();
  }
});
