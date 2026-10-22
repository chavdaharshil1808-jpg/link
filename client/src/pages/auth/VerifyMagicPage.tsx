import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi, setAccessToken, setRefreshToken } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";
import { HiCheckCircle, HiXCircle } from "react-icons/hi2";

export default function VerifyMagicPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMessage("No magic link token found. Please request a new link.");
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const res = await authApi.verifyMagic(token);
        if (cancelled) return;
        setAccessToken(res.data.accessToken);
        if (res.data.refreshToken) setRefreshToken(res.data.refreshToken);
        setAuth(res.data.user);
        setStatus("success");
        toast.success("Signed in successfully!");
        setTimeout(() => navigate("/dashboard"), 1500);
      } catch (err: any) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err?.response?.data?.message || "Invalid or expired magic link."
        );
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="min-h-screen bg-[#09090B] text-white flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#6C5CE7]/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent">
              Universal Downloader
            </h1>
          </Link>
        </div>

        <div className="glass rounded-2xl p-8 text-center">
          {status === "loading" && (
            <div className="py-8">
              <div className="w-12 h-12 border-3 border-zinc-700 border-t-[#6C5CE7] rounded-full animate-spin mx-auto mb-6" />
              <p className="text-zinc-400 text-sm">Verifying your magic link...</p>
            </div>
          )}

          {status === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8"
            >
              <HiCheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">You are signed in!</h2>
              <p className="text-zinc-500 text-sm">Redirecting you to the dashboard...</p>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8"
            >
              <HiXCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
              <p className="text-zinc-500 text-sm mb-6">{errorMessage}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/magic-link"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-[#6C5CE7] text-white text-sm font-semibold hover:bg-[#5a4bd6] transition-all"
                >
                  Request New Link
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all"
                >
                  Back to Login
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
