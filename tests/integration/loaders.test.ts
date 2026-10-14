import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/server/db";
import { migrate } from "../../scripts/migrate";
import { seed, fixtures } from "../../scripts/seed";
import { createVariantLoader } from "../../src/server/loaders";
const principal = {
  id: fixtures.operator,
  organizationId: fixtures.alpha,
  role: "operator" as const,
};
before(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test"))
    throw new Error("Use _test database");
  process.env.SEED_PASSWORD = "Synthetic-Test-Password";
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE organizations CASCADE");
  await seed();
});
after(() => pool.end());
test("request loader batches related rows and never reuses data across organizations", async () => {
  let queries = 0;
  const loader = createVariantLoader(principal, () => queries++);
  const rows = await Promise.all(
    Array.from({ length: 50 }, () => loader.load(fixtures.variant)),
  );
  assert.equal(queries, 1);
  assert.equal(rows[0]?.sku, "LMP-01");
  const other = createVariantLoader({
    ...principal,
    id: fixtures.other,
    organizationId: fixtures.beta,
  });
  assert.equal(await other.load(fixtures.variant), null);
});
test("a new request observes changed catalog instead of a global cache", async () => {
  const first = createVariantLoader(principal);
  assert.equal((await first.load(fixtures.variant))?.price_cents, 18900);
  await pool.query("UPDATE variants SET price_cents=20000 WHERE id=$1", [
    fixtures.variant,
  ]);
  assert.equal(
    (await createVariantLoader(principal).load(fixtures.variant))?.price_cents,
    20000,
  );
});
