import { randomUUID } from "node:crypto";
import { pool } from "../src/server/db";
import { fixtures } from "./seed";
import { reserve } from "../src/server/orders";
import { deliver } from "../src/server/delivery";
if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test"))
  throw new Error("Only disposable test database");
try {
  await pool.query("UPDATE variants SET available=available+1 WHERE id=$1", [
    fixtures.variant,
  ]);
  const order = await reserve(
    { id: fixtures.operator, organizationId: fixtures.alpha, role: "operator" },
    { variantId: fixtures.variant, quantity: 1, key: randomUUID() },
  );
  const event = (
    await pool.query(
      "SELECT id FROM outbox WHERE aggregate_id=$1 AND type='order.reserved'",
      [order.id],
    )
  ).rows[0];
  await deliver(event.id, {
    lookup: async () => null,
    charge: async () => ({
      schemaVersion: 1,
      eventId: randomUUID(),
      organizationId: fixtures.alpha,
      orderId: order.id,
      version: 1,
      outcome: "succeeded",
    }),
  });
  console.info(
    "Prepared nonempty payment command and inbox for restore verification",
  );
} finally {
  await pool.end();
}
