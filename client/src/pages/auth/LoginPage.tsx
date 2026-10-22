import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { authApi, setAccessToken, setRefreshToken, getApiError, SERVER_URL } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";
import { HiEye, HiEyeSlash } from "react-icons/hi2";


const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_auth_error: "Google authentication failed. Please try again.",
  google_failed: "Google login was unsuccessful.",
  google_callback_error: "Something went wrong. Please try again.",
  access_denied: "You denied the Google login request.",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [sendingMagic, setSendingMagic] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const msg = GOOGLE_ERROR_MESSAGES[error] || error.replace(/_/g, " ");
      toast.error(msg);
      window.history.replaceState({}, "", "/login");
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await authApi.login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe ?? false,
      });
      setAccessToken(res.data.accessToken);
      if (res.data.refreshToken) {
        setRefreshToken(res.data.refreshToken, { rememberMe: data.rememberMe ?? false });
      }
      setAuth(res.data.user);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(getApiError(err, "Invalid credentials"));
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicEmail) return;
    setSendingMagic(true);
    try {
      await authApi.magicLink({ email: magicEmail });
      setMagicSent(true);
      toast.success("Magic link sent! Check your inbox.");
    } catch (err: any) {
      toast.error(getApiError(err, "Failed to send magic link"));
    } finally {
      setSendingMagic(false);
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
          <h2 className="text-xl font-semibold mt-4">Welcome back</h2>
          <p className="text-zinc-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="glass rounded-2xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={cn(
                  "w-full bg-zinc-900/50 border rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 transition-all",
                  errors.email
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                    : "border-zinc-800 focus:border-[#6C5CE7] focus:ring-[#6C5CE7]"
                )}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className={cn(
                    "w-full bg-zinc-900/50 border rounded-xl px-4 py-3 pr-12 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 transition-all",
                    errors.password
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-800 focus:border-[#6C5CE7] focus:ring-[#6C5CE7]"
                  )}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? (
                    <HiEyeSlash className="text-xl" />
                  ) : (
                    <HiEye className="text-xl" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-[#6C5CE7] focus:ring-[#6C5CE7] focus:ring-offset-0"
                  {...register("rememberMe")}
                />
                <span className="text-sm text-zinc-400">Remember me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm text-[#6C5CE7] hover:text-[#5a4bd6] transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#6C5CE7] text-white font-semibold hover:bg-[#5a4bd6] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <button
            type="button"
            disabled={googleLoading}
            onClick={() => { setGoogleLoading(true); window.location.href = `${SERVER_URL}/api/auth/google`; }}
            className="w-full py-3 rounded-xl border border-zinc-700 bg-zinc-900/50 text-zinc-300 font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {magicSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/20 flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-6 h-6 text-[#00E5FF]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Check your inbox</p>
              <p className="text-xs text-zinc-500 mt-1">
                We sent a magic link to{" "}
                <span className="text-zinc-400">{magicEmail}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <p className="text-sm text-zinc-400">Or sign in with a magic link:</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#6C5CE7] focus:ring-1 focus:ring-[#6C5CE7] transition-all"
                />
                <button
                  type="submit"
                  disabled={sendingMagic || !magicEmail}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-all disabled:opacity-50"
                >
                  {sendingMagic ? "Sending..." : "Send Link"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            className="text-[#6C5CE7] hover:text-[#5a4bd6] transition-colors font-medium"
          >
            Sign up free
          </Link>
        </p>
        <p className="text-center text-xs text-zinc-600 mt-3">
          <Link to="/admin/login" className="hover:text-zinc-400 transition-colors">
            Admin Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
