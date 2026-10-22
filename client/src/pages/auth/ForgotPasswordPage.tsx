import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HiEnvelope } from "react-icons/hi2";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
      toast.success("Password reset link sent!");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send reset link");
    } finally {
      setSending(false);
    }
  };

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
          <h2 className="text-xl font-semibold mt-4">Reset your password</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Enter your email and we will send you a link to reset your password.
          </p>
        </div>

        <div className="glass rounded-2xl p-8">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/20 flex items-center justify-center mx-auto mb-6">
                <HiEnvelope className="text-3xl text-[#00E5FF]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Check your inbox</h3>
              <p className="text-zinc-400 text-sm mb-6">
                If an account exists for{" "}
                <span className="text-zinc-300 font-medium">{email}</span>, we
                sent a password reset link.
              </p>
              <p className="text-zinc-600 text-xs mb-6">
                Didn&apos;t get it? Check your spam folder or{" "}
                <button
                  onClick={() => setSent(false)}
                  className="text-[#6C5CE7] hover:underline"
                >
                  try again
                </button>
                .
              </p>
              <Link
                to="/login"
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Back to sign in
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <HiEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-lg" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C5CE7] focus:ring-1 focus:ring-[#6C5CE7] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={sending || !email}
                className="w-full py-3 rounded-xl bg-[#6C5CE7] text-white font-semibold hover:bg-[#5a4bd6] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Remember your password?{" "}
          <Link
            to="/login"
            className="text-[#6C5CE7] hover:text-[#5a4bd6] transition-colors font-medium"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
