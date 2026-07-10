import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const job = await db.bookingJob.findFirst({
    where: { id },
    include: {
      request: { select: { userId: true } },
      logs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!job || job.request.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    confirmedTime: job.confirmedTime,
    hasScreenshot: !!job.screenshotData,
    logs: job.logs.map((l) => ({ level: l.level, message: l.message })),
  });
}
