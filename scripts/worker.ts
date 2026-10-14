import { createQueue, createWorker, dispatch } from "../src/server/queue";
import { HttpPaymentGateway } from "../src/server/payment-gateway";
import { expireDue } from "../src/server/lifecycle";
import { pool } from "../src/server/db";
const secret = process.env.SIMULATOR_SECRET;
if (!secret || secret.length < 32) throw new Error("Set SIMULATOR_SECRET");
const gateway = new HttpPaymentGateway(
  process.env.SIMULATOR_URL ?? "http://127.0.0.1:3101",
  secret,
);
const queue = createQueue();
const worker = createWorker(gateway);
const log = (event: string, error?: Error) =>
  console.info(JSON.stringify({ event, error: error?.name }));
worker.on("error", (error) => log("worker.error", error));
worker.on("failed", () => log("worker.delivery_failed"));
queue.on("error", (error) => log("queue.error", error));
let stopping = false;
async function tick() {
  if (stopping) return;
  try {
    await expireDue();
    await dispatch(queue);
  } catch {
    log("dispatcher.retry");
  }
  if (!stopping) setTimeout(tick, 1000);
}
void tick();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    stopping = true;
    await worker.close();
    await queue.close();
    await pool.end();
    process.exit(0);
  });
