import { test, expect, type Page, type APIResponse } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { AdminDocument } from "../../lib/admin-types";

const origin = { Origin: "http://localhost:3100" };
async function login(page: Page) {
  const token = "fixture-admin-token";
  const signature = createHmac(
    "sha256",
    "isolated-e2e-secret-never-use-in-production",
  )
    .update(token)
    .digest("base64");
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function createDocument(page: Page): Promise<AdminDocument> {
  const created: AdminDocument = await (
    await page.request.post("/api/admin/content", {
      headers: origin,
      data: { kind: "BLOG" },
    })
  ).json();
  const taxons: { id: string; kind: string; type: string }[] = await (
    await page.request.get("/api/admin/taxonomy")
  ).json();
  const categoryId = taxons.find(
    (t) => t.kind === "BLOG" && t.type === "CATEGORY",
  )!.id;
  return (
    await page.request.put(`/api/admin/content/${created.id}`, {
      headers: origin,
      data: {
        revision: created.revision,
        data: { ...created.draft!.data, title: "기준 초안", categoryId },
      },
    })
  ).json();
}
function gate<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function holdResponse(page: Page, id: string, method: string) {
  const arrived = gate<APIResponse>();
  const release = gate();
  let held = false;
  await page.route(`**/api/admin/content/${id}`, async (route) => {
    if (held || route.request().method() !== method) return route.continue();
    held = true;
    const response = await route.fetch();
    arrived.resolve(response);
    await release.promise;
    // Navigating away may have cancelled the original browser request.
    await route.fulfill({ response }).catch(() => {});
  });
  return { arrived: arrived.promise, release: () => release.resolve() };
}
async function fetchDocument(page: Page, id: string): Promise<AdminDocument> {
  return (await page.request.get(`/api/admin/content/${id}`)).json();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("a delayed save preserves newer input and publish waits for its revision", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const held = await holdResponse(page, initial.id, "PUT");
  const title = page.getByLabel("제목", { exact: true });
  try {
    await title.fill("첫 번째 저장");
    await held.arrived;
    await title.fill("저장 중 입력한 최종 제목");
    await page.getByRole("button", { name: "수정사항 게시" }).click();
    expect((await fetchDocument(page, initial.id)).published).toBeNull();
    held.release();
    await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
    await expect(title).toHaveValue("저장 중 입력한 최종 제목");
    const saved = await fetchDocument(page, initial.id);
    expect(saved.draft!.data).toEqual(saved.published!.data);
    expect(saved.published!.data).toMatchObject({
      title: "저장 중 입력한 최종 제목",
    });
    expect(saved.revision).toBeGreaterThan(initial.revision + 1);
  } finally {
    held.release();
  }
});

test("publishing during Korean composition waits for the composed data", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const title = page.getByLabel("제목", { exact: true });
  await title.dispatchEvent("compositionstart");
  await title.fill("조합 중인 게시 제목");
  await page.getByRole("button", { name: "수정사항 게시" }).click();
  expect((await fetchDocument(page, initial.id)).published).toBeNull();
  await title.dispatchEvent("compositionend");
  await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
  const saved = await fetchDocument(page, initial.id);
  expect(saved.published!.data).toMatchObject({ title: "조합 중인 게시 제목" });
  expect(saved.draft!.data).toEqual(saved.published!.data);
});

test("input during a publish response remains a separate saved draft", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const held = await holdResponse(page, initial.id, "POST");
  try {
    await page.getByRole("button", { name: "수정사항 게시" }).click();
    await held.arrived;
    await page
      .getByLabel("제목", { exact: true })
      .fill("게시 요청 이후의 편집");
    held.release();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await fetchDocument(page, initial.id)).draft!.data)
      .toMatchObject({ title: "게시 요청 이후의 편집" });
    const saved = await fetchDocument(page, initial.id);
    expect(saved.published!.data).toMatchObject({ title: "기준 초안" });
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "게시 요청 이후의 편집",
    );
  } finally {
    held.release();
  }
});

