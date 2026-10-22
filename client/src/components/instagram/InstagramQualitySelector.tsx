import { motion } from "framer-motion";
import { HiCheck } from "react-icons/hi2";

interface QualityOption {
  value: string;
  label: string;
  description: string;
  icon: string;
}

const qualityOptions: QualityOption[] = [
  { value: "best", label: "Best", description: "Highest quality available", icon: "👑" },
  { value: "1080p", label: "1080p", description: "Full HD resolution", icon: "📺" },
  { value: "720p", label: "720p", description: "HD ready", icon: "📱" },
  { value: "480p", label: "480p", description: "Standard definition", icon: "💻" },
  { value: "audio", label: "Audio Only", description: "MP3 audio extraction", icon: "🎵" },
];

interface InstagramQualitySelectorProps {
  selected: string;
  onChange: (value: string) => void;
}

export function InstagramQualitySelector({ selected, onChange }: InstagramQualitySelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-white">Quality</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {qualityOptions.map((option, idx) => {
          const isSelected = selected === option.value;
          return (
            <motion.button
              key={option.value}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => onChange(option.value)}
              className={`relative flex items-start gap-3 p-3.5 rounded-2xl text-left transition-all border ${
                isSelected
                  ? "bg-primary/15 border-primary/40 shadow-[0_0_15px_rgba(108,92,231,0.15)]"
                  : "glass border-dark-border/30 hover:border-white/10"
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId="quality-check"
                  className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                >
                  <HiCheck className="w-3 h-3 text-white" />
                </motion.div>
              )}
              <span className="text-xl">{option.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-white"}`}>
                  {option.label}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{option.description}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
