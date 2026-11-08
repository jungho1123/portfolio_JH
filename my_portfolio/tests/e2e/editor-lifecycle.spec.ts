import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { AdminDocument } from "../../lib/admin-types";

const origin = { Origin: "http://localhost:3100" };
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function read(page: Page, id: string): Promise<AdminDocument> {
  return (await page.request.get(`/api/admin/content/${id}`)).json();
}
async function create(page: Page): Promise<AdminDocument> {
  return (
    await page.request.post("/api/admin/content", {
      headers: origin,
      data: { kind: "BLOG" },
    })
  ).json();
}
async function hide(page: Page) {
  await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("콘텐츠");
}
async function resume(page: Page, id: string) {
  await page.locator(`a[href="/admin/edit/${id}"]`).click();
  await expect(page.getByLabel("제목", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page, context }) => {
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
  page.on("dialog", (dialog) => dialog.accept());
});

test("dirty input hidden before debounce resumes with exactly one autosave", async ({
  page,
}) => {
  const initial = await create(page);
  let puts = 0;
  await page.route(`**/api/admin/content/${initial.id}`, (route) => {
    if (route.request().method() === "PUT") puts++;
    return route.continue();
  });
  await page.goto(`/admin/edit/${initial.id}`);
  await page.locator(".cm-editor").waitFor();
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 10000));
  await page.getByLabel("제목", { exact: true }).fill("복귀 후 자동저장");
  await hide(page);
  expect(puts).toBe(0);
  await resume(page, initial.id);
  await page.clock.resume();
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
  expect((await read(page, initial.id)).draft!.data).toMatchObject({
    title: "복귀 후 자동저장",
  });
  expect(puts).toBe(1);
});

for (const acknowledgement of ["hidden", "resumed"] as const) {
  test(`a save acknowledged while ${acknowledgement} confirms only its submitted generation`, async ({
    page,
  }) => {
    const initial = await create(page);
    const arrived = gate();
    const held = gate();
    let puts = 0;
    await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
      if (route.request().method() !== "PUT" || ++puts !== 1)
        return route.continue();
      const response = await route.fetch();
      arrived.release();
      await held.promise;
      await route.fulfill({ response });
    });
    try {
      await page.goto(`/admin/edit/${initial.id}`);
      const title = page.getByLabel("제목", { exact: true });
      await title.fill("요청에 담긴 입력");
      await arrived.promise;
      await title.fill("보존할 최신 입력");
      await hide(page);
      if (acknowledgement === "hidden") {
        const delivered = page.waitForResponse(
          (r) => r.url().endsWith(initial.id) && r.request().method() === "PUT",
        );
        held.release();
        await delivered;
      }
      await resume(page, initial.id);
      if (acknowledgement === "resumed") {
        await expect(
          page.getByRole("button", { name: "저장", exact: true }),
        ).toBeDisabled();
        await title.fill("조정 중 추가 입력");
        await page.waitForTimeout(1200);
        expect(puts).toBe(1);
        held.release();
      }
      const expected =
        acknowledgement === "hidden" ? "보존할 최신 입력" : "조정 중 추가 입력";
      await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
      await expect(title).toHaveValue(expected);
      const saved = await read(page, initial.id);
      expect(saved.revision).toBe(initial.revision + 2);
      expect(saved.draft!.data).toMatchObject({ title: expected });
      expect(puts).toBe(2);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    } finally {
      held.release();
    }
  });
}