test("failed saves and conflicts never proceed to publish", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  let publishes = 0;
  let puts = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() === "POST") {
      publishes++;
      return route.continue();
    }
    if (route.request().method() !== "PUT") return route.continue();
    puts++;
    await route.fulfill({
      status: 409,
      json: { error: "다른 탭에서 변경되었습니다.", code: "CONFLICT" },
    });
  });
  await page.getByLabel("제목", { exact: true }).fill("충돌하는 초안");
  await page.getByRole("button", { name: "수정사항 게시" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "다른 탭",
  );
  await expect(
    page.getByRole("button", { name: "수정사항 게시" }),
  ).toBeDisabled();
  await page.getByLabel("제목", { exact: true }).fill("충돌 이후 입력");
  // Cross the existing debounce interval to prove that conflict blocks autosaving.
  await page.waitForTimeout(1200);
  expect(puts).toBe(1);
  expect(publishes).toBe(0);
  expect((await fetchDocument(page, initial.id)).published).toBeNull();
});

test("a recovered draft saves against the current server revision", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() === "PUT")
      return route.fulfill({
        status: 401,
        json: { error: "로그인이 필요합니다." },
      });
    await route.continue();
  });
  await page.getByLabel("제목", { exact: true }).fill("복구할 최신 입력");
  await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.unroute(`**/api/admin/content/${initial.id}`);
  await page.reload();
  await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
  const saved = await fetchDocument(page, initial.id);
  expect(saved.revision).toBe(initial.revision + 1);
  expect(saved.draft!.data).toMatchObject({ title: "복구할 최신 입력" });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "기기 내용으로 복구" }),
  ).toHaveCount(0);
});

test("leaving a document cancels follow-up saves from its delayed response", async ({
  page,
}) => {
  const first = await createDocument(page);
  const second = await createDocument(page);
  await page.goto(`/admin/edit/${first.id}`);
  const held = await holdResponse(page, first.id, "PUT");
  try {
    await page.getByLabel("제목", { exact: true }).fill("이전 문서 저장");
    await held.arrived;
    await page.getByLabel("제목", { exact: true }).fill("이전 문서 복구본");
    page.on("dialog", (dialog) => dialog.accept());
    // Use the existing client navigation, retaining the browser realm and recovery tab ID.
    await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
    await page
      .getByRole("link")
      .filter({
        has: page.getByRole("heading", { name: "기준 초안", exact: true }),
      })
      .first()
      .click();
    // Select the known second document even if dashboard order changes.
    if (!page.url().endsWith(second.id))
      await page.goto(`/admin/edit/${second.id}`);
    held.release();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "기준 초안",
    );
    await page.getByLabel("제목", { exact: true }).fill("새 문서의 입력");
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await fetchDocument(page, first.id)).draft!.data).toMatchObject({
      title: "이전 문서 저장",
    });
    expect((await fetchDocument(page, second.id)).draft!.data).toMatchObject({
      title: "새 문서의 입력",
    });
    await page.goto(`/admin/edit/${first.id}`);
    await expect(
      page.getByRole("button", { name: "기기 내용으로 복구" }),
    ).toBeVisible();
  } finally {
    held.release();
  }
});

test("an older save never removes the recovery copy of a newer failed save", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const held = await holdResponse(page, initial.id, "PUT");
  try {
    await page.getByLabel("제목", { exact: true }).fill("먼저 저장할 내용");
    await held.arrived;
    // This newer handler only fails subsequent saves; the held response is already in flight.
    await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
      if (route.request().method() === "PUT")
        return route.fulfill({
          status: 401,
          json: { error: "로그인이 필요합니다." },
        });
      await route.fallback();
    });
    await page
      .getByLabel("제목", { exact: true })
      .fill("남겨야 하는 최신 복구본");
    held.release();
    await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await page.unroute(`**/api/admin/content/${initial.id}`);
    await page.reload();
    await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "남겨야 하는 최신 복구본",
    );
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await fetchDocument(page, initial.id)).draft!.data).toMatchObject({
      title: "남겨야 하는 최신 복구본",
    });
  } finally {
    held.release();
  }
});

