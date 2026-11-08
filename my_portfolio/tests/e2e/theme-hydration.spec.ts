import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { AdminDocument } from "../../lib/admin-types";

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

function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      /hydrat|server[- ]rendered html|did not match/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectEditorTheme(page: Page, theme: "light" | "dark") {
  // Cache Components keeps other routes' editors in hidden Activity trees.
  // Multiple visible editors must still fail this assertion.
  const editor = page.locator(".editor-input > div").filter({ visible: true });
  await expect(editor).toHaveCount(1);
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await expect(editor).toHaveClass(`cm-theme-${theme}`);
  await expect(editor.locator(".cm-editor")).toHaveCSS(
    "background-color",
    theme === "dark" ? "rgb(40, 44, 52)" : "rgb(255, 255, 255)",
  );
  await expect(editor.locator(".cm-content")).toHaveAttribute(
    "contenteditable",
    "true",
  );
}

for (const scenario of [
  { name: "saved dark", stored: "dark", system: "light", expected: "dark" },
  { name: "saved light", stored: "light", system: "dark", expected: "light" },
  { name: "system dark", stored: "system", system: "dark", expected: "dark" },
  {
    name: "system light",
    stored: "system",
    system: "light",
    expected: "light",
  },
] as const) {
  test(`editors hydrate without warnings with ${scenario.name} theme`, async ({
    page,
  }) => {
    const errors = collectHydrationErrors(page);
    await page.emulateMedia({ colorScheme: scenario.system });
    await page.addInitScript(
      (theme) => localStorage.setItem("theme", theme),
      scenario.stored,
    );
    const response = await page.request.get(
      "/api/admin/content?state=PUBLISHED",
    );
    expect(response.ok()).toBeTruthy();
    const posts: AdminDocument[] = await response.json();
    const ids = [
      "home",
      posts.find((post) => post.kind === "BLOG")!.id,
      posts.find((post) => post.kind === "PROJECT")!.id,
    ];
    for (const id of ids) {
      await test.step(`direct load and reload of ${id}`, async () => {
        await page.goto(`/admin/edit/${id}`);
        await expect(
          page.locator(".cm-content").filter({ visible: true }),
        ).toBeVisible();
        expect(errors).toEqual([]);
        await expectEditorTheme(page, scenario.expected);
        await page.reload();
        await expectEditorTheme(page, scenario.expected);
        expect(errors).toEqual([]);
      });
    }
  });
}

test("editor theme changes preserve input and follow system preferences after reload", async ({
  page,
}) => {
  const errors = collectHydrationErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
  const response = await page.request.post("/api/admin/content", {
    headers: { Origin: "http://localhost:3100" },
    data: { kind: "BLOG" },
  });
  expect(response.ok()).toBeTruthy();
  const created: AdminDocument = await response.json();
  // Enter through client navigation with no saved theme, then test SSR on reload.
  await page.goto("/admin/edit/home");
  await expectEditorTheme(page, "dark");
  const preservedEditor = await page
    .locator(".editor-input > div")
    .filter({ visible: true })
    .elementHandle();
  await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
  await page.locator(`a[href="/admin/edit/${created.id}"]`).click();
  // CodeMirror cleans up its inner view when hidden; Activity keeps its wrapper.
  await expect(page.locator(".editor-input > div")).toHaveCount(2);
  await expect(
    page.locator(".editor-input > div").filter({ visible: false }),
  ).toHaveCount(1);
  expect(await preservedEditor!.evaluate((node) => node.isConnected)).toBe(
    true,
  );
  await expectEditorTheme(page, "dark");
  const input = page.locator(".cm-content").filter({ visible: true });
  const inputNode = await input.elementHandle();
  const markdown = "## 테마 전환 후에도 유지할 본문";
  await input.fill(markdown);
  await page.getByRole("button", { name: "테마 선택" }).click();
  await page.getByRole("menuitem", { name: "라이트", exact: true }).click();
  await expectEditorTheme(page, "light");
  await expect(input).toHaveText(markdown);
  expect(await inputNode!.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: "테마 선택" }).click();
  await page.getByRole("menuitem", { name: "시스템", exact: true }).click();
  await expectEditorTheme(page, "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expectEditorTheme(page, "light");
  await expect(input).toHaveText(markdown);
  expect(await inputNode!.evaluate((node) => node.isConnected)).toBe(true);
  await expect
    .poll(async () => {
      const saved: AdminDocument = await (
        await page.request.get(`/api/admin/content/${created.id}`)
      ).json();
      return saved.draft!.data;
    })
    .toMatchObject({ markdown });
  await page.reload();
  await expectEditorTheme(page, "light");
  await expect(input).toHaveText(markdown);
  expect(errors).toEqual([]);
});
