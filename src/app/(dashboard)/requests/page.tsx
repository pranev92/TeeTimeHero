import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatTime, DAY_LABELS } from "@/lib/utils";
import { ToggleRequestButton } from "@/components/dashboard/toggle-request-button";
import { DeleteRequestButton } from "@/components/dashboard/delete-request-button";

export default async function RequestsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const requests = await db.bookingRequest.findMany({
    where: { userId },
    include: {
      course: true,
      jobs: { orderBy: { scheduledFor: "desc" }, take: 1 },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Booking Requests</h1>
          <p className="text-zinc-400">Manage your recurring tee time requests</p>
        </div>
        <Link
          href="/requests/new"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + New Request
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center text-zinc-500">
          <p className="text-lg mb-3">No booking requests yet</p>
          <Link href="/requests/new" className="text-green-400 hover:text-green-300 text-sm">
            Create your first request →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900">
          {requests.map((r) => {
            const lastJob = r.jobs[0];
            return (
              <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/requests/${r.id}`}
                      className="font-medium text-white hover:text-green-400 transition-colors"
                    >
                      {r.course.name}
                    </Link>
                    <Badge variant={r.isActive ? "success" : "neutral"}>
                      {r.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    {DAY_LABELS[r.dayOfWeek]} · {formatTime(r.windowStart)}–{formatTime(r.windowEnd)} · {r.numPlayers} player{r.numPlayers !== 1 ? "s" : ""}
                  </p>
                  {lastJob && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Last job: {lastJob.status}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ToggleRequestButton id={r.id} isActive={r.isActive} />
                  <DeleteRequestButton id={r.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