for (const ambiguous of [false, true]) {
  test(`${ambiguous ? "an ambiguous committed response" : "another client's revision"} cannot be confirmed by matching text`, async ({
    page,
  }) => {
    const initial = await create(page);
    let puts = 0;
    await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      puts++;
      if (ambiguous) await route.fetch();
      return route.fulfill({ status: 503, json: { error: "저장 응답 불명" } });
    });
    await page.goto(`/admin/edit/${initial.id}`);
    await page.getByLabel("제목", { exact: true }).fill("같은 텍스트");
    await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
    await hide(page);
    if (!ambiguous) {
      const response = await page.request.put(
        `/api/admin/content/${initial.id}`,
        {
          headers: origin,
          data: {
            revision: initial.revision,
            data: { ...initial.draft!.data, title: "같은 텍스트" },
          },
        },
      );
      expect(response.ok()).toBeTruthy();
    }
    await resume(page, initial.id);
    await expect(
      page.getByRole("button", { name: "서버 초안 다시 조회" }),
    ).toBeVisible();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "같은 텍스트",
    );
    await expect(
      page.getByRole("button", { name: "수정사항 게시" }),
    ).toBeDisabled();
    await page.waitForTimeout(1200);
    expect(puts).toBe(1);
  });
}

test("failed reconciliation pauses autosave and explicit save retries it without losing composition", async ({
  page,
}) => {
  const initial = await create(page);
  let fail = true;
  let puts = 0;
  await page.goto(`/admin/edit/${initial.id}`);
  await page.route(`**/api/admin/content/${initial.id}`, (route) => {
    if (route.request().method() === "PUT") puts++;
    if (route.request().method() === "GET" && fail)
      return route.fulfill({ status: 503, json: { error: "재조회 실패" } });
    return route.continue();
  });
  await hide(page);
  await resume(page, initial.id);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "재조회 실패",
  );
  const title = page.getByLabel("제목", { exact: true });
  await title.fill("재조회 실패 후 보존");
  await page.waitForTimeout(1200);
  expect(puts).toBe(0);
  fail = false;
  await title.dispatchEvent("compositionstart");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.waitForTimeout(1200);
  expect(puts).toBe(0);
  await title.fill("조합 완료된 최신 입력");
  await title.dispatchEvent("compositionend");
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
  expect(puts).toBe(1);
  expect((await read(page, initial.id)).draft!.data).toMatchObject({
    title: "조합 완료된 최신 입력",
  });
});

test("repeated restoration ignores the older authoritative response", async ({
  page,
}) => {
  const initial = await create(page);
  await page.goto(`/admin/edit/${initial.id}`);
  const arrived = gate();
  const held = gate();
  let gets = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() !== "GET" || ++gets !== 1)
      return route.continue();
    arrived.release();
    await held.promise;
    await route
      .fulfill({ status: 503, json: { error: "오래된 재조회 실패" } })
      .catch(() => {});
  });
  try {
    await hide(page);
    await resume(page, initial.id);
    await arrived.promise;
    await page.getByLabel("제목", { exact: true }).fill("첫 복귀의 입력");
    await hide(page);
    await resume(page, initial.id);
    await expect(
      page.getByRole("button", { name: "저장", exact: true }),
    ).toBeEnabled();
    held.release();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await read(page, initial.id)).draft!.data).toMatchObject({
      title: "첫 복귀의 입력",
    });
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  } finally {
    held.release();
  }
});

test("another client's edit during reconciliation preserves local input and its recovery", async ({
  page,
}) => {
  const initial = await create(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  const arrived = gate();
  const held = gate();
  let puts = 0;
  let gets = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() === "PUT") puts++;
    if (route.request().method() !== "GET" || ++gets !== 1)
      return route.continue();
    arrived.release();
    await held.promise;
    await route.continue();
  });
  try {
    await hide(page);
    await resume(page, initial.id);
    await arrived.promise;
    await page.getByLabel("제목", { exact: true }).fill("조정 중 보존할 입력");
    const other = await page.request.put(`/api/admin/content/${initial.id}`, {
      headers: origin,
      data: {
        revision: initial.revision,
        data: { ...initial.draft!.data, title: "다른 클라이언트의 입력" },
      },
    });
    expect(other.ok()).toBeTruthy();
    held.release();
    await expect(
      page.getByRole("button", { name: "서버 초안 다시 조회" }),
    ).toBeVisible();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "조정 중 보존할 입력",
    );
    await page.waitForTimeout(1200);
    expect(puts).toBe(0);
    await page.reload();
    await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    expect((await read(page, initial.id)).draft!.data).toMatchObject({
      title: "조정 중 보존할 입력",
    });
  } finally {
    held.release();
  }
});

