import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const courses = await db.golfCourse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(courses);
}
