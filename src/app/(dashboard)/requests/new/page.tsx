"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

interface Course {
  id: string;
  name: string;
  timezone: string;
  bookingWindowDays: number;
  bookingOpenTime: string;
}

export default function NewRequestPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    courseId: "",
    dayOfWeek: "SUNDAY" as typeof DAYS[number],
    preferredTime: "08:00",
    windowStart: "07:45",
    windowEnd: "08:15",
    numPlayers: 1,
    golferNames: ["", "", "", ""],
    siteUsername: "",
    sitePassword: "",
    priority: 0,
  });

  useEffect(() => {
    fetch("/api/courses").then((r) => r.json()).then(setCourses);
  }, []);

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const golferNames = form.golferNames.filter(Boolean);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, golferNames }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      const msg = typeof data.error === "string" ? data.error : (data.error?.message ?? JSON.stringify(data.error) ?? "Failed to create request");
      setError(msg);
      return;
    }

    router.push("/requests");
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">New Booking Request</h1>
        <p className="text-zinc-400">Set up a recurring tee time — we handle the rest.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        {/* Course */}
        <Select
          label="Golf Course"
          id="courseId"
          value={form.courseId}
          onChange={(e) => setField("courseId", e.target.value)}
          required
        >
          <option value="">Select a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        {/* Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Day of week"
            id="dayOfWeek"
            value={form.dayOfWeek}
            onChange={(e) => setField("dayOfWeek", e.target.value as typeof DAYS[number])}
            required
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
            ))}
          </Select>

          <Input
            label="Preferred tee time"
            type="time"
            id="preferredTime"
            value={form.preferredTime}
            onChange={(e) => setField("preferredTime", e.target.value)}
            required
          />
        </div>

        {/* Window */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Earliest acceptable time"
            type="time"
            id="windowStart"
            value={form.windowStart}
            onChange={(e) => setField("windowStart", e.target.value)}
            required
          />
          <Input
            label="Latest acceptable time"
            type="time"
            id="windowEnd"
            value={form.windowEnd}
            onChange={(e) => setField("windowEnd", e.target.value)}
            required
          />
        </div>

        {/* Players */}
        <div>
          <Select
            label="Number of players"
            id="numPlayers"
            value={String(form.numPlayers)}
            onChange={(e) => setField("numPlayers", Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </div>

        {/* Golfer names */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            Golfer names <span className="text-zinc-500">(optional)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: form.numPlayers }).map((_, i) => (
              <input
                key={i}
                type="text"
                placeholder={`Player ${i + 1}`}
                value={form.golferNames[i]}
                onChange={(e) => {
                  const names = [...form.golferNames];
                  names[i] = e.target.value;
                  setField("golferNames", names);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            ))}
          </div>
        </div>

        {/* Site credentials */}
        <div className="space-y-3 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
          <p className="text-sm font-medium text-zinc-300">
            Booking site credentials <span className="text-zinc-500">(stored securely)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Username / Email"
              type="text"
              value={form.siteUsername}
              onChange={(e) => setField("siteUsername", e.target.value)}
              placeholder="golf@example.com"
            />
            <Input
              label="Password"
              type="password"
              value={form.sitePassword}
              onChange={(e) => setField("sitePassword", e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Priority */}
        <Input
          label="Priority (lower = higher priority)"
          type="number"
          min={0}
          value={form.priority}
          onChange={(e) => setField("priority", Number(e.target.value))}
        />

        {error && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Create request
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
