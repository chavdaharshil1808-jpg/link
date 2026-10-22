import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores";
import { authApi, clearSessionTokens } from "@/lib/api";

export function useAuth() {
  const { user, isAuthenticated, setAuth, setUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setAuth(data.user);
    } catch {
      logout();
      clearSessionTokens();
    }
  }, [setAuth, logout]);

  useEffect(() => {
    if (isAuthenticated && !user) {
      checkAuth();
    }
  }, [isAuthenticated, user, checkAuth]);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // silent
    } finally {
      logout();
      clearSessionTokens();
      navigate("/login");
    }
  }, [logout, navigate]);

  return { user, isAuthenticated, handleLogout };
}
