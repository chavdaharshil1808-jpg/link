import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiShieldExclamation, HiArrowPath, HiCheckCircle, HiExclamationTriangle } from "react-icons/hi2";
import { BsInstagram } from "react-icons/bs";
import { instagramApi, getApiError } from "@/lib/api";

interface InstagramAuthRequiredProps {
  onAuthenticated: () => void;
  url: string;
}

export function InstagramAuthRequired({ onAuthenticated, url }: InstagramAuthRequiredProps) {
  const [step, setStep] = useState<"idle" | "launching" | "waiting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [browsers, setBrowsers] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const handleAuthenticate = useCallback(async () => {
    setStep("launching");
    setMessage("Opening Chrome for Instagram login...");
    try {
      const res = await instagramApi.authBrowser();
      const data = res.data;
      if (data.chromeOpened) {
        setStep("waiting");
        setMessage("A Chrome window has opened. Please log into Instagram in that window.");
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await instagramApi.authPoll();
            if (pollRes.data.authenticated) {
              if (pollRef.current) clearInterval(pollRef.current);
              setStep("success");
              setMessage("Instagram authenticated successfully!");
              setTimeout(onAuthenticated, 1500);
            }
          } catch {
            // continue polling
          }
        }, 2000);
      } else {
        setStep("error");
        setMessage("Could not launch Chrome automatically. Please export cookies manually.");
      }
    } catch (err: any) {
      setStep("error");
      setMessage(getApiError(err, "Failed to launch browser authentication"));
    }
  }, [onAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    instagramApi.authStatus().then((res) => {
      if (cancelled) return;
      setBrowsers(res.data.browsersAvailable || []);
      if (res.data.authenticated) {
        setStep("success");
        setMessage("Instagram session already authenticated!");
        setTimeout(onAuthenticated, 1000);
      }
    }).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      cancelled = true;
    };
  }, [onAuthenticated]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-pink-600/10 via-purple-600/10 to-blue-600/10" />
      <div className="absolute top-0 -left-40 w-80 h-80 bg-pink-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px]" />

      <div className="relative glass rounded-3xl p-8 border border-pink-500/20">
        <div className="flex flex-col items-center text-center max-w-lg mx-auto">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-pink-500/30"
          >
            <BsInstagram className="w-10 h-10 text-white" />
          </motion.div>

          <AnimatePresence mode="wait">
            {step === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium mb-2">
                  <HiShieldExclamation className="w-3.5 h-3.5" />
                  Authentication Required
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Instagram Login Required
                </h2>
                <p className="text-zinc-400 leading-relaxed">
                  This Instagram content requires an authenticated session to access.
                  We'll open your browser so you can log into Instagram securely.
                  Your credentials are never shared with this application.
                </p>

                <div className="glass rounded-2xl p-4 text-left space-y-2 mt-4">
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-400" />
                    Your password is never stored or transmitted
                  </p>
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-400" />
                    Uses your existing browser session
                  </p>
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-400" />
                    Cookies are stored locally only
                  </p>
                </div>

                {browsers.length === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
                    <HiExclamationTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-amber-300 text-left">
                      No supported browser detected. Install Chrome, Edge, or Firefox, or manually
                      export Instagram cookies using the "Get cookies.txt LOCALLY" extension.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleAuthenticate}
                  disabled={browsers.length === 0}
                  className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold py-3.5 rounded-2xl hover:shadow-lg hover:shadow-pink-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <BsInstagram className="w-5 h-5" />
                  Authenticate via Browser
                </button>

                <p className="text-xs text-zinc-600">
                  Supported browsers: {browsers.length > 0 ? browsers.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(", ") : "Chrome, Edge, Firefox"}
                </p>
              </motion.div>
            )}

            {step === "launching" && (
              <motion.div
                key="launching"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center py-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <BsInstagram className="w-12 h-12 text-pink-400" />
                </motion.div>
                <p className="text-zinc-300 mt-4">{message}</p>
              </motion.div>
            )}

            {step === "waiting" && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center py-8 space-y-4"
              >
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center"
                  >
                    <BsInstagram className="w-8 h-8 text-white" />
                  </motion.div>
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-dark-bg"
                  />
                </div>
                <p className="text-zinc-300">{message}</p>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <HiArrowPath className="w-4 h-4 animate-spin" />
                  Waiting for Instagram login...
                </div>
                <div className="glass rounded-2xl p-4 text-left w-full space-y-2 mt-2">
                  <p className="text-sm text-zinc-400">
                    1. Look for the Chrome window that just opened
                  </p>
                  <p className="text-sm text-zinc-400">
                    2. If not already logged in, enter your Instagram credentials
                  </p>
                  <p className="text-sm text-zinc-400">
                    3. After logging in, come back here — we'll detect your session automatically
                  </p>
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-4"
                >
                  <HiCheckCircle className="w-10 h-10 text-white" />
                </motion.div>
                <p className="text-xl font-semibold text-white">Authentication Successful!</p>
                <p className="text-zinc-400 mt-1">Redirecting to download...</p>
              </motion.div>
            )}

            {step === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 py-4"
              >
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                  <HiExclamationTriangle className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-red-400">{message}</p>
                <button
                  onClick={handleAuthenticate}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold py-3 rounded-2xl hover:shadow-lg active:scale-[0.98] transition-all"
                >
                  <HiArrowPath className="w-4 h-4" />
                  Try Again
                </button>
                <p className="text-xs text-zinc-600">
                  Alternatively, export cookies manually using the "Get cookies.txt LOCALLY" Chrome extension
                  and save to <code className="text-zinc-400">cookies.txt</code> in the project root.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
