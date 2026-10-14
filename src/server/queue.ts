import { Queue, Worker } from "bullmq";
import { pendingDeliveries, deliver } from "./delivery";
import type { PaymentGateway } from "./payment-gateway";
export function queueConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6388");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
  };
}
export function createQueue(name = "commerce-delivery") {
  return new Queue(name, {
    connection: { ...queueConnection(), maxRetriesPerRequest: 1 },
  });
}
export async function dispatch(queue: Queue) {
  const pending = await pendingDeliveries();
  for (const event of pending)
    await queue.add(
      "deliver",
      { id: event.id },
      { jobId: event.id, removeOnComplete: true, removeOnFail: true },
    );
  return pending.length;
}
export function createWorker(
  gateway: PaymentGateway,
  name = "commerce-delivery",
) {
  return new Worker(name, async (job) => deliver(job.data.id, gateway), {
    connection: { ...queueConnection(), maxRetriesPerRequest: null },
    concurrency: 4,
  });
}
