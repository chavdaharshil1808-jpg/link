import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useAuthStore, useAdminStore } from "@/stores";
import { setAccessToken, setOnTokenRefreshed, setAdminAccessToken, restoreSession } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import LandingPage from "@/pages/public/LandingPage";
import AboutPage from "@/pages/public/AboutPage";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import MagicLinkPage from "@/pages/auth/MagicLinkPage";
import VerifyMagicPage from "@/pages/auth/VerifyMagicPage";
import AuthCallbackPage from "@/pages/auth/AuthCallbackPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import DownloadsPage from "@/pages/dashboard/DownloadsPage";
import HistoryPage from "@/pages/dashboard/HistoryPage";
import FavoritesPage from "@/pages/dashboard/FavoritesPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import ProfilePage from "@/pages/dashboard/ProfilePage";
import InstagramDownloader from "@/pages/dashboard/InstagramDownloader";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminDownloads from "@/pages/admin/AdminDownloads";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
import NotFoundPage from "@/pages/public/NotFoundPage";

function AuthInitializer() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);
  const isSessionReady = useAuthStore((s) => s.isSessionReady);
  const setSessionReady = useAuthStore((s) => s.setSessionReady);
  const adminToken = useAdminStore((s) => s.adminToken);

  useEffect(() => {
    if (adminToken) {
      setAdminAccessToken(adminToken);
    }
  }, [adminToken]);

  useEffect(() => {
    if (isSessionReady) return;
    let cancelled = false;
    restoreSession().then(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isSessionReady, setSessionReady]);

  useEffect(() => {
    setOnTokenRefreshed((newToken) => {
      setAccessToken(newToken);
      if (user) setAuth(user);
    });
    return () => setOnTokenRefreshed(null);
  }, [user, setAuth]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

function FullPageLoader() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-3 border-zinc-700 border-t-[#6C5CE7] rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Restoring your session...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSessionReady = useAuthStore((s) => s.isSessionReady);
  if (!isSessionReady) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAdminAuthenticated = useAdminStore((s) => s.isAdminAuthenticated);
  if (!isAdminAuthenticated) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSessionReady = useAuthStore((s) => s.isSessionReady);
  if (!isSessionReady) return <FullPageLoader />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer />
        <div className="min-h-screen bg-dark-bg">
          <div className="bg-animated" />
          <Routes>
            <Route
              path="/"
              element={<LandingPage />}
            />
            <Route
              path="/about"
              element={
                <>
                  <Navbar />
                  <AboutPage />
                </>
              }
            />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <SignupPage />
                </GuestRoute>
              }
            />
            <Route
              path="/magic-link"
              element={
                <GuestRoute>
                  <MagicLinkPage />
                </GuestRoute>
              }
            />
            <Route
              path="/auth/verify-magic"
              element={<VerifyMagicPage />}
            />
            <Route
              path="/auth/callback"
              element={<AuthCallbackPage />}
            />
            <Route
              path="/forgot-password"
              element={
                <GuestRoute>
                  <ForgotPasswordPage />
                </GuestRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DownloadsPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
              <Route path="instagram" element={<InstagramDownloader />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route
              path="/admin/login"
              element={
                <GuestRoute>
                  <AdminLoginPage />
                </GuestRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminProtectedRoute>
                  <AdminLayout />
                </AdminProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="downloads" element={<AdminDownloads />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#18181B",
              color: "#FFFFFF",
              border: "1px solid #27272A",
              borderRadius: "12px",
            },
            success: {
              iconTheme: { primary: "#22C55E", secondary: "#18181B" },
            },
            error: {
              iconTheme: { primary: "#EF4444", secondary: "#18181B" },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
