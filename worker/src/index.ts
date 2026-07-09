import { Worker } from "bullmq";
import { processBookingJob } from "./processors/booking";

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

const worker = new Worker("booking", processBookingJob, {
  connection: redisConnection(),
  concurrency: 5,
});

worker.on("completed", (job) => console.log(`[worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[worker] Job ${job?.id} failed:`, err.message));
worker.on("error", (err) => console.error("[worker] Worker error:", err));

console.log("[worker] Booking worker started, waiting for jobs...");

process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await worker.close();
  process.exit(0);
});
