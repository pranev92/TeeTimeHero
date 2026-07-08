import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-sm text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Automated · Precise · Always on time
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white">
          TeeTime <span className="text-green-500">Hero</span>
        </h1>
        <p className="mb-8 text-lg text-zinc-400 max-w-lg mx-auto">
          Golf courses release tee times exactly 7 days in advance — usually at midnight.
          TeeTime Hero fires at the exact moment slots open, so you always get your preferred time.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            { icon: "⏰", title: "Precise timing", body: "Fires exactly when booking windows open — down to the second." },
            { icon: "🔁", title: "Set and forget", body: "Recurring requests run every week automatically until you disable them." },
            { icon: "📋", title: "Full audit log", body: "Every attempt is logged so you always know what happened." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-1 font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
