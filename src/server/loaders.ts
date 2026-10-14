import DataLoader from "dataloader";
import { pool } from "./db";
import { DomainError, type Principal } from "../domain/reservations";
export type VariantRecord = {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  price_cents: number;
  available: number;
  version: number;
};
export function createVariantLoader(
  principal: Principal | null,
  onQuery?: () => void,
) {
  return new DataLoader<string, VariantRecord | null>(async (ids) => {
    if (!principal) throw new DomainError("UNAUTHENTICATED");
    onQuery?.();
    const { rows } = await pool.query<VariantRecord>(
      "SELECT * FROM variants WHERE organization_id=$1 AND id=ANY($2::uuid[])",
      [principal.organizationId, ids],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id) ?? null);
  });
}
