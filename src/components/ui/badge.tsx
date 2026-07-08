import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "warning" | "pending" | "neutral";

const VARIANTS: Record<Variant, string> = {
  success: "bg-green-500/10 text-green-400 border border-green-500/20",
  error: "bg-red-500/10 text-red-400 border border-red-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  pending: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  neutral: "bg-zinc-700 text-zinc-300",
};

export function Badge({ children, variant = "neutral", className }: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", VARIANTS[variant], className)}>
      {children}
    </span>
  );
}
