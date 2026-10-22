import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { HiUsers, HiArrowDownTray, HiGlobeAlt, HiArrowPath, HiChartBar } from "react-icons/hi2";

interface AdminStats {
  totalUsers: number; activeUsers: number; totalDownloads: number;
  downloadsToday: number; downloadsWeek: number; topPlatform: string;
  platforms: { platform: string; count: number }[];
}

const statCards = [
  { key: "totalUsers", label: "Total Users", icon: HiUsers, color: "text-blue-400", bg: "bg-blue-500/15", suffix: "" },
  { key: "activeUsers", label: "Active Sessions", icon: HiChartBar, color: "text-green-400", bg: "bg-green-500/15", suffix: "" },
  { key: "totalDownloads", label: "Total Downloads", icon: HiArrowDownTray, color: "text-purple-400", bg: "bg-purple-500/15", suffix: "" },
  { key: "downloadsToday", label: "Downloads Today", icon: HiGlobeAlt, color: "text-cyan-400", bg: "bg-cyan-500/15", suffix: "" },
  { key: "downloadsWeek", label: "Downloads This Week", icon: HiChartBar, color: "text-yellow-400", bg: "bg-yellow-500/15", suffix: "" },
];

export default function AdminDashboard() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => { const res = await adminApi.dashboard(); return res.data as AdminStats; },
  });

  const { data: analytics } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: async () => { const res = await adminApi.analytics(); return res.data; },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><HiArrowPath className="w-8 h-8 text-primary animate-spin" /></div>;
  }

  const chartData = analytics?.[period];
  const maxVal = chartData ? Math.max(...chartData.data, 1) : 1;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Admin Dashboard</h1>
        <p className="text-sm text-zinc-500">Overview of your platform</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => {
          const value = (data as any)?.[card.key] ?? 0;
          const display = typeof value === "number" ? formatNumber(value) : String(value);
          return (
            <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-5 border border-white/5"
            >
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{display}</p>
              <p className="text-xs text-zinc-500 mt-1">{card.label}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 border border-white/5"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-white">Download Analytics</h2>
            <div className="flex gap-1 p-1 bg-dark-border/40 rounded-lg">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", period === p ? "bg-primary/20 text-primary" : "text-zinc-500 hover:text-zinc-300")}
                >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          {chartData && (
            <div className="space-y-2">
              {chartData.labels.map((label: string, i: number) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-20 shrink-0">{label}</span>
                  <div className="flex-1 h-6 rounded-lg bg-dark-border/40 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(chartData.data[i] / maxVal) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className="h-full rounded-lg bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF]"
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-10 text-right">{chartData.data[i]}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass rounded-2xl p-6 border border-white/5"
        >
          <h2 className="text-base font-semibold text-white mb-4">Platform Statistics</h2>
          {data?.platforms && data.platforms.length > 0 ? (
            <div className="space-y-3">
              {data.platforms.slice(0, 8).map((p, i) => {
                const total = data.platforms.reduce((a, b) => a + b.count, 0);
                const pct = total > 0 ? (p.count / total) * 100 : 0;
                return (
                  <div key={p.platform} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 w-24 shrink-0 capitalize">{p.platform || "Unknown"}</span>
                    <div className="flex-1 h-6 rounded-lg bg-dark-border/40 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.05 }}
                        className="h-full rounded-lg bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF]"
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-16 text-right">{formatNumber(p.count)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-8">No platform data yet</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
