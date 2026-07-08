import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestId = req.nextUrl.searchParams.get("requestId");

  const jobs = await db.bookingJob.findMany({
    where: {
      request: { userId: session.user.id },
      ...(requestId ? { requestId } : {}),
    },
    include: {
      request: { include: { course: true } },
      logs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
    orderBy: { scheduledFor: "desc" },
    take: 50,
  });

  return NextResponse.json(jobs);
}
