import { readFile, readdir } from "node:fs/promises";
import { pool, transaction } from "../src/server/db";
export async function migrate() {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(310001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (await client.query("SELECT 1 FROM migrations WHERE name=$1", [name]))
          .rowCount
      )
        continue;
      await client.query(await readFile(`migrations/${name}`, "utf8"));
      await client.query("INSERT INTO migrations(name) VALUES($1)", [name]);
    }
  });
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  await migrate();
  await pool.end();
}