for (const action of ["publish", "discard"] as const) {
  test(`a hidden ${action} acknowledgement settles once and preserves newer input`, async ({
    page,
  }) => {
    let initial = await create(page);
    const taxons: { id: string; kind: string; type: string }[] = await (
      await page.request.get("/api/admin/taxonomy")
    ).json();
    initial = await (
      await page.request.put(`/api/admin/content/${initial.id}`, {
        headers: origin,
        data: {
          revision: initial.revision,
          data: {
            ...initial.draft!.data,
            title: "작업 이전 초안",
            categoryId: taxons.find(
              (t) => t.kind === "BLOG" && t.type === "CATEGORY",
            )!.id,
          },
        },
      })
    ).json();
    const arrived = gate();
    const held = gate();
    let posts = 0;
    let puts = 0;
    await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
      if (route.request().method() === "PUT") puts++;
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      const content = await response.json();
      arrived.release();
      await held.promise;
      await route.fulfill(
        action === "publish"
          ? {
              status: 503,
              json: { error: "캐시 갱신 대기", code: "CACHE_PENDING", content },
            }
          : { response },
      );
    });
    try {
      await page.goto("/admin");
      await page.locator(`a[href="/admin/edit/${initial.id}"]`).click();
      if (action === "publish")
        await page.getByRole("button", { name: "수정사항 게시" }).click();
      else {
        await page.getByRole("button", { name: "수정사항 폐기" }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "확인", exact: true })
          .click();
      }
      await arrived.promise;
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "콘텐츠",
      );
      await page.goForward();
      await expect(page.getByLabel("제목", { exact: true })).toBeVisible();
      await page
        .getByLabel("제목", { exact: true })
        .fill("작업 이후 보존할 입력");
      held.release();
      await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
      const saved = await read(page, initial.id);
      expect(saved.draft!.data).toMatchObject({
        title: "작업 이후 보존할 입력",
      });
      if (action === "publish") {
        expect(saved.published!.data).toMatchObject({
          title: "작업 이전 초안",
        });
        await expect(page.locator("main").getByRole("alert")).toContainText(
          "캐시 갱신 대기",
        );
        await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
      }
      expect(posts).toBe(1);
      expect(puts).toBe(1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.reload();
      await expect(page.locator(".cm-editor")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "기기 내용으로 복구" }),
      ).toHaveCount(0);
    } finally {
      held.release();
    }
  });
}

test("a failed read retains a hidden save acknowledgement for the explicit retry", async ({
  page,
}) => {
  const initial = await create(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  const arrived = gate();
  const held = gate();
  let failRead = true;
  let puts = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() === "GET" && failRead)
      return route.fulfill({ status: 503, json: { error: "확인 조회 실패" } });
    if (route.request().method() !== "PUT" || ++puts !== 1)
      return route.continue();
    const response = await route.fetch();
    arrived.release();
    await held.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByLabel("제목", { exact: true }).fill("확인할 서버 저장");
    await arrived.promise;
    await page.getByLabel("제목", { exact: true }).fill("보존할 새 입력");
    await hide(page);
    await resume(page, initial.id);
    held.release();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "확인 조회 실패",
    );
    await page.waitForTimeout(1200);
    expect(puts).toBe(1);
    failRead = false;
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
    const saved = await read(page, initial.id);
    expect(saved.revision).toBe(initial.revision + 2);
    expect(saved.draft!.data).toMatchObject({ title: "보존할 새 입력" });
    expect(puts).toBe(2);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  } finally {
    held.release();
  }
});

