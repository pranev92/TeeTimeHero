import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatTime, DAY_LABELS } from "@/lib/utils";
import { format } from "date-fns";

function statusVariant(s: string) {
  if (s === "SUCCESS") return "success";
  if (s === "FAILED") return "error";
  if (s === "RUNNING") return "warning";
  if (s === "CANCELLED") return "neutral";
  return "pending";
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [requests, recentJobs] = await Promise.all([
    db.bookingRequest.findMany({
      where: { userId },
      include: { course: true },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    db.bookingJob.findMany({
      where: { request: { userId } },
      include: { request: { include: { course: true } } },
      orderBy: { scheduledFor: "desc" },
      take: 5,
    }),
  ]);

  const active = requests.filter((r) => r.isActive);
  const nextJob = await db.bookingJob.findFirst({
    where: { request: { userId }, status: "PENDING", scheduledFor: { gte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    include: { request: { include: { course: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-400">Your booking overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Active requests", value: active.length, hint: "booking this week" },
          { label: "Total requests", value: requests.length, hint: "all time" },
          {
            label: "Next job fires",
            value: nextJob ? format(nextJob.scheduledFor, "MMM d, h:mm a") : "—",
            hint: nextJob ? `${nextJob.request.course.name}` : "no pending jobs",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm text-zinc-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{s.value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Active requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">Active requests</h2>
          <Link href="/requests/new" className="text-sm text-green-400 hover:text-green-300">
            + New request
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
            No active requests.{" "}
            <Link href="/requests/new" className="text-green-400 hover:text-green-300">
              Create one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900">
            {active.map((r) => (
              <Link
                key={r.id}
                href={`/requests/${r.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-white">{r.course.name}</p>
                  <p className="text-sm text-zinc-400">
                    {DAY_LABELS[r.dayOfWeek]} · {formatTime(r.preferredTime)} ({r.numPlayers} players)
                  </p>
                </div>
                <Badge variant="success">Active</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent jobs */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">Recent jobs</h2>
          <Link href="/logs" className="text-sm text-zinc-400 hover:text-zinc-300">
            View all →
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs run yet.</p>
        ) : (
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900">
            {recentJobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{j.request.course.name}</p>
                  <p className="text-xs text-zinc-500">
                    Target: {format(j.targetDate, "MMM d, yyyy")} · Fired: {format(j.scheduledFor, "MMM d, h:mm a")}
                  </p>
                </div>
                <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
