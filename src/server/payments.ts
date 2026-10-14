import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { DomainError, type Principal } from "../domain/reservations";
import { pool, transaction } from "./db";
import { applyTransition, type OrderRecord } from "./lifecycle";
export const paymentEvent = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.uuid(),
    organizationId: z.uuid(),
    orderId: z.uuid(),
    version: z.number().int().positive(),
    outcome: z.enum(["pending", "succeeded", "failed"]),
  })
  .strict();
export function signWebhook(body: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}
export function verifyWebhook(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 300000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(signWebhook(body, timestamp, secret), "hex"),
  );
}
export async function receivePayment(raw: unknown, client?: PoolClient) {
  const parsed = paymentEvent.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const event = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  return transaction(async (client) => {
    // Always lock order before payment so transition, timeout and webhook paths agree.
    const order = (
      await client.query(
        "SELECT * FROM orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        [event.organizationId, event.orderId],
      )
    ).rows[0] as OrderRecord | undefined;
    if (!order) throw new DomainError("NOT_FOUND");
    const inserted = await client.query(
      `INSERT INTO payment_inbox(provider_event_id,payload_hash,organization_id,order_id,provider_version,outcome)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING provider_event_id`,
      [
        event.eventId,
        hash,
        event.organizationId,
        event.orderId,
        event.version,
        event.outcome,
      ],
    );
    if (!inserted.rowCount) {
      const previous = (
        await client.query(
          "SELECT payload_hash FROM payment_inbox WHERE provider_event_id=$1",
          [event.eventId],
        )
      ).rows[0];
      if (previous.payload_hash !== hash)
        throw new DomainError("EVENT_CONFLICT");
      return "duplicate";
    }
    await client.query(
      "INSERT INTO payments(order_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [order.id, order.organization_id],
    );
    const payment = (
      await client.query("SELECT * FROM payments WHERE order_id=$1", [order.id])
    ).rows[0];
    if (event.version <= payment.provider_version) return "stale";
    if (
      ["succeeded", "failed"].includes(payment.outcome) &&
      event.outcome !== payment.outcome
    ) {
      await client.query(
        "INSERT INTO operational_exceptions(id,organization_id,order_id,reason) VALUES($1,$2,$3,'provider_state_conflict') ON CONFLICT DO NOTHING",
        [randomUUID(), order.organization_id, order.id],
      );
      return "conflict";
    }
    await client.query(
      "UPDATE payments SET outcome=$2,provider_version=$3,updated_at=now() WHERE order_id=$1",
      [order.id, event.outcome, event.version],
    );
    if (event.outcome === "succeeded") {
      const now = (await client.query("SELECT clock_timestamp() AS now"))
        .rows[0].now;
      if (order.status === "reserved" && order.expires_at <= now) {
        await applyTransition(client, order, "expired", null, "payment");
        order.status = "expired";
      }
      if (order.status === "reserved")
        await applyTransition(client, order, "confirmed", null, "payment");
      else if (order.status !== "confirmed")
        await client.query(
          "INSERT INTO operational_exceptions(id,organization_id,order_id,reason) VALUES($1,$2,$3,'payment_after_release') ON CONFLICT DO NOTHING",
          [randomUUID(), order.organization_id, order.id],
        );
    }
    return "applied";
  }, client);
}
export async function exceptions(principal: Principal | null) {
  if (!principal) throw new DomainError("UNAUTHENTICATED");
  return (
    await pool.query(
      "SELECT id,order_id,reason FROM operational_exceptions WHERE organization_id=$1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 50",
      [principal.organizationId],
    )
  ).rows;
}
