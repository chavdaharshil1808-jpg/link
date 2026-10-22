import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { setAccessToken, setRefreshToken, authApi } from "@/lib/api";
import { useAuthStore } from "@/stores";

type CallbackState = "loading" | "error" | "success";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [state, setState] = useState<CallbackState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const token = searchParams.get("token");
      const refreshToken = searchParams.get("refreshToken");
      const error = searchParams.get("error");

      if (error) {
        const messages: Record<string, string> = {
          google_auth_error: "Google authentication failed. Please try again.",
          google_failed: "Google login was unsuccessful. Please try again.",
          google_callback_error: "Something went wrong. Please try again.",
          access_denied: "You denied the Google login request.",
        };
        const msg = messages[error] || error.replace(/_/g, " ");
        if (!cancelled) { setErrorMsg(msg); setState("error"); }
        return;
      }

      if (!token) {
        if (!cancelled) { setErrorMsg("Missing authentication token."); setState("error"); }
        return;
      }

      try {
        setAccessToken(token);
        if (refreshToken) setRefreshToken(refreshToken);

        window.history.replaceState({}, "", "/auth/callback");

        const res = await authApi.me();
        const user = res.data.user;

        if (!cancelled) {
          setAuth(user);
          setState("success");
          toast.success("Signed in with Google!");
          setTimeout(() => navigate("/dashboard", { replace: true }), 500);
        }
      } catch (err: any) {
        console.error("[Auth Callback Error]", err);
        if (!cancelled) {
          setErrorMsg(err?.response?.data?.error || "Failed to verify login. Please try again.");
          setState("error");
        }
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [searchParams, navigate, setAuth]);

  if (state === "error") {
    return (
      <div className="min-h-screen bg-[#09090B] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-zinc-300 font-medium mb-1">Sign in failed</p>
          <p className="text-zinc-500 text-sm mb-6">{errorMsg}</p>
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-2.5 rounded-xl bg-[#6C5CE7] text-white font-medium hover:bg-[#5a4bd6] transition-all"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-zinc-700 border-t-[#6C5CE7] rounded-full animate-spin mx-auto mb-6" />
        <p className="text-zinc-400 text-sm">
          {state === "loading" ? "Signing you in with Google..." : "Redirecting..."}
        </p>
      </div>
    </div>
  );
}
