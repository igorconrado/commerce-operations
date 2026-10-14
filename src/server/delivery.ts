import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db";
import { paymentEvent, receivePayment } from "./payments";
import type { PaymentGateway, Charge } from "./payment-gateway";
import {
  DomainError,
  requireOperator,
  type Principal,
} from "../domain/reservations";
import { z } from "zod";
type Prepared = { charge: Charge; reconcile: boolean };
export async function deliver(
  outboxId: string,
  gateway: PaymentGateway,
  afterExternalEffect?: () => void,
) {
  // Session lock survives intermediate transactions, and is released by PostgreSQL on crash.
  const lock = await pool.connect();
  try {
    const acquired = (
      await lock.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,1)) AS acquired",
        [outboxId],
      )
    ).rows[0].acquired;
    if (!acquired) return;
    const event = (
      await pool.query(
        "SELECT * FROM outbox WHERE id=$1 AND processed_at IS NULL",
        [outboxId],
      )
    ).rows[0];
    if (!event) return;
    if (event.type !== "order.reserved") {
      await pool.query("UPDATE outbox SET processed_at=now() WHERE id=$1", [
        outboxId,
      ]);
      return;
    }
    const prepared = await transaction(async (client) => {
      const order = (
        await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          event.aggregate_id,
        ])
      ).rows[0];
      const previous = (
        await client.query("SELECT * FROM payment_commands WHERE order_id=$1", [
          order.id,
        ])
      ).rows[0];
      if (previous?.status === "settled") return null;
      if (!previous && order.status !== "reserved") return null;
      const now = (await client.query("SELECT clock_timestamp() AS now"))
        .rows[0].now;
      if (!previous && order.expires_at <= now) return null;
      const key = previous?.command_key ?? randomUUID();
      await client.query(
        "INSERT INTO payment_commands(order_id,organization_id,command_key,status) VALUES($1,$2,$3,'unknown') ON CONFLICT(order_id) DO UPDATE SET status='unknown'",
        [order.id, order.organization_id, key],
      );
      return {
        charge: {
          key,
          orderId: order.id,
          organizationId: order.organization_id,
          amountCents: order.quantity * order.unit_price_cents,
        },
        reconcile: !!previous,
      } satisfies Prepared;
    });
    if (!prepared) {
      await pool.query("UPDATE outbox SET processed_at=now() WHERE id=$1", [
        outboxId,
      ]);
      return;
    }
    try {
      let result = prepared.reconcile
        ? await gateway.lookup(prepared.charge.key)
        : null;
      // Authoritative not-found permits an idempotent retry using the original key.
      if (!result) {
        const eligible = (
          await pool.query(
            "SELECT id FROM orders WHERE id=$1 AND status='reserved' AND expires_at>clock_timestamp()",
            [prepared.charge.orderId],
          )
        ).rowCount;
        if (!eligible) {
          await transaction(async (client) => {
            await client.query(
              "UPDATE payment_commands SET status='settled' WHERE order_id=$1",
              [prepared.charge.orderId],
            );
            await client.query(
              "UPDATE outbox SET processed_at=now() WHERE id=$1",
              [outboxId],
            );
          });
          return;
        }
        result = await gateway.charge(prepared.charge);
      }
      afterExternalEffect?.();
      const response = paymentEvent.parse(result);
      if (
        response.orderId !== prepared.charge.orderId ||
        response.organizationId !== prepared.charge.organizationId
      )
        throw new Error("PROVIDER_RESPONSE_MISMATCH");
      await receivePayment(response);
      await transaction(async (client) => {
        await client.query(
          "UPDATE payment_commands SET status='settled' WHERE order_id=$1",
          [prepared.charge.orderId],
        );
        await client.query(
          "UPDATE outbox SET processed_at=now(),last_error=NULL WHERE id=$1",
          [outboxId],
        );
      });
    } catch (error) {
      await pool.query(
        "UPDATE outbox SET attempts=attempts+1,last_error='PROVIDER_RESULT_UNCERTAIN',available_at=now()+interval '5 seconds' WHERE id=$1",
        [outboxId],
      );
      throw error;
    }
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,1))", [
      outboxId,
    ]);
    lock.release();
  }
}
export async function pendingDeliveries() {
  return (
    await pool.query(
      "SELECT id FROM outbox WHERE processed_at IS NULL AND attempts<5 AND available_at<=now() ORDER BY created_at LIMIT 100",
    )
  ).rows;
}
export async function failedDeliveries(principal: Principal | null) {
  if (!principal) throw new DomainError("UNAUTHENTICATED");
  return (
    await pool.query(
      "SELECT id,aggregate_id,attempts,last_error FROM outbox WHERE organization_id=$1 AND processed_at IS NULL AND attempts>=5 ORDER BY created_at LIMIT 50",
      [principal.organizationId],
    )
  ).rows;
}
export async function replay(principal: Principal | null, id: string) {
  requireOperator(principal);
  if (!z.uuid().safeParse(id).success) throw new DomainError("INVALID_INPUT");
  return transaction(async (client) => {
    const result = await client.query(
      "UPDATE outbox SET attempts=0,available_at=now() WHERE id=$1 AND organization_id=$2 AND processed_at IS NULL AND attempts>=5 RETURNING id",
      [id, principal.organizationId],
    );
    if (!result.rowCount) throw new DomainError("NOT_FOUND");
    await client.query(
      "INSERT INTO audit_log(id,organization_id,actor_id,action,entity_id) VALUES($1,$2,$3,'outbox.replay',$4)",
      [randomUUID(), principal.organizationId, principal.id, id],
    );
    return true;
  });
}
