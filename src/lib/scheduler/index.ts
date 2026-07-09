import { db } from "@/lib/db";
import { bookingQueue } from "./queue";
import { nextBookingWindowOpen, msUntilOpen } from "./timing";
import type { BookingRequest, GolfCourse } from "@prisma/client";

type DayOfWeek = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";

export type BookingJobPayload = {
  bookingJobId: string;
  requestId: string;
  courseId: string;
  targetDate: string; // ISO string
};

/**
 * Schedule a BullMQ job for the next booking window of a given request.
 * Creates a BookingJob row and links the BullMQ job ID back to it.
 */
export async function scheduleNextBooking(
  request: BookingRequest & { course: GolfCourse }
): Promise<void> {
  if (!request.isActive) return;

  const { openAt, targetDate } = nextBookingWindowOpen({
    dayOfWeek: request.dayOfWeek as DayOfWeek,
    timezone: request.course.timezone,
    bookingWindowDays: request.course.bookingWindowDays,
    bookingOpenTime: request.course.bookingOpenTime,
  });

  const job = await db.bookingJob.create({
    data: {
      requestId: request.id,
      scheduledFor: openAt,
      targetDate,
      status: "PENDING",
    },
  });

  const delay = msUntilOpen(openAt);

  try {
    const bullJob = await bookingQueue.add(
      "book-tee-time",
      { bookingJobId: job.id, requestId: request.id, courseId: request.courseId, targetDate: targetDate.toISOString() } satisfies BookingJobPayload,
      { delay, jobId: `booking-${job.id}` }
    );
    await db.bookingJob.update({
      where: { id: job.id },
      data: { bullJobId: bullJob.id },
    });
  } catch (err) {
    await db.bookingJob.delete({ where: { id: job.id } });
    throw err;
  }
}

/**
 * Cancel any pending BullMQ job for the given BookingJob and mark it cancelled.
 */
export async function cancelBookingJob(jobId: string): Promise<void> {
  const record = await db.bookingJob.findUnique({ where: { id: jobId } });
  if (!record || !record.bullJobId) return;

  const bullJob = await bookingQueue.getJob(record.bullJobId);
  if (bullJob) await bullJob.remove();

  await db.bookingJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED" },
  });
}

/**
 * When a BookingRequest is disabled, cancel all its pending jobs.
 */
export async function cancelRequestJobs(requestId: string): Promise<void> {
  const jobs = await db.bookingJob.findMany({
    where: { requestId, status: "PENDING" },
  });
  await Promise.all(jobs.map((j) => cancelBookingJob(j.id)));
}
