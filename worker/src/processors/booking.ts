import { Job } from "bullmq";
import { db } from "@/lib/db";
import { getAutomation } from "@/lib/automation/registry";
import { scheduleNextBooking } from "@/lib/scheduler";
import type { BookingJobPayload } from "@/lib/scheduler";

async function log(jobId: string, level: "INFO" | "WARN" | "ERROR", message: string, data?: object) {
  await db.bookingLog.create({ data: { jobId, level, message, data: data ? JSON.stringify(data) : undefined } });
  const prefix = `[${level}][job:${jobId}]`;
  if (level === "ERROR") console.error(prefix, message, data ?? "");
  else console.log(prefix, message, data ?? "");
}

export async function processBookingJob(job: Job<BookingJobPayload>) {
  const { bookingJobId, requestId, targetDate } = job.data;

  // Mark running
  await db.bookingJob.update({
    where: { id: bookingJobId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: job.attemptsMade + 1 },
  });

  await log(bookingJobId, "INFO", `Starting booking attempt ${job.attemptsMade + 1}`);

  // Load full request + course
  const request = await db.bookingRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { course: true },
  });

  if (!request.isActive) {
    await log(bookingJobId, "WARN", "Request disabled — skipping");
    await db.bookingJob.update({ where: { id: bookingJobId }, data: { status: "CANCELLED", completedAt: new Date() } });
    return;
  }

  const automation = getAutomation(request.course.slug);

  await log(bookingJobId, "INFO", `Attempting ${request.course.name} on ${targetDate}`);

  const result = await automation.attempt({
    targetDate: new Date(targetDate),
    preferredTime: request.preferredTime,
    windowStart: request.windowStart,
    windowEnd: request.windowEnd,
    numPlayers: request.numPlayers,
    golferNames: JSON.parse(request.golferNames) as string[],
    siteUsername: request.siteUsername ?? undefined,
    sitePassword: request.sitePassword ?? undefined,
  });

  if (result.success) {
    await log(bookingJobId, "INFO", `Booked! Time: ${result.confirmedTime}, Confirmation: ${result.confirmationId}`);
    await db.bookingJob.update({
      where: { id: bookingJobId },
      data: {
        status: "SUCCESS",
        confirmedTime: result.confirmedTime,
        confirmationId: result.confirmationId,
        completedAt: new Date(),
      },
    });
    // Schedule next occurrence
    await scheduleNextBooking(request);
  } else {
    await log(bookingJobId, "ERROR", `Booking failed: ${result.errorMessage}`);
    // BullMQ will retry automatically based on job options
    // On final failure, update status
    if (job.attemptsMade + 1 >= job.opts.attempts!) {
      await db.bookingJob.update({
        where: { id: bookingJobId },
        data: { status: "FAILED", errorMessage: result.errorMessage, completedAt: new Date() },
      });
      // Still schedule next week even after failure
      await scheduleNextBooking(request);
    }
    throw new Error(result.errorMessage ?? "Unknown booking failure");
  }
}
