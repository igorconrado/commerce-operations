import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { pool } from "../src/server/db";
const input = z
  .object({
    key: z.uuid(),
    orderId: z.uuid(),
    organizationId: z.uuid(),
    amountCents: z.number().int().positive(),
  })
  .strict();
const secret = process.env.SIMULATOR_SECRET;
if (!secret || secret.length < 32)
  throw new Error("Set a local SIMULATOR_SECRET (32+ characters)");
const toEvent = (row: Record<string, unknown>) => ({
  schemaVersion: 1,
  eventId: row.event_id,
  organizationId: row.organization_id,
  orderId: row.order_id,
  version: row.version,
  outcome: row.outcome,
});
const server = createServer(async (req, res) => {
  const provided = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    res.writeHead(401);
    return res.end();
  }
  try {
    if (req.method === "GET" && req.url?.startsWith("/charges/")) {
      const key = z.uuid().parse(req.url.slice("/charges/".length));
      const row = (
        await pool.query(
          "SELECT * FROM payment_simulator.charges WHERE command_key=$1",
          [key],
        )
      ).rows[0];
      res.writeHead(row ? 200 : 404, { "content-type": "application/json" });
      return res.end(row ? JSON.stringify(toEvent(row)) : "{}");
    }
    if (req.method !== "POST" || req.url !== "/charges") {
      res.writeHead(404);
      return res.end();
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 4096) {
        res.writeHead(413);
        return res.end();
      }
    }
    const charge = input.parse(JSON.parse(body));
    await pool.query(
      `INSERT INTO payment_simulator.charges(command_key,order_id,organization_id,amount_cents,event_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [
        charge.key,
        charge.orderId,
        charge.organizationId,
        charge.amountCents,
        randomUUID(),
      ],
    );
    const row = (
      await pool.query(
        "SELECT * FROM payment_simulator.charges WHERE command_key=$1",
        [charge.key],
      )
    ).rows[0];
    if (
      row.order_id !== charge.orderId ||
      row.organization_id !== charge.organizationId ||
      row.amount_cents !== charge.amountCents
    ) {
      res.writeHead(409);
      return res.end();
    }
    // Failure mode commits the provider effect but loses its response.
    if (process.env.SIMULATOR_MODE === "lose-response") {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(toEvent(row)));
  } catch {
    res.writeHead(400);
    res.end();
  }
});
server.listen(Number(process.env.SIMULATOR_PORT ?? 3101), "127.0.0.1", () =>
  console.info(
    JSON.stringify({
      event: "simulator.ready",
      port: process.env.SIMULATOR_PORT ?? 3101,
    }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );
