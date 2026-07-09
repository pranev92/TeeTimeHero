import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatTime, DAY_LABELS } from "@/lib/utils";
import { format } from "date-fns";
import { ToggleRequestButton } from "@/components/dashboard/toggle-request-button";
import { DeleteRequestButton } from "@/components/dashboard/delete-request-button";
import { BookNowButton } from "@/components/dashboard/book-now-button";

function statusVariant(s: string) {
  if (s === "SUCCESS") return "success" as const;
  if (s === "FAILED") return "error" as const;
  if (s === "RUNNING") return "warning" as const;
  if (s === "CANCELLED") return "neutral" as const;
  return "pending" as const;
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id!;

  const request = await db.bookingRequest.findFirst({
    where: { id, userId },
    include: {
      course: true,
      jobs: {
        orderBy: { scheduledFor: "desc" },
        include: { logs: { orderBy: { createdAt: "asc" } } },
        take: 20,
      },
    },
  });

  if (!request) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{request.course.name}</h1>
            <Badge variant={request.isActive ? "success" : "neutral"}>
              {request.isActive ? "Active" : "Paused"}
            </Badge>
          </div>
          <p className="text-zinc-400">
            {DAY_LABELS[request.dayOfWeek]} · {formatTime(request.windowStart)}–{formatTime(request.windowEnd)} · {request.numPlayers} player{request.numPlayers !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BookNowButton requestId={request.id} />
          <ToggleRequestButton id={request.id} isActive={request.isActive} />
          <DeleteRequestButton id={request.id} />
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 grid grid-cols-2 gap-4">
        {[
          { label: "Course", value: request.course.name },
          { label: "Day", value: DAY_LABELS[request.dayOfWeek] },
          { label: "Preferred time", value: formatTime(request.preferredTime) },
          { label: "Window", value: `${formatTime(request.windowStart)} – ${formatTime(request.windowEnd)}` },
          { label: "Players", value: String(request.numPlayers) },
          { label: "Priority", value: String(request.priority) },
          { label: "Booking opens", value: `${request.course.bookingWindowDays}d before at ${formatTime(request.course.bookingOpenTime)}` },
          { label: "Golfers", value: (() => { const n: string[] = JSON.parse(request.golferNames); return n.length ? n.join(", ") : "—"; })() },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-sm text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Jobs */}
      <section>
        <h2 className="font-semibold text-white mb-3">Booking jobs</h2>
        {request.jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {request.jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Target: {format(job.targetDate, "EEEE, MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Fires: {format(job.scheduledFor, "MMM d @ h:mm:ss a")} · Attempt {job.attempts}/{job.maxAttempts}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                    {job.confirmedTime && (
                      <p className="mt-1 text-xs text-green-400">Booked: {formatTime(job.confirmedTime)}</p>
                    )}
                  </div>
                </div>

                {/* Logs */}
                {job.logs.length > 0 && (
                  <div className="px-4 py-2 space-y-1 bg-zinc-950/50 font-mono text-xs">
                    {job.logs.map((log) => (
                      <div key={log.id} className={
                        log.level === "ERROR" ? "text-red-400" :
                        log.level === "WARN" ? "text-yellow-400" : "text-zinc-400"
                      }>
                        <span className="text-zinc-600">{format(log.createdAt, "HH:mm:ss")} </span>
                        {log.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Booking confirmation screenshot */}
                {job.screenshotData && (
                  <div className="px-4 py-3 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2">Booking confirmation</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/jobs/${job.id}/screenshot`}
                      alt="Booking confirmation"
                      className="rounded-lg max-w-full"
                      style={{ maxWidth: 560 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
