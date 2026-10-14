import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pool } from "../../src/server/db";
import { migrate } from "../../scripts/migrate";
import { seed, fixtures } from "../../scripts/seed";
import { reserve, catalog, listOrders } from "../../src/server/orders";
import { graphqlRequest } from "../../src/server/graphql";
import {
  POST as login,
  DELETE as logout,
} from "../../src/app/api/session/route";
const operator = {
  id: fixtures.operator,
  organizationId: fixtures.alpha,
  role: "operator" as const,
};
const origin = "http://127.0.0.1:3100";
const input = {
  variantId: fixtures.variant,
  quantity: 1,
  key: "test-key-0001",
};
before(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!url.pathname.endsWith("_test"))
    throw new Error(
      "Integration tests require a disposable database ending in _test",
    );
  process.env.SEED_PASSWORD = "Synthetic-Test-Password";
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE organizations CASCADE");
  await pool.query("TRUNCATE login_budgets");
  await seed();
});
after(() => pool.end());
test("100 concurrent reservations against 10 units commit exactly 10 complete effects", async () => {
  const started = performance.now();
  const durations: number[] = [];
  const results = await Promise.allSettled(
    Array.from({ length: 100 }, async (_, i) => {
      const start = performance.now();
      try {
        return await reserve(operator, { ...input, key: `concurrency-${i}` });
      } finally {
        durations.push(performance.now() - start);
      }
    }),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
  assert.equal(
    results.filter(
      (r) => r.status === "rejected" && r.reason.code === "STOCK_UNAVAILABLE",
    ).length,
    90,
  );
  assert.equal((await catalog(operator))[0].available, 0);
  for (const table of [
    "orders",
    "outbox",
    "stock_movements",
    "audit_log",
    "idempotency",
  ])
    assert.equal(
      Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
      10,
    );
  const sorted = [...durations].sort((a, b) => a - b);
  await mkdir(".tmp/reports", { recursive: true });
  let commit = "uncommitted";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Before the first commit, the report explicitly retains "uncommitted".
  }
  await writeFile(
    ".tmp/reports/concurrency.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        commit,
        dirty:
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim().length > 0,
        node: process.version,
        platform: os.platform(),
        cpu: os.cpus()[0].model,
        postgres: (await pool.query("SHOW server_version")).rows[0]
          .server_version,
        requests: 100,
        accepted: 10,
        expectedStockRejections: 90,
        elapsedMs: performance.now() - started,
        p50: sorted[49],
        p95: sorted[94],
        p99: sorted[98],
        durations,
      },
      null,
      2,
    ),
  );
});
test("concurrent identical keys produce one order; changed payload conflicts", async () => {
  const orders = await Promise.all(
    Array.from({ length: 20 }, () => reserve(operator, input)),
  );
  assert.equal(new Set(orders.map((o) => o.id)).size, 1);
  assert.equal((await catalog(operator))[0].available, 9);
  await assert.rejects(
    reserve(operator, { ...input, quantity: 2 }),
    /IDEMPOTENCY_CONFLICT/,
  );
});
test("organization and role checks prevent cross-tenant reads and effects", async () => {
  const other = {
    id: fixtures.other,
    organizationId: fixtures.beta,
    role: "operator" as const,
  };
  await assert.rejects(reserve(other, input), /STOCK_UNAVAILABLE/);
  await assert.rejects(
    reserve({ ...operator, role: "viewer" }, input),
    /FORBIDDEN/,
  );
  await assert.rejects(reserve(null, input), /UNAUTHENTICATED/);
  const order = await reserve(operator, input);
  assert.equal((await listOrders(other, { first: 20 })).nodes.length, 0);
  assert.equal(
    (await listOrders(other, { first: 20, after: order.id })).nodes.length,
    0,
  );
});
test("failure after stock decrement rolls back stock, order, key, audit and event", async () => {
  await pool.query(
    "CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$",
  );
  await pool.query(
    "CREATE TRIGGER test_failure BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox()",
  );
  try {
    await assert.rejects(reserve(operator, input), /injected failure/);
    assert.equal((await catalog(operator))[0].available, 10);
    for (const table of [
      "orders",
      "outbox",
      "stock_movements",
      "audit_log",
      "idempotency",
    ])
      assert.equal(
        Number(
          (await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        ),
        0,
      );
  } finally {
    await pool.query("DROP TRIGGER test_failure ON outbox");
    await pool.query("DROP FUNCTION fail_outbox()");
  }
  await reserve(operator, input);
  assert.equal((await catalog(operator))[0].available, 9);
});
test("historical prices survive catalog edits; pagination remains bounded", async () => {
  const first = await reserve(operator, input);
  await pool.query("UPDATE variants SET price_cents=25000 WHERE id=$1", [
    fixtures.variant,
  ]);
  const second = await reserve(operator, { ...input, key: "test-key-0002" });
  assert.equal(first.unit_price_cents, 18900);
  assert.equal(second.unit_price_cents, 25000);
  const page = await listOrders(operator, { first: 1 });
  assert.equal(page.hasNextPage, true);
  assert.equal(
    (await listOrders(operator, { first: 1, after: page.endCursor })).nodes
      .length,
    1,
  );
});
async function request(query: string, cookie = "") {
  return graphqlRequest(
    new Request(`${origin}/api/graphql`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie },
      body: JSON.stringify({ query }),
    }),
  );
}
test("HTTP session, GraphQL mutation, logout and CSRF boundaries use real PostgreSQL", async () => {
  const unauth = await (await request("{catalog{id}}")).json();
  assert.equal(unauth.errors[0].extensions.code, "UNAUTHENTICATED");
  const response = await login(
    new Request(`${origin}/api/session`, {
      method: "POST",
      headers: { origin },
      body: JSON.stringify({
        email: "operator@aurora.test",
        password: process.env.SEED_PASSWORD,
      }),
    }),
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  const result = await (
    await request(
      `mutation{reserve(input:{variantId:"${fixtures.variant}",quantity:1,key:"http-key-001"}){id status}}`,
      cookie,
    )
  ).json();
  assert.equal(result.data.reserve.status, "reserved");
  const attack = await graphqlRequest(
    new Request(`${origin}/api/graphql`, {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        "content-type": "application/json",
        cookie,
      },
      body: "{}",
    }),
  );
  assert.equal(attack.status, 403);
  await logout(
    new Request(`${origin}/api/session`, {
      method: "DELETE",
      headers: { origin, cookie },
    }),
  );
  assert.equal(
    (await (await request("{catalog{id}}", cookie)).json()).errors[0].extensions
      .code,
    "UNAUTHENTICATED",
  );
});
