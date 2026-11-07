import { readFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
export default async function teardown() {
  try {
    const name = (await readFile(".cache/portfolio-e2e-db", "utf8")).trim();
    if (/^portfolio-test-55440-\d+$/.test(name)) {
      try {
        execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
      } catch {}
    }
    await unlink(".cache/portfolio-e2e-db");
  } catch {}
}