test("logout clears recovery and an old response cannot contaminate the next login", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const held = await holdResponse(page, initial.id, "PUT");
  try {
    await page.getByLabel("제목", { exact: true }).fill("로그아웃 전 저장");
    await held.arrived;
    await page
      .getByLabel("제목", { exact: true })
      .fill("로그아웃으로 정리할 복구본");
    // Exercise the logout UI without deleting the shared fixture's server session.
    await page.route("**/api/auth/sign-out", (route) =>
      route.fulfill({
        json: { success: true },
        headers: {
          "Set-Cookie": "better-auth.session_token=; Max-Age=0; Path=/",
        },
      }),
    );
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "GitHub로 로그인" }),
    ).toBeVisible();
    held.release();
    await login(page);
    await page.goto(`/admin/edit/${initial.id}`);
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "로그아웃 전 저장",
    );
    await expect(
      page.getByRole("button", { name: "기기 내용으로 복구" }),
    ).toHaveCount(0);
    await page.getByLabel("제목", { exact: true }).fill("재로그인 후 입력");
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await fetchDocument(page, initial.id)).draft!.data).toMatchObject({
      title: "재로그인 후 입력",
    });
  } finally {
    held.release();
  }
});

test("authorized previews share the detail and home views while drafts stay private", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/preview/${initial.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("기준 초안");
  await expect(
    page.getByText("관리자 전용 초안 미리보기", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(
        `/blog/${"slug" in initial.draft!.data ? initial.draft!.data.slug : "missing"}`,
      )
    ).status(),
  ).toBe(404);
  await page.goto("/admin/preview/home");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "테스트 프로필",
  );
});

test("a delayed IndexedDB open from an unmounted editor cannot overwrite its next instance", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await page.locator(".cm-editor").waitFor();
  await page.evaluate(() => {
    const nativeOpen = indexedDB.open.bind(indexedDB);
    const setter = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      "onsuccess",
    )!.set!;
    let held = false;
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
      const request = nativeOpen(...args);
      if (held) return request;
      held = true;
      Object.defineProperty(request, "onsuccess", {
        set(callback: ((this: IDBRequest, event: Event) => unknown) | null) {
          setter.call(request, (event: Event) => {
            document.documentElement.dataset.recoveryOpenHeld = "true";
            window.addEventListener(
              "release-recovery-open",
              () => callback?.call(request, event),
              { once: true },
            );
          });
        },
      });
      return request;
    };
  });
  await page
    .getByLabel("제목", { exact: true })
    .fill("이전 인스턴스의 늦은 복구본");
  await page.waitForFunction(
    () => document.documentElement.dataset.recoveryOpenHeld === "true",
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
  await page.locator(`a[href="/admin/edit/${initial.id}"]`).click();
  await page.route(`**/api/admin/content/${initial.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 401, json: { error: "로그인이 필요합니다." } })
      : route.continue(),
  );
  await page
    .getByLabel("제목", { exact: true })
    .fill("새 인스턴스에서 보존할 복구본");
  await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("release-recovery-open")),
  );
  await page.unroute(`**/api/admin/content/${initial.id}`);
  await page.reload();
  await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
    "새 인스턴스에서 보존할 복구본",
  );
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
});

test("an Activity-preserved editor settles old action locks before resuming writes", async ({
  page,
}) => {
  const initial = await createDocument(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const arrived = gate();
  const release = gate();
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    arrived.resolve();
    await release.promise;
    await route
      .fulfill({ status: 503, json: { error: "이전 편집기의 늦은 응답" } })
      .catch(() => {});
  });
  try {
    await page.getByRole("button", { name: "수정사항 게시" }).click();
    await arrived.promise;
    await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
    await page.locator(`a[href="/admin/edit/${initial.id}"]`).click();
    await expect(page.getByRole("button", { name: "처리 중…" })).toBeDisabled();
    await page
      .getByLabel("제목", { exact: true })
      .fill("복귀한 편집기의 최신 입력");
    release.resolve();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "수정사항 게시" }),
    ).toBeEnabled();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect((await fetchDocument(page, initial.id)).draft!.data).toMatchObject({
      title: "복귀한 편집기의 최신 입력",
    });
  } finally {
    release.resolve();
  }
});
