import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/server/db";
import { migrate } from "../../scripts/migrate";
import { seed, fixtures } from "../../scripts/seed";
import { reserve, catalog } from "../../src/server/orders";
import { transition, expireOrder } from "../../src/server/lifecycle";
import {
  receivePayment,
  exceptions,
  signWebhook,
} from "../../src/server/payments";
import { POST as webhook } from "../../src/app/api/payments/webhook/route";
const operator = {
  id: fixtures.operator,
  organizationId: fixtures.alpha,
  role: "operator" as const,
};
async function order() {
  return reserve(operator, {
    variantId: fixtures.variant,
    quantity: 2,
    key: randomUUID(),
  });
}
function event(orderId: string) {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    organizationId: fixtures.alpha,
    orderId,
    version: 1,
    outcome: "succeeded",
  };
}
before(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test"))
    throw new Error("Use a disposable _test database");
  process.env.SEED_PASSWORD = "Synthetic-Test-Password";
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE organizations CASCADE");
  await seed();
});
after(() => pool.end());
test("two concurrent decisions accept only one version and release stock at most once", async () => {
  const item = await order();
  const result = await Promise.allSettled(
    ["cancel", "confirm"].map((action) =>
      transition(operator, { orderId: item.id, expectedVersion: 1, action }),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const stored = (
    await pool.query("SELECT * FROM orders WHERE id=$1", [item.id])
  ).rows[0];
  assert.equal(stored.version, 2);
  assert.equal(
    (await catalog(operator))[0].available,
    stored.status === "cancelled" ? 10 : 8,
  );
  await assert.rejects(
    transition(operator, {
      orderId: item.id,
      expectedVersion: 1,
      action: "cancel",
    }),
    /VERSION_CONFLICT/,
  );
});
test("confirmation versus expiration checks the database clock under the row lock", async () => {
  const item = await order();
  await pool.query(
    "UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1",
    [item.id],
  );
  const results = await Promise.allSettled([
    transition(operator, {
      orderId: item.id,
      expectedVersion: 1,
      action: "confirm",
    }),
    expireOrder(item.id),
    expireOrder(item.id),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(
    results.filter((r) => r.status === "fulfilled" && r.value === true).length,
    1,
  );
  assert.equal((await catalog(operator))[0].available, 10);
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [item.id]))
      .rows[0].status,
    "expired",
  );
});
test("duplicate and late provider events do not duplicate or regress effects", async () => {
  const item = await order();
  const paid = { ...event(item.id), version: 2 };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => receivePayment(paid)),
  );
  assert.equal(results.filter((r) => r === "applied").length, 1);
  assert.equal(
    await receivePayment({
      ...paid,
      eventId: randomUUID(),
      version: 1,
      outcome: "pending",
    }),
    "stale",
  );
  assert.equal(
    (
      await pool.query("SELECT status,version FROM orders WHERE id=$1", [
        item.id,
      ])
    ).rows[0].status,
    "confirmed",
  );
  assert.equal((await catalog(operator))[0].available, 8);
  await assert.rejects(
    receivePayment({ ...paid, outcome: "failed" }),
    /EVENT_CONFLICT/,
  );
  assert.equal(
    await receivePayment({
      ...paid,
      eventId: randomUUID(),
      version: 3,
      outcome: "pending",
    }),
    "conflict",
  );
  assert.equal(
    (await exceptions(operator))[0].reason,
    "provider_state_conflict",
  );
});
test("payment after expiry creates an explicit exception and never consumes released stock", async () => {
  const item = await order();
  await pool.query(
    "UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1",
    [item.id],
  );
  await receivePayment(event(item.id));
  assert.equal((await catalog(operator))[0].available, 10);
  assert.equal((await exceptions(operator))[0].reason, "payment_after_release");
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [item.id]))
      .rows[0].status,
    "expired",
  );
});
test("tenant and viewer cannot transition orders or read another organization exceptions", async () => {
  const item = await order();
  await assert.rejects(
    transition(
      { ...operator, organizationId: fixtures.beta, id: fixtures.other },
      { orderId: item.id, expectedVersion: 1, action: "cancel" },
    ),
    /NOT_FOUND/,
  );
  await assert.rejects(
    transition(
      { ...operator, role: "viewer" },
      { orderId: item.id, expectedVersion: 1, action: "confirm" },
    ),
    /FORBIDDEN/,
  );
  await assert.rejects(
    receivePayment({ ...event(item.id), organizationId: fixtures.beta }),
    /NOT_FOUND/,
  );
});
test("webhooks require a valid body-bound signature and a fresh timestamp", async () => {
  const item = await order();
  const body = JSON.stringify(event(item.id));
  const timestamp = String(Date.now());
  const secret = "synthetic-webhook-signing-secret-123456789";
  process.env.PAYMENT_WEBHOOK_SECRET = secret;
  const send = (text: string, time: string, signature: string) =>
    webhook(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        body: text,
        headers: {
          "x-payment-timestamp": time,
          "x-payment-signature": signature,
        },
      }),
    );
  const signature = signWebhook(body, timestamp, secret);
  assert.equal((await send(body, timestamp, signature)).status, 200);
  assert.equal((await send(body + " ", timestamp, signature)).status, 401);
  const old = String(Date.now() - 600000);
  assert.equal(
    (await send(body, old, signWebhook(body, old, secret))).status,
    401,
  );
  assert.equal((await send(body, timestamp, "wrong")).status, 401);
});
