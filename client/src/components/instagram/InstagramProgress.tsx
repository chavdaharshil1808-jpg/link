import { motion, AnimatePresence } from "framer-motion";
import { HiCheckCircle, HiClock, HiArrowPath } from "react-icons/hi2";
import { BsInstagram } from "react-icons/bs";

interface ProgressStep {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface InstagramProgressProps {
  currentStep: string;
  progress: number;
  message: string;
  error?: string;
}

const steps: ProgressStep[] = [
  { key: "authenticating", label: "Authenticating", icon: <HiArrowPath className="w-4 h-4" /> },
  { key: "extracting", label: "Extracting metadata", icon: <BsInstagram className="w-4 h-4" /> },
  { key: "preparing", label: "Preparing HD stream", icon: <HiClock className="w-4 h-4" /> },
  { key: "downloading", label: "Downloading", icon: <HiArrowPath className="w-4 h-4" /> },
  { key: "merging", label: "Merging", icon: <HiArrowPath className="w-4 h-4" /> },
  { key: "completed", label: "Completed", icon: <HiCheckCircle className="w-4 h-4" /> },
];

function getCurrentStepIndex(currentStep: string): number {
  const idx = steps.findIndex((s) => s.key === currentStep);
  return idx >= 0 ? idx : -1;
}

export function InstagramProgress({ currentStep, progress, message, error }: InstagramProgressProps) {
  const currentIdx = getCurrentStepIndex(currentStep);
  const isCompleted = currentStep === "completed";
  const isError = currentStep === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-6 border border-white/5"
    >
      <div className="flex items-center gap-3 mb-6">
        <motion.div
          animate={isCompleted ? { scale: [1, 1.2, 1] } : { rotate: currentIdx >= 0 && !isCompleted ? 360 : 0 }}
          transition={isCompleted ? { duration: 0.5 } : { duration: 2, repeat: isCompleted ? 0 : Infinity, ease: "linear" }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isCompleted
              ? "bg-gradient-to-br from-green-400 to-emerald-500"
              : isError
              ? "bg-gradient-to-br from-red-500 to-red-600"
              : "bg-gradient-to-br from-pink-500 to-purple-600"
          }`}
        >
          {isCompleted ? (
            <HiCheckCircle className="w-5 h-5 text-white" />
          ) : (
            <BsInstagram className="w-5 h-5 text-white" />
          )}
        </motion.div>
        <div>
          <h3 className="text-sm font-semibold text-white">
            {isCompleted ? "Download Complete" : isError ? "Download Failed" : message || "Processing..."}
          </h3>
          {!isCompleted && !isError && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {currentIdx >= 0 ? `Step ${currentIdx + 1} of ${steps.length}` : ""}
            </p>
          )}
        </div>
      </div>

      {!isError && (
        <div className="relative h-2 bg-dark-border/60 rounded-full overflow-hidden mb-6">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
              isCompleted
                ? "from-green-400 to-emerald-500"
                : "from-pink-500 via-purple-500 to-blue-500"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${isCompleted ? 100 : Math.min(progress, 99)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/20 to-transparent"
            animate={{ width: `${isCompleted ? 100 : Math.min(progress, 99)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4"
        >
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      <div className="space-y-2">
        {steps.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isPast = idx < currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                isActive
                  ? "bg-pink-500/10 border border-pink-500/20"
                  : isPast
                  ? "bg-green-500/5 border border-transparent"
                  : "border border-transparent opacity-40"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  isPast
                    ? "bg-green-500/20 text-green-400"
                    : isActive
                    ? "bg-pink-500/20 text-pink-400"
                    : "bg-dark-border/60 text-zinc-600"
                }`}
              >
                {isPast ? (
                  <HiCheckCircle className="w-4 h-4" />
                ) : (
                  <div className={isActive ? "animate-spin" : ""}>{step.icon}</div>
                )}
              </div>
              <span
                className={`text-sm font-medium transition-all ${
                  isPast
                    ? "text-green-400"
                    : isActive
                    ? "text-white"
                    : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
              {isActive && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="ml-auto text-xs text-pink-400"
                >
                  {currentStep === "downloading" ? `${progress.toFixed(0)}%` : "..."}
                </motion.span>
              )}
              {isPast && (
                <span className="ml-auto text-xs text-green-400/60">Done</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
