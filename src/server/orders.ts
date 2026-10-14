import { randomUUID } from "node:crypto";
import {
  DomainError,
  fingerprint,
  pageInput,
  reservationInput,
  requireOperator,
  type Principal,
} from "../domain/reservations";
import { pool, transaction } from "./db";
export async function reserve(principal: Principal | null, raw: unknown) {
  requireOperator(principal);
  const input = reservationInput.safeParse(raw);
  if (!input.success) throw new DomainError("INVALID_INPUT");
  const { variantId, quantity, key } = input.data;
  const hash = fingerprint(principal.id, variantId, quantity);
  return transaction(async (client) => {
    // Collisions only serialize unrelated commands; uniqueness remains enforced in SQL.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${principal.organizationId}:${key}`,
    ]);
    const previous = await client.query(
      "SELECT * FROM idempotency WHERE organization_id=$1 AND key=$2",
      [principal.organizationId, key],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].payload_hash !== hash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      const result = await client.query(
        "SELECT * FROM orders WHERE organization_id=$1 AND id=$2",
        [principal.organizationId, previous.rows[0].order_id],
      );
      return result.rows[0];
    }
    const stock = await client.query(
      `UPDATE variants SET available=available-$3,version=version+1
      WHERE organization_id=$1 AND id=$2 AND available >= $3 RETURNING *`,
      [principal.organizationId, variantId, quantity],
    );
    if (!stock.rows[0]) throw new DomainError("STOCK_UNAVAILABLE");
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO orders(id,organization_id,actor_id,variant_id,quantity,unit_price_cents,status)
      VALUES($1,$2,$3,$4,$5,$6,'reserved') RETURNING *`,
      [
        id,
        principal.organizationId,
        principal.id,
        variantId,
        quantity,
        stock.rows[0].price_cents,
      ],
    );
    await client.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
      principal.organizationId,
      key,
      hash,
      id,
    ]);
    await client.query(
      "INSERT INTO stock_movements(id,organization_id,order_id,delta,kind) VALUES($1,$2,$3,$4,'reservation')",
      [randomUUID(), principal.organizationId, id, -quantity],
    );
    await client.query(
      `INSERT INTO outbox(id,organization_id,aggregate_id,aggregate_version,type,payload)
      VALUES($1,$2,$3,1,'order.reserved',$4)`,
      [
        randomUUID(),
        principal.organizationId,
        id,
        JSON.stringify({ orderId: id, quantity }),
      ],
    );
    await client.query(
      "INSERT INTO audit_log(id,organization_id,actor_id,action,entity_id) VALUES($1,$2,$3,'order.reserve',$4)",
      [randomUUID(), principal.organizationId, principal.id, id],
    );
    return rows[0];
  });
}
export async function listOrders(principal: Principal | null, raw: unknown) {
  if (!principal) throw new DomainError("UNAUTHENTICATED");
  const parsed = pageInput.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const { first, after } = parsed.data;
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE organization_id=$1
    AND ($2::uuid IS NULL OR (created_at,id) < (SELECT created_at,id FROM orders WHERE organization_id=$1 AND id=$2))
    ORDER BY created_at DESC,id DESC LIMIT $3`,
    [principal.organizationId, after ?? null, first + 1],
  );
  return {
    nodes: rows.slice(0, first),
    hasNextPage: rows.length > first,
    endCursor: rows.slice(0, first).at(-1)?.id ?? null,
  };
}
export async function catalog(principal: Principal | null) {
  if (!principal) throw new DomainError("UNAUTHENTICATED");
  return (
    await pool.query(
      "SELECT * FROM variants WHERE organization_id=$1 ORDER BY sku LIMIT 50",
      [principal.organizationId],
    )
  ).rows;
}
