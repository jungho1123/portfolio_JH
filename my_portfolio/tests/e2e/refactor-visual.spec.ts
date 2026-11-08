import { test, expect, type Request } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Opt-in: retain the before images independently of Playwright's test-results cleanup.
const phase = process.env.REFACTOR_VISUAL_PHASE;
test("refactor visual comparison", async ({ page, context }) => {
  test.skip(
    !phase,
    "Set REFACTOR_VISUAL_PHASE=before or after to compare fixtures",
  );
  test.setTimeout(180000);
  const pendingApi = new Set<Request>();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) pendingApi.add(request);
  });
  page.on("requestfinished", (request) => pendingApi.delete(request));
  page.on("requestfailed", (request) => pendingApi.delete(request));
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
  const projects = await (
    await page.request.get("/api/admin/content?kind=PROJECT")
  ).json();
  const blogs = await (
    await page.request.get("/api/admin/content?kind=BLOG")
  ).json();
  const routes = [
    ["home", "/"],
    ["blog", "/blog"],
    ["projects", "/projects"],
    ["blog-detail", "/blog/blog-1"],
    ["project-detail", "/projects/project-1"],
    ["home-editor", "/admin/edit/home"],
    [
      "blog-editor",
      `/admin/edit/${blogs.find((p: { published: { data: { slug: string } } }) => p.published.data.slug === "blog-1").id}`,
    ],
    [
      "project-editor",
      `/admin/edit/${projects.find((p: { published: { data: { slug: string } } }) => p.published.data.slug === "project-1").id}`,
    ],
  ];
  const root = ".cache/refactor-visual";
  await mkdir(`${root}/${phase}`, { recursive: true });
  const comparisons: { name: string; changedPixels: number; pixels: number }[] =
    [];
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const [name, url] of routes) {
        const hydrated =
          name === "blog" || name === "projects"
            ? page.waitForResponse(
                (response) =>
                  response.url().includes("/api/public/posts?") &&
                  response.ok(),
              )
            : null;
        await page.goto(url);
        await page.locator("main h1").waitFor();
        if (hydrated) {
          await Promise.race([
            hydrated,
            page.locator(".load-more [role=status]").waitFor(),
          ]);
          // The original development build can abort its initial Strict Mode request.
          // Use the same supported page-return revalidation in both versions.
          await page.evaluate(() =>
            window.dispatchEvent(
              new PageTransitionEvent("pageshow", { persisted: true }),
            ),
          );
          await hydrated;
          await expect(page.locator(".load-more [role=status]")).toHaveCount(0);
        }
        if (url.includes("/admin/edit"))
          await page.locator(".cm-editor").first().waitFor();
        if (name === "home-editor")
          await expect(page.locator(".featured-row").first()).toContainText(
            "테스트 프로젝트",
          );
        if (name === "blog-editor" || name === "project-editor") {
          await expect(
            page.getByLabel("카테고리", { exact: true }).locator("option"),
          ).toHaveCount(2);
          await page
            .locator(".editor-preview .shiki")
            .waitFor({ state: "attached" });
        }
        if (name.endsWith("detail")) await page.locator(".shiki").waitFor();
        await expect.poll(() => pendingApi.size).toBe(0);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        // The observer's pagination has its own functional tests. Freeze the first page here.
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important }",
        });
        const filename = `${name}-${width}-${theme}`;
        const mask = [page.locator(".save-status")];
        const screenshot = await page.screenshot({
          path: `${root}/${phase}/${filename}.png`,
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          mask,
        });
        const structure = await page
          .locator("main")
          .evaluate((main) =>
            [...main.querySelectorAll("*")]
              .filter((node) => !node.closest(".save-status"))
              .map((node) => [
                node.tagName,
                node.getAttribute("class"),
                node.getAttribute("role"),
                node.getAttribute("aria-label"),
              ]),
          );
        if (phase === "before") {
          await writeFile(
            `${root}/before/${filename}.json`,
            JSON.stringify(structure),
          );
        } else {
          expect(structure, `${filename} DOM`).toEqual(
            JSON.parse(
              await readFile(`${root}/before/${filename}.json`, "utf8"),
            ),
          );
          const before = await sharp(
            await readFile(`${root}/before/${filename}.png`),
          )
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const after = await sharp(screenshot)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          expect(after.info, `${filename} dimensions`).toEqual(before.info);
          let changedPixels = 0;
          for (let i = 0; i < after.data.length; i += 4) {
            if (
              [0, 1, 2].some(
                (channel) =>
                  Math.abs(after.data[i + channel] - before.data[i + channel]) >
                  8,
              )
            )
              changedPixels++;
          }
          const pixels = after.info.width * after.info.height;
          comparisons.push({ name: filename, changedPixels, pixels });
          expect(
            changedPixels / pixels,
            `${filename} changed pixels`,
          ).toBeLessThanOrEqual(0.001);
        }
      }
    }
  }
  if (phase === "after")
    await writeFile(
      `${root}/comparison.json`,
      JSON.stringify(comparisons, null, 2),
    );
});
