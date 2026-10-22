import { motion } from "framer-motion";
import { HiCheck } from "react-icons/hi2";
import { QUALITY_OPTIONS } from "@/lib/platform";

interface QualitySelectorProps {
  selected: string;
  onChange: (value: string) => void;
}

export function QualitySelector({ selected, onChange }: QualitySelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {QUALITY_OPTIONS.map((option, idx) => {
        const isSelected = selected === option.value;
        return (
          <motion.button
            key={option.value}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => onChange(option.value)}
            className={`relative flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all border ${
              isSelected
                ? "bg-primary/15 border-primary/40 shadow-[0_0_12px_rgba(108,92,231,0.15)]"
                : "bg-dark-border/30 border-dark-border/50 hover:border-white/20"
            }`}
          >
            {isSelected && (
              <motion.div
                layoutId="quality-check"
                className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
              >
                <HiCheck className="w-2.5 h-2.5 text-white" />
              </motion.div>
            )}
            <span className="text-lg">{option.icon}</span>
            <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-white"}`}>
              {option.label}
            </span>
            <span className="text-[10px] text-zinc-500">{option.description}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
