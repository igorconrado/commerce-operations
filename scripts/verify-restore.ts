import pg from "pg";
const source = new URL(process.env.DATABASE_URL ?? "");
if (!source.pathname.endsWith("_test"))
  throw new Error("Restore verification only accepts disposable test sources");
const target = new URL(source);
target.pathname = "/commerce_restore_test";
const original = new pg.Pool({ connectionString: source.toString() });
const restored = new pg.Pool({ connectionString: target.toString() });
try {
  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    source: source.pathname,
    target: target.pathname,
  };
  for (const table of [
    "organizations",
    "users",
    "variants",
    "orders",
    "idempotency",
    "stock_movements",
    "outbox",
    "payment_inbox",
    "payments",
    "payment_commands",
    "audit_log",
  ]) {
    const sql = `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text),'')) AS digest,count(*)::int AS count FROM ${table} t`;
    const a = (await original.query(sql)).rows[0];
    const b = (await restored.query(sql)).rows[0];
    if (a.digest !== b.digest || a.count !== b.count)
      throw new Error(`Restore mismatch: ${table}`);
    report[table] = { count: a.count, matched: true };
  }
  if (
    (await restored.query("SELECT 1 FROM variants WHERE available<0")).rowCount
  )
    throw new Error("Negative restored stock");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(".tmp/reports", { recursive: true });
  await writeFile(".tmp/reports/restore.json", JSON.stringify(report, null, 2));
  console.info(JSON.stringify({ event: "restore.verified", tables: 11 }));
} finally {
  await original.end();
  await restored.end();
}
