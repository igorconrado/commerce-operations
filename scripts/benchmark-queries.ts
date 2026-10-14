import { performance } from "node:perf_hooks";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pool } from "../src/server/db";
import { fixtures, seed } from "./seed";
import { migrate } from "./migrate";
import { createVariantLoader } from "../src/server/loaders";
if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test"))
  throw new Error("Benchmark requires disposable _test database");
await migrate();
await pool.query("TRUNCATE organizations CASCADE");
await seed();
const ids = Array.from(
  { length: 50 },
  (_, i) => `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
for (const [i, id] of ids.entries())
  await pool.query(
    "INSERT INTO variants(id,organization_id,sku,name,price_cents,available,product_id) VALUES($1,$2,$3,$3,100,100,$4)",
    [id, fixtures.alpha, `BENCH-${i}`, fixtures.variant],
  );
const principal = {
  id: fixtures.operator,
  organizationId: fixtures.alpha,
  role: "operator" as const,
};
async function baseline() {
  const rows = [];
  for (const id of ids)
    rows.push(
      (
        await pool.query(
          "SELECT * FROM variants WHERE organization_id=$1 AND id=$2",
          [fixtures.alpha, id],
        )
      ).rows[0],
    );
  return rows;
}
async function batched() {
  const loader = createVariantLoader(principal);
  return Promise.all(ids.map((id) => loader.load(id)));
}
const raw: {
  strategy: string;
  elapsedMs: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  rssBytes: number;
  queries: number;
}[] = [];
try {
  for (let i = 0; i < 5; i++) {
    await baseline();
    await batched();
  }
  for (let i = 0; i < 40; i++) {
    const ordered =
      i % 2
        ? ([
            ["batched", batched],
            ["baseline", baseline],
          ] as const)
        : ([
            ["baseline", baseline],
            ["batched", batched],
          ] as const);
    for (const [strategy, run] of ordered) {
      const cpu = process.cpuUsage();
      const start = performance.now();
      const rows = await run();
      const elapsedMs = performance.now() - start;
      assert.deepEqual(
        rows.map((row) => row?.id),
        ids,
      );
      const used = process.cpuUsage(cpu);
      raw.push({
        strategy,
        elapsedMs,
        cpuUserMicros: used.user,
        cpuSystemMicros: used.system,
        rssBytes: process.memoryUsage().rss,
        queries: strategy === "batched" ? 1 : 50,
      });
    }
  }
  const summary = Object.fromEntries(
    ["baseline", "batched"].map((strategy) => {
      const values = raw
        .filter((r) => r.strategy === strategy)
        .map((r) => r.elapsedMs)
        .sort((a, b) => a - b);
      return [
        strategy,
        {
          samples: values.length,
          p50: values[19],
          p95: values[37],
          p99: values[39],
          operationsPerSecond:
            1000 / (values.reduce((a, b) => a + b, 0) / values.length),
          errors: 0,
        },
      ];
    }),
  );
  const plan = (
    await pool.query(
      "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM variants WHERE organization_id=$1 AND id=ANY($2::uuid[])",
      [fixtures.alpha, ids],
    )
  ).rows;
  await mkdir(".tmp/reports", { recursive: true });
  await writeFile(
    ".tmp/reports/query-benchmark.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        dirty: !!execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim(),
        node: process.version,
        platform: os.platform(),
        cpu: os.cpus()[0].model,
        postgres: (await pool.query("SHOW server_version")).rows[0]
          .server_version,
        dataset: {
          variants: 50,
          requests: 40,
          warmups: 5,
          order: "alternating",
          concurrency: 1,
        },
        summary,
        raw,
        plan,
        limitations:
          "Repository-query microbenchmark. Node CPU/RSS only; PostgreSQL/OS resource sampling and end-to-end GraphQL HTTP load remain pending. Both strategies enforce the same tenant predicate and return the same ordered IDs.",
      },
      null,
      2,
    ),
  );
  console.info(JSON.stringify(summary));
} finally {
  await pool.end();
}
