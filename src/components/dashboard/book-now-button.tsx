"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BookNowButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleBook() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/requests/${requestId}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDate: date }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to trigger booking");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" className="border border-green-600 text-green-400 hover:bg-green-600/10" onClick={() => setOpen(true)}>
        Book Now
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
      />
      <Button loading={loading} onClick={handleBook}>
        Confirm
      </Button>
      <Button variant="ghost" onClick={() => { setOpen(false); setError(""); }}>
        Cancel
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
