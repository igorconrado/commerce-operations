import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fingerprint,
  reservationInput,
  requireOperator,
  pageInput,
} from "../../src/domain/reservations";
import { hashPassword, verifyPassword } from "../../src/server/identity";
const valid = {
  variantId: "30000000-0000-4000-8000-000000000001",
  quantity: 1,
  key: "test-key-001",
};
test("reservation rejects invalid quantities, IDs and caller-supplied tenant", () => {
  for (const quantity of [0, -1, 1.5, 101, NaN])
    assert.equal(
      reservationInput.safeParse({ ...valid, quantity }).success,
      false,
    );
  assert.equal(
    reservationInput.safeParse({ ...valid, organizationId: "tenant" }).success,
    false,
  );
  assert.equal(
    reservationInput.safeParse({ ...valid, variantId: "no" }).success,
    false,
  );
  assert.equal(reservationInput.safeParse(valid).success, true);
});
test("fingerprint is stable and binds actor, variant and quantity", () => {
  const base = fingerprint("actor", valid.variantId, 1);
  assert.equal(base, fingerprint("actor", valid.variantId, 1));
  assert.notEqual(base, fingerprint("other", valid.variantId, 1));
  assert.notEqual(base, fingerprint("actor", valid.variantId, 2));
  assert.notEqual(
    base,
    fingerprint("actor", valid.variantId, 1, "another-customer"),
  );
});
test("only authenticated operators can mutate", () => {
  assert.throws(() => requireOperator(null), /UNAUTHENTICATED/);
  assert.throws(
    () => requireOperator({ id: "u", organizationId: "o", role: "viewer" }),
    /FORBIDDEN/,
  );
});
test("pagination rejects unbounded reads", () => {
  assert.equal(pageInput.safeParse({ first: 51 }).success, false);
  assert.equal(pageInput.safeParse({ first: 0 }).success, false);
});
test("salted passwords verify without accepting a different password", () => {
  const hash = hashPassword("synthetic-password");
  assert.equal(verifyPassword("synthetic-password", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.notEqual(hash, hashPassword("synthetic-password"));
});
