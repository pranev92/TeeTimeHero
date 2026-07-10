"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "picking" | "booking" | "done" | "failed";

export function BookNowButton({ requestId, isActive }: { requestId: string; isActive: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobId, setJobId] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [logs, setLogs] = useState<{ level: string; message: string }[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId || phase !== "booking") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setLogs(data.logs ?? []);

        if (data.status === "SUCCESS") {
          clearInterval(pollRef.current!);
          setScreenshotUrl(`/api/jobs/${jobId}/screenshot`);
          setPhase("done");
        } else if (data.status === "FAILED" || data.status === "CANCELLED") {
          clearInterval(pollRef.current!);
          if (data.hasScreenshot) {
            setScreenshotUrl(`/api/jobs/${jobId}/screenshot`);
          }
          setErrorMsg("Booking failed. Check the logs below.");
          setPhase("failed");
        }
      } catch {}
    }, 3000);

    return () => clearInterval(pollRef.current!);
  }, [jobId, phase]);

  async function handleBook() {
    setPhase("booking");
    setErrorMsg("");
    setLogs([]);
    setScreenshotUrl(null);

    const res = await fetch(`/api/requests/${requestId}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDate: date }),
    });

    if (!res.ok) {
      const d = await res.json();
      setErrorMsg(typeof d.error === "string" ? d.error : "Failed to trigger booking");
      setPhase("failed");
      return;
    }

    const { jobId: id } = await res.json();
    setJobId(id);
  }

  function reset() {
    clearInterval(pollRef.current!);
    setPhase("idle");
    setJobId(null);
    setScreenshotUrl(null);
    setErrorMsg("");
    setLogs([]);
  }

  if (phase === "idle") {
    return (
      <Button
        variant="ghost"
        className="border border-green-600 text-green-400 hover:bg-green-600/10 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => setPhase("picking")}
        disabled={!isActive}
        title={!isActive ? "Unpause request to book" : undefined}
      >
        Book Now
      </Button>
    );
  }

  if (phase === "picking") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
        />
        <Button onClick={handleBook}>Confirm</Button>
        <Button variant="ghost" onClick={reset}>Cancel</Button>
      </div>
    );
  }

  if (phase === "booking") {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          Booking in progress…
        </div>
        {logs.length > 0 && (
          <div className="rounded-lg bg-zinc-950/50 p-3 font-mono text-xs space-y-1">
            {logs.map((l, i) => (
              <div key={i} className={l.level === "ERROR" ? "text-red-400" : l.level === "WARN" ? "text-yellow-400" : "text-zinc-400"}>
                {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "done" && screenshotUrl) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-green-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-green-400">Booking confirmed!</p>
          <Button variant="ghost" onClick={reset} className="text-xs">Done</Button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screenshotUrl} alt="Booking confirmation" className="rounded-lg w-full" />
      </div>
    );
  }

  // failed
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-red-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-400">{errorMsg || "Booking failed."}</p>
        <Button variant="ghost" onClick={reset} className="text-xs">Retry</Button>
      </div>
      {logs.length > 0 && (
        <div className="rounded-lg bg-zinc-950/50 p-3 font-mono text-xs space-y-1">
          {logs.map((l, i) => (
            <div key={i} className={l.level === "ERROR" ? "text-red-400" : l.level === "WARN" ? "text-yellow-400" : "text-zinc-400"}>
              {l.message}
            </div>
          ))}
        </div>
      )}
      {screenshotUrl && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">Browser diagnostic screenshot:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshotUrl} alt="Diagnostic screenshot" className="rounded-lg w-full" />
        </div>
      )}
    </div>
  );
}
