import { motion } from "framer-motion";
import { HiCheckCircle, HiArrowPath, HiClock, HiMusicalNote, HiCloudArrowDown } from "react-icons/hi2";
import type { DownloadStep } from "@/lib/platform";

const stepConfig: { key: DownloadStep; label: string; icon: React.ReactNode }[] = [
  { key: "preparing", label: "Preparing", icon: <HiClock className="w-4 h-4" /> },
  { key: "extracting", label: "Extracting", icon: <HiMusicalNote className="w-4 h-4" /> },
  { key: "downloading", label: "Downloading", icon: <HiCloudArrowDown className="w-4 h-4" /> },
  { key: "merging", label: "Merging", icon: <HiArrowPath className="w-4 h-4" /> },
  { key: "completed", label: "Completed", icon: <HiCheckCircle className="w-4 h-4" /> },
];

interface DownloadStepsProps {
  currentStep: DownloadStep;
  progress: number;
  message?: string;
}

function getStepIndex(step: DownloadStep): number {
  return stepConfig.findIndex((s) => s.key === step);
}

export function DownloadSteps({ currentStep, progress, message }: DownloadStepsProps) {
  const currentIdx = getStepIndex(currentStep);
  const isCompleted = currentStep === "completed";

  return (
    <div className="w-full">
      <div className="relative flex items-center justify-between mb-6">
        {stepConfig.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isPast = idx < currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10">
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? 1.15 : 1,
                }}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
                  isPast || (isCompleted && idx === stepConfig.length - 1)
                    ? "bg-green-500/20 border-green-500/30 text-green-400"
                    : isActive
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-dark-border/60 border-dark-border text-zinc-600"
                }`}
              >
                {isPast || (isCompleted && idx === stepConfig.length - 1) ? (
                  <HiCheckCircle className="w-4 h-4" />
                ) : (
                  <div className={isActive ? "animate-spin" : ""}>{step.icon}</div>
                )}
              </motion.div>
              <span
                className={`text-[10px] font-medium mt-1.5 whitespace-nowrap ${
                  isPast || isActive ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}

        {/* Connecting line */}
        <div className="absolute top-4 left-[calc(9px)] right-[calc(9px)] h-[2px] -translate-y-1/2 bg-dark-border/60 z-0">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 via-primary to-accent"
            initial={{ width: "0%" }}
            animate={{
              width: `${Math.max(0, Math.min(100, (currentIdx / (stepConfig.length - 1)) * 100))}%`,
            }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-zinc-400 text-center"
        >
          {message}
        </motion.p>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-zinc-400">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="relative w-full h-2 rounded-full bg-dark-border/60 overflow-hidden">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
              isCompleted ? "from-green-500 to-emerald-500" : "from-primary to-accent"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
          {!isCompleted && (
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/20 to-transparent"
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
