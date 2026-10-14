import { authenticate } from "../../../server/identity";
import { pool } from "../../../server/db";
export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal || principal.role !== "operator")
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  const result = await pool.query(
    `SELECT
    (SELECT count(*)::int FROM orders WHERE organization_id=$1) AS orders,
    (SELECT count(*)::int FROM outbox WHERE organization_id=$1 AND processed_at IS NULL) AS pending_events,
    (SELECT count(*)::int FROM outbox WHERE organization_id=$1 AND processed_at IS NULL AND attempts>=5) AS failed_events,
    (SELECT count(*)::int FROM payment_commands WHERE organization_id=$1 AND status='unknown') AS uncertain_payments,
    (SELECT count(*)::int FROM operational_exceptions WHERE organization_id=$1 AND resolved_at IS NULL) AS open_exceptions`,
    [principal.organizationId],
  );
  return Response.json(result.rows[0], {
    headers: { "cache-control": "no-store" },
  });
}
