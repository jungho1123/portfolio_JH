import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
export async function testDatabase(port: number) {
  const name = `portfolio-test-${port}-${process.pid}`;
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_PASSWORD=portfolio-test-only",
      "-p",
      `127.0.0.1:${port}:5432`,
      "postgres:17",
    ],
    { stdio: "pipe" },
  );
  const url = `postgresql://postgres:portfolio-test-only@127.0.0.1:${port}/postgres`;
  let ready = false;
  try {
    for (let i = 0; i < 100; i++) {
      const probe = new pg.Client({
        connectionString: url,
        connectionTimeoutMillis: 500,
      });
      try {
        await probe.connect();
        ready = true;
      } catch {
      } finally {
        await probe.end().catch(() => {});
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error("Isolated PostgreSQL did not start");
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    for (const name of (await readdir("prisma/migrations")).sort())
      if (name !== "migration_lock.toml")
        await client.query(
          await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
        );
    await client.end();
    return {
      url,
      name,
      close: async () => {
        execFileSync("docker", ["stop", name], { stdio: "pipe" });
      },
    };
  } catch (error) {
    execFileSync("docker", ["stop", name], { stdio: "pipe" });
    throw error;
  }
}
