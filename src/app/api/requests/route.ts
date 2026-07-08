import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scheduleNextBooking } from "@/lib/scheduler";

const createSchema = z.object({
  courseId: z.string().cuid(),
  dayOfWeek: z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  numPlayers: z.number().int().min(1).max(4),
  golferNames: z.array(z.string()).default([]),
  siteUsername: z.string().optional(),
  sitePassword: z.string().optional(),
  priority: z.number().int().default(0),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await db.bookingRequest.findMany({
    where: { userId: session.user.id },
    include: {
      course: true,
      jobs: {
        orderBy: { scheduledFor: "desc" },
        take: 1,
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    const course = await db.golfCourse.findUnique({ where: { id: data.courseId } });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const request = await db.bookingRequest.create({
      data: { ...data, userId: session.user.id },
      include: { course: true },
    });

    // Immediately schedule the first booking job
    await scheduleNextBooking(request);

    return NextResponse.json(request, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
