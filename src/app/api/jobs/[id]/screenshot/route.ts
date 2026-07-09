import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const job = await db.bookingJob.findFirst({
    where: { id },
    include: { request: { select: { userId: true } } },
  });

  if (!job || job.request.userId !== session.user.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!job.screenshotData) {
    return new NextResponse("No screenshot available", { status: 404 });
  }

  return new NextResponse(job.screenshotData, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
