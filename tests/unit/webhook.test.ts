import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signWebhook,
  verifyWebhook,
  paymentEvent,
} from "../../src/server/payments";
test("webhook signatures bind exact bytes and are time-bounded", () => {
  const now = 1800000000000;
  const time = String(now);
  const secret = "synthetic-only";
  const body = '{"value":1}';
  const signature = signWebhook(body, time, secret);
  assert.equal(verifyWebhook(body, time, signature, secret, now), true);
  for (const [text, timestamp, sig, key] of [
    [body + " ", time, signature, secret],
    [body, String(now - 300001), signature, secret],
    [body, time, "0", secret],
    [body, time, signature, "other"],
  ])
    assert.equal(verifyWebhook(text, timestamp, sig, key, now), false);
});
test("provider event version and schema are validated", () => {
  assert.equal(paymentEvent.safeParse({ schemaVersion: 2 }).success, false);
  assert.equal(
    paymentEvent.safeParse({ schemaVersion: 1, version: 0 }).success,
    false,
  );
});
