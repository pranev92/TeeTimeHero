import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookingQueue } from "@/lib/scheduler/queue";
import type { BookingJobPayload } from "@/lib/scheduler";

const schema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await db.bookingRequest.findFirst({
    where: { id, userId: session.user.id },
    include: { course: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!request.isActive) return NextResponse.json({ error: "Request is paused" }, { status: 400 });

  try {
    const { targetDate } = schema.parse(await req.json());

    const job = await db.bookingJob.create({
      data: {
        requestId: request.id,
        scheduledFor: new Date(),
        targetDate: new Date(targetDate + "T12:00:00Z"),
        status: "PENDING",
      },
    });

    try {
      const bullJob = await bookingQueue.add(
        "book-tee-time",
        {
          bookingJobId: job.id,
          requestId: request.id,
          courseId: request.courseId,
          targetDate: new Date(targetDate + "T12:00:00Z").toISOString(),
        } satisfies BookingJobPayload,
        { delay: 0, jobId: `booking-${job.id}` }
      );
      await db.bookingJob.update({ where: { id: job.id }, data: { bullJobId: bullJob.id } });
    } catch (err) {
      await db.bookingJob.delete({ where: { id: job.id } });
      throw err;
    }

    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
