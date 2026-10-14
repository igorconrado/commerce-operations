import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import {
  DomainError,
  requireOperator,
  type Principal,
} from "../domain/reservations";
import { transaction, pool } from "./db";
const transitionInput = z
  .object({
    orderId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    action: z.enum(["confirm", "cancel"]),
  })
  .strict();
export type OrderRecord = {
  id: string;
  organization_id: string;
  variant_id: string;
  quantity: number;
  status: string;
  version: number;
  expires_at: Date;
};
export async function applyTransition(
  client: PoolClient,
  order: OrderRecord,
  status: "confirmed" | "cancelled" | "expired",
  actorId: string | null,
  source: "user" | "system" | "payment",
) {
  if (order.status !== "reserved") throw new DomainError("INVALID_TRANSITION");
  const { rows } = await client.query(
    "UPDATE orders SET status=$2,version=version+1 WHERE id=$1 RETURNING *",
    [order.id, status],
  );
  if (status !== "confirmed") {
    await client.query(
      "UPDATE variants SET available=available+$3,version=version+1 WHERE organization_id=$1 AND id=$2",
      [order.organization_id, order.variant_id, order.quantity],
    );
    await client.query(
      "INSERT INTO stock_movements(id,organization_id,order_id,delta,kind) VALUES($1,$2,$3,$4,'release')",
      [randomUUID(), order.organization_id, order.id, order.quantity],
    );
  }
  await client.query(
    "INSERT INTO audit_log(id,organization_id,actor_id,action,entity_id,source) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      order.organization_id,
      actorId,
      `order.${status}`,
      order.id,
      source,
    ],
  );
  await client.query(
    "INSERT INTO outbox(id,organization_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      order.organization_id,
      order.id,
      rows[0].version,
      `order.${status}`,
      JSON.stringify({ orderId: order.id, status }),
    ],
  );
  return rows[0];
}
export async function transition(principal: Principal | null, raw: unknown) {
  requireOperator(principal);
  const parsed = transitionInput.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const { orderId, expectedVersion, action } = parsed.data;
  return transaction(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [principal.organizationId, orderId],
    );
    const order = rows[0] as OrderRecord | undefined;
    if (!order) throw new DomainError("NOT_FOUND");
    if (order.version !== expectedVersion)
      throw new DomainError("VERSION_CONFLICT");
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0]
      .now;
    if (action === "confirm" && order.expires_at <= now)
      throw new DomainError("RESERVATION_EXPIRED");
    return applyTransition(
      client,
      order,
      action === "confirm" ? "confirmed" : "cancelled",
      principal.id,
      "user",
    );
  });
}
export async function expireOrder(orderId: string) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [orderId],
    );
    const order = rows[0] as OrderRecord | undefined;
    if (!order || order.status !== "reserved") return false;
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0]
      .now;
    if (order.expires_at > now) return false;
    await applyTransition(client, order, "expired", null, "system");
    return true;
  });
}
export async function expireDue() {
  const { rows } = await pool.query(
    "SELECT id FROM orders WHERE status='reserved' AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT 100",
  );
  for (const row of rows) await expireOrder(row.id);
  return rows.length;
}
