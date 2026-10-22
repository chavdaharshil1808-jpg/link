import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatSpeed, formatEta } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  speed?: number | null;
  eta?: number | null;
  status: string;
  showDetails?: boolean;
}

const statusColors: Record<string, string> = {
  PENDING: "from-yellow-500 to-yellow-600",
  ANALYZING: "from-blue-500 to-blue-600",
  DOWNLOADING: "from-primary to-accent",
  PAUSED: "from-zinc-500 to-zinc-600",
  COMPLETED: "from-green-500 to-green-600",
  FAILED: "from-red-500 to-red-600",
  CANCELLED: "from-zinc-500 to-zinc-600",
};

const statusGlow: Record<string, string> = {
  DOWNLOADING: "shadow-[0_0_12px_rgba(108,92,231,0.5)]",
  COMPLETED: "shadow-[0_0_12px_rgba(34,197,94,0.4)]",
  FAILED: "shadow-[0_0_12px_rgba(239,68,68,0.4)]",
};

export function ProgressBar({
  progress,
  speed,
  eta,
  status,
  showDetails = true,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const gradient = statusColors[status] || "from-primary to-accent";
  const glow = statusGlow[status] || "";
  const isActive = status === "DOWNLOADING";

  return (
    <div className="w-full">
      {showDetails && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-zinc-400">
            {clampedProgress.toFixed(1)}%
          </span>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {isActive && speed != null && speed > 0 && (
              <span>{formatSpeed(speed)}</span>
            )}
            {isActive && eta != null && eta > 0 && (
              <span>ETA {formatEta(eta)}</span>
            )}
          </div>
        </div>
      )}
      <div className="relative w-full h-2 rounded-full bg-dark-border/60 overflow-hidden">
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r",
            gradient,
            glow && statusGlow[status]
          )}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        {isActive && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/20 to-transparent"
            animate={{ width: `${clampedProgress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
      </div>
    </div>
  );
}
