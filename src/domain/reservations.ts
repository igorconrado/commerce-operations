import { createHash } from "node:crypto";
import { z } from "zod";
export class DomainError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const reservationInput = z
  .object({
    customerId: z.uuid().optional(),
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(100),
    key: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
  })
  .strict();
export type Principal = {
  id: string;
  organizationId: string;
  role: "operator" | "viewer";
};
export function requireOperator(
  principal: Principal | null,
): asserts principal is Principal {
  if (!principal) throw new DomainError("UNAUTHENTICATED");
  if (principal.role !== "operator") throw new DomainError("FORBIDDEN");
}
export function fingerprint(
  actorId: string,
  variantId: string,
  quantity: number,
  customerId?: string,
) {
  return createHash("sha256")
    .update(JSON.stringify({ actorId, variantId, quantity, customerId }))
    .digest("hex");
}
export const pageInput = z.object({
  first: z.number().int().min(1).max(50).default(20),
  after: z.uuid().nullable().optional(),
});