test("a hidden delete acknowledgement produces a terminal view and retries only cache invalidation", async ({
  page,
}) => {
  const initial = await create(page);
  const trash = await page.request.post(`/api/admin/content/${initial.id}`, {
    headers: origin,
    data: { action: "trash", revision: initial.revision },
  });
  expect(trash.ok()).toBeTruthy();
  const arrived = gate();
  const held = gate();
  let posts = 0;
  await page.route(`**/api/admin/content/${initial.id}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toBeNull();
    arrived.release();
    await held.promise;
    await route.fulfill({
      status: 503,
      json: {
        error: "삭제 후 캐시 갱신 대기",
        code: "CACHE_PENDING",
        content: null,
      },
    });
  });
  try {
    await page.goto("/admin");
    await page.getByLabel("공개 상태").selectOption("TRASH");
    await page.locator(`a[href="/admin/edit/${initial.id}"]`).click();
    await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확인", exact: true })
      .click();
    await arrived.promise;
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("콘텐츠");
    await page.goForward();
    await expect(
      page.getByRole("button", { name: "처리 중…", exact: true }),
    ).toBeDisabled();
    held.release();
    await expect(
      page.getByRole("heading", { name: "콘텐츠를 삭제했습니다." }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".editor-bottom-actions")).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "삭제 후 캐시 갱신 대기",
    );
    await page.getByRole("button", { name: "캐시 갱신 재시도" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(posts).toBe(1);
  } finally {
    held.release();
  }
});

test("a delayed recovery deletion cannot remove input newer than its confirmed generation", async ({
  page,
}) => {
  const initial = await create(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  await page.locator(".cm-editor").waitFor();
  await page.evaluate(() => {
    const nativeOpen = indexedDB.open.bind(indexedDB);
    const setter = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      "onsuccess",
    )!.set!;
    let opens = 0;
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
      const request = nativeOpen(...args);
      // The first open writes the edited snapshot; the second clears the confirmed save.
      if (++opens !== 2) return request;
      Object.defineProperty(request, "onsuccess", {
        set(callback: ((this: IDBRequest, event: Event) => unknown) | null) {
          setter.call(request, (event: Event) => {
            document.documentElement.dataset.recoveryDeleteHeld = "true";
            addEventListener(
              "release-recovery-delete",
              () => callback?.call(request, event),
              { once: true },
            );
          });
        },
      });
      return request;
    };
  });
  await page.getByLabel("제목", { exact: true }).fill("확인된 이전 저장");
  await page.waitForFunction(
    () => document.documentElement.dataset.recoveryDeleteHeld === "true",
  );
  await page.route(`**/api/admin/content/${initial.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 401, json: { error: "다음 저장 실패" } })
      : route.continue(),
  );
  await page
    .getByLabel("제목", { exact: true })
    .fill("삭제하면 안 되는 최신 복구본");
  await page.evaluate(() =>
    dispatchEvent(new Event("release-recovery-delete")),
  );
  await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
  await page.unroute(`**/api/admin/content/${initial.id}`);
  await page.reload();
  await page.getByRole("button", { name: "기기 내용으로 복구" }).click();
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
    "삭제하면 안 되는 최신 복구본",
  );
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
});

test("a committed discard retains the recovery cleanup warning when IndexedDB deletion fails", async ({
  page,
}) => {
  const initial = await create(page);
  await page.goto(`/admin/edit/${initial.id}`);
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  await page.locator(".cm-editor").waitFor();
  await page.evaluate(() => {
    IDBObjectStore.prototype.delete = function () {
      throw new DOMException("기기 저장소 삭제 실패", "UnknownError");
    };
  });
  await page.getByLabel("제목", { exact: true }).fill("폐기할 기기 입력");
  await page.getByRole("button", { name: "수정사항 폐기" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "서버 반영은 완료했지만 기기 복구본을 정리하지 못했습니다.",
  );
  expect((await read(page, initial.id)).draft!.data).toMatchObject({
    title: "",
  });
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue("");
});
