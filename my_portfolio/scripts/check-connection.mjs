import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import pg from "pg";
loadEnvConfig(process.cwd());
const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  );
  console.log(
    "Database connection: OK. Tables:",
    result.rows.map((r) => r.table_name).join(", "),
  );
  const migrations = await client
    .query(
      "SELECT migration_name, finished_at IS NOT NULL AS applied FROM _prisma_migrations ORDER BY started_at",
    )
    .catch(() => ({ rows: [] }));
  console.log("Migrations:", JSON.stringify(migrations.rows));
} catch (error) {
  console.error("Database connection failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await client.end();
}
