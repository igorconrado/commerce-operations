import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/server/db";
import { migrate } from "../../scripts/migrate";
import { fixtures, seed } from "../../scripts/seed";
import { reserve, catalog } from "../../src/server/orders";
import { deliver, pendingDeliveries, replay } from "../../src/server/delivery";
import {
  HttpPaymentGateway,
  type PaymentGateway,
} from "../../src/server/payment-gateway";
import { createQueue, dispatch, createWorker } from "../../src/server/queue";
import { transition } from "../../src/server/lifecycle";
const principal = {
  id: fixtures.operator,
  organizationId: fixtures.alpha,
  role: "operator" as const,
};
const secret = "synthetic-simulator-secret-123456789";
const base = "http://127.0.0.1:3111";
const gateway = new HttpPaymentGateway(base, secret);
let simulator: ChildProcess;
before(async () => {
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test"))
    throw new Error("Use disposable _test database");
  process.env.SEED_PASSWORD = "Synthetic-Test-Password";
  await migrate();
  simulator = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/payment-simulator.ts"],
    {
      env: { ...process.env, SIMULATOR_PORT: "3111", SIMULATOR_SECRET: secret },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Simulator startup timeout")),
      15000,
    );
    simulator.stdout?.once("data", () => {
      clearTimeout(timeout);
      resolve();
    });
    simulator.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Simulator exited"));
    });
  });
});
beforeEach(async () => {
  await pool.query("TRUNCATE organizations CASCADE");
  await pool.query("TRUNCATE payment_simulator.charges");
  await seed();
});
after(async () => {
  simulator?.kill();
  await pool.end();
});
async function reserved() {
  const order = await reserve(principal, {
    key: randomUUID(),
    variantId: fixtures.variant,
    quantity: 1,
  });
  const event = (await pendingDeliveries())[0];
  return { order, event };
}
test("HTTP provider applies one charge; lost response forces lookup before settling", async () => {
  const { order, event } = await reserved();
  let lookups = 0;
  const lost: PaymentGateway = {
    charge: async (input) => {
      await gateway.charge(input);
      throw new Error("response lost");
    },
    lookup: async (key) => {
      lookups++;
      return gateway.lookup(key);
    },
  };
  await assert.rejects(deliver(event.id, lost), /response lost/);
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM payment_commands WHERE order_id=$1",
        [order.id],
      )
    ).rows[0].status,
    "unknown",
  );
  await deliver(event.id, lost);
  assert.equal(lookups, 1);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM payment_simulator.charges"))
        .rows[0].count,
    ),
    1,
  );
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [order.id]))
      .rows[0].status,
    "confirmed",
  );
});
for (const crossTenant of [false, true]) {
  test(`mismatched ${crossTenant ? "tenant" : "order"} response cannot settle charge or reconciliation`, async () => {
    const { order, event } = await reserved();
    const other = await reserve(
      crossTenant
        ? { ...principal, id: fixtures.other, organizationId: fixtures.beta }
        : principal,
      {
        key: randomUUID(),
        variantId: crossTenant ? fixtures.otherVariant : fixtures.variant,
        quantity: 1,
      },
    );
    const response = {
      schemaVersion: 1,
      eventId: randomUUID(),
      orderId: other.id,
      organizationId: crossTenant ? fixtures.beta : fixtures.alpha,
      version: 1,
      outcome: "succeeded",
    };
    let charges = 0;
    let lookups = 0;
    const mismatched: PaymentGateway = {
      charge: async () => {
        charges++;
        return response;
      },
      lookup: async () => {
        lookups++;
        return response;
      },
    };
    await assert.rejects(
      deliver(event.id, mismatched),
      /PROVIDER_RESPONSE_MISMATCH/,
    );
    await assert.rejects(
      deliver(event.id, mismatched),
      /PROVIDER_RESPONSE_MISMATCH/,
    );
    assert.equal(charges, 1);
    assert.equal(lookups, 1);
    assert.deepEqual(
      (
        await pool.query("SELECT status FROM orders WHERE id=ANY($1::uuid[])", [
          [order.id, other.id],
        ])
      ).rows.map((row) => row.status),
      ["reserved", "reserved"],
    );
    assert.equal(
      Number(
        (await pool.query("SELECT count(*) FROM payment_inbox")).rows[0].count,
      ),
      0,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT status FROM payment_commands WHERE order_id=$1",
          [order.id],
        )
      ).rows[0].status,
      "unknown",
    );
    const pending = (
      await pool.query("SELECT processed_at,attempts FROM outbox WHERE id=$1", [
        event.id,
      ])
    ).rows[0];
    assert.equal(pending.processed_at, null);
    assert.equal(pending.attempts, 2);
    await deliver(event.id, gateway);
    assert.equal(
      (await pool.query("SELECT status FROM orders WHERE id=$1", [order.id]))
        .rows[0].status,
      "confirmed",
    );
    assert.equal(
      (await pool.query("SELECT status FROM orders WHERE id=$1", [other.id]))
        .rows[0].status,
      "reserved",
    );
  });
}
test("process crash after external effect before checkpoint recovers without a second charge", async () => {
  const { order, event } = await reserved();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/crash-delivery.ts", event.id],
    {
      env: { ...process.env, SIMULATOR_URL: base, SIMULATOR_SECRET: secret },
      stdio: "ignore",
    },
  );
  const code = await new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  assert.equal(code, 86);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM payment_simulator.charges"))
        .rows[0].count,
    ),
    1,
  );
  assert.equal(
    (
      await pool.query("SELECT processed_at FROM outbox WHERE id=$1", [
        event.id,
      ])
    ).rows[0].processed_at,
    null,
  );
  await deliver(event.id, gateway);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM payment_simulator.charges"))
        .rows[0].count,
    ),
    1,
  );
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [order.id]))
      .rows[0].status,
    "confirmed",
  );
});
test("failed budget requires authorized replay and preserves durable work", async () => {
  const { event } = await reserved();
  const unavailable: PaymentGateway = {
    charge: async () => {
      throw new Error("unavailable");
    },
    lookup: async () => {
      throw new Error("unavailable");
    },
  };
  for (let i = 0; i < 5; i++)
    await assert.rejects(deliver(event.id, unavailable));
  assert.equal((await pendingDeliveries()).length, 0);
  await assert.rejects(
    replay({ ...principal, role: "viewer" }, event.id),
    /FORBIDDEN/,
  );
  await assert.rejects(
    replay(
      { ...principal, id: fixtures.other, organizationId: fixtures.beta },
      event.id,
    ),
    /NOT_FOUND/,
  );
  await replay(principal, event.id);
  assert.equal((await pendingDeliveries()).length, 1);
  await deliver(event.id, gateway);
  assert.equal((await catalog(principal))[0].available, 9);
});
test("a cancelled uncertain command is reconciled but not charged when provider confirms absence", async () => {
  const { order, event } = await reserved();
  const unavailable: PaymentGateway = {
    charge: async () => {
      throw new Error("unavailable");
    },
    lookup: async () => null,
  };
  await assert.rejects(deliver(event.id, unavailable));
  await transition(principal, {
    orderId: order.id,
    expectedVersion: 1,
    action: "cancel",
  });
  await deliver(event.id, gateway);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM payment_simulator.charges"))
        .rows[0].count,
    ),
    0,
  );
  assert.equal((await catalog(principal))[0].available, 10);
});
test(
  "real Redis queue loss is rebuilt from PostgreSQL and a real BullMQ worker completes it",
  { skip: !process.env.REDIS_URL },
  async () => {
    const { order, event } = await reserved();
    const name = `commerce-test-${randomUUID()}`;
    const queue = createQueue(name);
    try {
      await dispatch(queue);
      assert.ok(await queue.getJob(event.id));
      await queue.obliterate({ force: true });
      assert.equal(await queue.getJob(event.id), undefined);
      await dispatch(queue);
      assert.ok(await queue.getJob(event.id));
      const worker = createWorker(gateway, name);
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Worker timeout")),
            10000,
          );
          worker.on("completed", () => {
            clearTimeout(timeout);
            resolve();
          });
          worker.on("failed", (_job, error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
        assert.equal(
          (
            await pool.query("SELECT status FROM orders WHERE id=$1", [
              order.id,
            ])
          ).rows[0].status,
          "confirmed",
        );
        assert.equal(
          Number(
            (await pool.query("SELECT count(*) FROM payment_simulator.charges"))
              .rows[0].count,
          ),
          1,
        );
      } finally {
        await worker.close();
      }
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  },
);
