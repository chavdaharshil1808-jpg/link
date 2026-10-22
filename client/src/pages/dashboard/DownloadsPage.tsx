import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { downloadApi, getApiError } from "@/lib/api";
import { cn, isValidUrl } from "@/lib/utils";
import { MediaPreview } from "@/components/download/MediaPreview";
import type { AnalyzeResult } from "@/types";
import {
  HiMagnifyingGlass,
  HiClipboardDocument,
  HiLink,
  HiXMark,
} from "react-icons/hi2";

export default function DownloadsPage() {
  const [url, setUrl] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: (url: string) => downloadApi.prepare(url),
    onSuccess: (res) => {
      setAnalyzeResult(res.data);
      toast.success("Media ready to download");
    },
    onError: (err: any) => {
      toast.error(getApiError(err, "Failed to prepare URL"));
    },
  });

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      toast.error("Failed to read clipboard");
    }
  }, []);

  const handleAnalyze = () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    if (!isValidUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }
    analyzeMutation.mutate(url);
  };

  const handleReset = () => {
    setAnalyzeResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* URL Input */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6"
      >
        <h1 className="text-2xl font-bold text-white mb-1">Download</h1>
        <p className="text-sm text-zinc-500 mb-5">
          Paste a media URL — we download the best format automatically and show you the actual media
        </p>

        <div
          className={cn(
            "flex items-center gap-3 bg-dark-border/40 rounded-xl px-4 py-3 transition-all duration-200 border",
            isFocused
              ? "border-primary/50 ring-1 ring-primary/20"
              : "border-transparent"
          )}
        >
          <HiLink className="w-5 h-5 text-zinc-500 shrink-0" />
          <input
            type="url"
            placeholder="Paste a URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-600 outline-none text-sm"
          />
          <button
            onClick={handlePaste}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <HiClipboardDocument className="w-3.5 h-3.5" />
            Paste
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending || !url.trim()}
            className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <HiMagnifyingGlass
              className={cn("w-4 h-4", analyzeMutation.isPending && "animate-spin")}
            />
            {analyzeMutation.isPending ? "Preparing..." : "Analyze"}
          </button>
        </div>
      </motion.div>

      {/* Media Card */}
      <AnimatePresence mode="wait">
        {analyzeResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Your media is ready to download</p>
              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close result"
              >
                <HiXMark className="w-5 h-5" />
              </button>
            </div>
            <MediaPreview info={analyzeResult} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
