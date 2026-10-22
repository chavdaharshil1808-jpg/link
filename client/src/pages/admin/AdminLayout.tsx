import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminStore } from "@/stores";
import { setAdminAccessToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  HiHome, HiUsers, HiArrowDownTray, HiChartBar,
  HiBars3, HiXMark, HiArrowRightOnRectangle, HiShieldCheck,
} from "react-icons/hi2";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: HiHome, end: true },
  { to: "/admin/users", label: "Users", icon: HiUsers, end: false },
  { to: "/admin/downloads", label: "Downloads", icon: HiArrowDownTray, end: false },
];

export default function AdminLayout() {
  const { adminUser, logout } = useAdminStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    setAdminAccessToken(null);
    logout();
  };

  return (
    <div className="min-h-screen bg-dark-bg flex">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 glass border-r border-dark-border/30 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between h-16 px-5 border-b border-dark-border/30">
          <NavLink to="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <HiShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">Admin Panel</span>
          </NavLink>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive ? "bg-purple-500/15 text-purple-400 border border-purple-500/20" : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-dark-border/30">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {adminUser?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">Admin</p>
              <p className="text-xs text-zinc-500 truncate">{adminUser?.email}</p>
            </div>
          </div>
          <NavLink to="/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors mb-1">
            <HiArrowDownTray className="w-4 h-4" />
            Main Dashboard
          </NavLink>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <HiArrowRightOnRectangle className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center h-14 px-4 glass border-b border-dark-border/30 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <HiBars3 className="w-5 h-5" />
          </button>
          <span className="ml-3 text-sm font-semibold text-purple-400">Admin Panel</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
