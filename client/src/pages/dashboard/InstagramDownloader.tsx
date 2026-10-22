import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { instagramApi, downloadApi, getApiError } from "@/lib/api";
import { isValidUrl, cn } from "@/lib/utils";
import { InstagramAuthRequired } from "@/components/instagram/InstagramAuthRequired";
import { MediaPreview } from "@/components/download/MediaPreview";
import { BsInstagram } from "react-icons/bs";
import {
  HiMagnifyingGlass,
  HiClipboardDocument,
  HiCheckCircle,
  HiExclamationTriangle,
  HiArrowPath,
} from "react-icons/hi2";
import type { AnalyzeResult } from "@/types";

type PageState = "input" | "auth_required" | "analyzing" | "preview" | "error";

export default function InstagramDownloader() {
  const [url, setUrl] = useState("");
  const [pageState, setPageState] = useState<PageState>("input");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isInstagramUrl, setIsInstagramUrl] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [analyzingMessage, setAnalyzingMessage] = useState(
    "Extracting media information..."
  );

  const checkUrl = useCallback((value: string) => {
    setIsInstagramUrl(/instagram\.com\/(?:reel|p|tv|stories)\//i.test(value));
  }, []);

  const analyzeMutation = useMutation({
    mutationFn: async (analyzeUrl: string) => {
      const res = await instagramApi.analyze(analyzeUrl);
      return res.data;
    },
    onSuccess: (data) => {
      setAnalyzeResult(data);
      setPageState("preview");
      toast.success("Media analyzed successfully");
    },
    onError: (err: any) => {
      const msg = getApiError(err, "Failed to analyze Instagram URL");
      if (
        msg.toLowerCase().includes("login") ||
        msg.toLowerCase().includes("sign in") ||
        msg.toLowerCase().includes("authentication") ||
        msg.toLowerCase().includes("sessionid")
      ) {
        if (retryCount < 1) {
          setRetryCount((c) => c + 1);
          setAnalyzingMessage("Authentication required. Checking for browser cookies...");
          instagramApi
            .authStatus()
            .then((res) => {
              if (!res.data.authenticated) {
                setPageState("auth_required");
              } else {
                setAnalyzingMessage("Retrying extraction with cookies...");
                setTimeout(() => analyzeMutation.mutate(url), 1000);
              }
            })
            .catch(() => {
              setPageState("auth_required");
            });
          return;
        }
        setPageState("auth_required");
        return;
      }
      setPageState("error");
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      checkUrl(text);
    } catch {
      toast.error("Failed to read clipboard");
    }
  }, [checkUrl]);

  const handleAnalyze = () => {
    if (!url.trim()) {
      toast.error("Please enter an Instagram URL");
      return;
    }
    if (!isValidUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }
    setRetryCount(0);
    setPageState("analyzing");
    setAnalyzingMessage("Extracting media information...");
    analyzeMutation.mutate(url);
  };

  const handleAuthSuccess = () => {
    setPageState("analyzing");
    setAnalyzingMessage("Authentication successful. Extracting media...");
    analyzeMutation.mutate(url);
  };

  const handleDownload = useCallback(async (mediaUrl: string, formatSpec: string) => {
    try {
      await downloadApi.fetchMedia(mediaUrl, formatSpec);
      toast.success("Download started");
    } catch (err: any) {
      const msg = getApiError(err, "Failed to download media");
      setPageState("error");
      setErrorMsg(msg);
      toast.error(msg);
    }
  }, []);

  const handleReset = () => {
    setPageState("input");
    setAnalyzeResult(null);
    setErrorMsg("");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <AnimatePresence mode="wait">
        {/* Input Stage */}
        {pageState === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <div className="glass rounded-3xl p-6 border border-pink-500/10 relative overflow-hidden">
              <div className="absolute top-0 -right-20 w-40 h-40 bg-pink-500/10 rounded-full blur-[80px]" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                    <BsInstagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Instagram Downloader</h1>
                    <p className="text-xs text-zinc-500">Download Reels, Posts & Videos</p>
                  </div>
                </div>

                <div className="mt-5 mb-4">
                  <div
                    className={cn(
                      "flex items-center gap-3 bg-dark-border/40 rounded-2xl px-5 py-3.5 transition-all duration-200 border",
                      isFocused
                        ? "border-pink-500/50 ring-1 ring-pink-500/20"
                        : "border-transparent"
                    )}
                  >
                    <BsInstagram className="w-5 h-5 text-zinc-500 shrink-0" />
                    <input
                      type="url"
                      placeholder="Paste Instagram URL (reel, post, or story)..."
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        checkUrl(e.target.value);
                      }}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      className="flex-1 bg-transparent text-white placeholder:text-zinc-600 outline-none text-sm"
                    />
                    <button
                      onClick={handlePaste}
                      className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors shrink-0"
                    >
                      <HiClipboardDocument className="w-3.5 h-3.5" />
                      Paste
                    </button>
                    <button
                      onClick={handleAnalyze}
                      disabled={!url.trim()}
                      className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <HiMagnifyingGlass className="w-4 h-4" />
                      Analyze
                    </button>
                  </div>
                </div>

                {isInstagramUrl && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex items-center gap-2 text-xs text-pink-400/80"
                  >
                    <HiCheckCircle className="w-3.5 h-3.5" />
                    Instagram URL detected
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Auth Required */}
        {pageState === "auth_required" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <InstagramAuthRequired onAuthenticated={handleAuthSuccess} url={url} />
          </motion.div>
        )}

        {/* Analyzing */}
        {pageState === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <div className="glass rounded-3xl p-8 flex flex-col items-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-4"
              >
                <BsInstagram className="w-8 h-8 text-white" />
              </motion.div>
              <p className="text-white font-medium">{analyzingMessage}</p>
              <div className="w-64 h-1.5 bg-dark-border/60 rounded-full mt-4 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Preview with single download button */}
        {pageState === "preview" && analyzeResult && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Best quality ready</p>
              <button
                onClick={handleReset}
                className="text-sm text-zinc-500 hover:text-zinc-300 py-1.5 px-3 rounded-xl glass-hover transition-colors"
              >
                Cancel
              </button>
            </div>
            <MediaPreview
              info={analyzeResult}
              onDownload={handleDownload}
              streamUrl={downloadApi.streamUrl}
            />
          </motion.div>
        )}

        {/* Error */}
        {pageState === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="max-w-lg mx-auto"
          >
            <div className="glass rounded-3xl p-8 border border-red-500/20 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <HiExclamationTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Download Failed</h3>
              <p className="text-sm text-zinc-400 mb-6">{errorMsg}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:shadow-lg active:scale-[0.98] transition-all"
                >
                  <HiArrowPath className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
