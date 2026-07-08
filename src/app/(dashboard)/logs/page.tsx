import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

function statusVariant(s: string) {
  if (s === "SUCCESS") return "success" as const;
  if (s === "FAILED") return "error" as const;
  if (s === "RUNNING") return "warning" as const;
  return "neutral" as const;
}

export default async function LogsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const jobs = await db.bookingJob.findMany({
    where: { request: { userId } },
    include: {
      request: { include: { course: true } },
      logs: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { scheduledFor: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Job Logs</h1>
        <p className="text-zinc-400">Full history of every booking attempt</p>
      </div>

      {jobs.length === 0 ? (
        <p className="text-zinc-500 text-sm">No jobs have run yet.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div>
                  <p className="font-medium text-white">{job.request.course.name}</p>
                  <p className="text-xs text-zinc-500">
                    Target {format(job.targetDate, "EEE MMM d, yyyy")} ·
                    Fired {format(job.scheduledFor, "MMM d @ h:mm a")} ·
                    {job.attempts} attempt{job.attempts !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  {job.confirmedTime && (
                    <p className="mt-1 text-xs text-green-400">
                      Booked {job.confirmedTime} · #{job.confirmationId}
                    </p>
                  )}
                </div>
              </div>
              {job.logs.length > 0 && (
                <div className="px-4 py-2 font-mono text-xs space-y-0.5 bg-zinc-950/60">
                  {job.logs.map((l) => (
                    <div key={l.id} className={
                      l.level === "ERROR" ? "text-red-400" :
                      l.level === "WARN" ? "text-yellow-400" : "text-zinc-400"
                    }>
                      <span className="text-zinc-600">{format(l.createdAt, "HH:mm:ss.SSS")} </span>
                      [{l.level}] {l.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
