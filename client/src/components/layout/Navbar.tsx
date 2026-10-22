import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { user, isAuthenticated, handleLogout } = useAuth();
  const location = useLocation();

  const navLinks = isAuthenticated
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/history", label: "History" },
        { href: "/dashboard/favorites", label: "Favorites" },
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/about", label: "About" },
        { href: "/login", label: "Login" },
      ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-dark-border/30"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <span className="text-lg font-bold gradient-text">Universal Downloader</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location.pathname === link.href
                    ? "text-white bg-white/10"
                    : "text-dark-muted hover:text-white hover:bg-white/5"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard/settings"
                  className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white text-sm font-bold"
                >
                  {user?.name?.[0] || user?.email?.[0] || "?"}
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn-ghost text-sm"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/signup" className="btn-primary text-sm !px-4 !py-2">
                Get Started
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
