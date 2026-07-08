import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelRequestJobs, scheduleNextBooking } from "@/lib/scheduler";

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  numPlayers: z.number().int().min(1).max(4).optional(),
  golferNames: z.array(z.string()).optional(),
  priority: z.number().int().optional(),
});

async function getOwned(id: string, userId: string) {
  return db.bookingRequest.findFirst({ where: { id, userId }, include: { course: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await db.bookingRequest.findFirst({
    where: { id, userId: session.user.id },
    include: {
      course: true,
      jobs: {
        orderBy: { scheduledFor: "desc" },
        include: { logs: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(request);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await getOwned(id, session.user.id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const data = updateSchema.parse(await req.json());
    const wasActive = request.isActive;
    const updated = await db.bookingRequest.update({
      where: { id },
      data,
      include: { course: true },
    });

    if (wasActive && data.isActive === false) {
      // User disabled the request — cancel pending jobs
      await cancelRequestJobs(id);
    } else if (!wasActive && data.isActive === true) {
      // User re-enabled — schedule the next job
      await scheduleNextBooking(updated);
    }

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await getOwned(id, session.user.id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await cancelRequestJobs(id);
  await db.bookingRequest.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
