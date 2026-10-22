import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { cn, formatFileSize } from "@/lib/utils";
import { HiChevronLeft, HiChevronRight, HiArrowPath, HiClock, HiCheckCircle, HiXCircle } from "react-icons/hi2";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  COMPLETED: { label: "Completed", color: "text-green-400", bgColor: "bg-green-500/15" },
  DOWNLOADING: { label: "Downloading", color: "text-cyan-400", bgColor: "bg-cyan-500/15" },
  FAILED: { label: "Failed", color: "text-red-400", bgColor: "bg-red-500/15" },
  CANCELLED: { label: "Cancelled", color: "text-zinc-400", bgColor: "bg-zinc-500/15" },
  PENDING: { label: "Pending", color: "text-yellow-400", bgColor: "bg-yellow-500/15" },
  ANALYZING: { label: "Analyzing", color: "text-blue-400", bgColor: "bg-blue-500/15" },
};

export default function AdminDownloads() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "downloads", page],
    queryFn: async () => { const res = await adminApi.downloads(page, limit); return res.data; },
  });

  const downloads = data?.downloads || [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Download Logs</h1>
        <p className="text-sm text-zinc-500">View all downloads across the platform</p>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><HiArrowPath className="w-8 h-8 text-primary animate-spin" /></div>
      ) : downloads.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center"><p className="text-zinc-500">No downloads yet</p></div>
      ) : (
        <>
          <div className="hidden md:block glass rounded-2xl overflow-hidden border border-white/5">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border/30">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">User</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Title</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Format</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Size</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {downloads.map((d: any, i: number) => {
                  const st = statusConfig[d.status] || statusConfig.PENDING;
                  return (
                    <motion.tr key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      className="border-b border-dark-border/20 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="text-sm text-zinc-300">{d.user?.name || d.user?.email || "—"}</p>
                      </td>
                      <td className="px-5 py-3"><span className="text-sm text-zinc-400 capitalize">{d.platform || "—"}</span></td>
                      <td className="px-5 py-3"><p className="text-sm text-white truncate max-w-[200px]" title={d.title || ""}>{d.title || "Untitled"}</p></td>
                      <td className="px-5 py-3"><span className="text-xs text-zinc-500">{d.format || "—"}</span></td>
                      <td className="px-5 py-3"><span className="text-xs text-zinc-500">{d.fileSize ? formatFileSize(d.fileSize) : "—"}</span></td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium", st.bgColor, st.color)}>{st.label}</span>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs text-zinc-500">{new Date(d.createdAt).toLocaleString()}</span></td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {downloads.map((d: any) => {
              const st = statusConfig[d.status] || statusConfig.PENDING;
              return (
                <div key={d.id} className="glass rounded-xl p-4 border border-white/5">
                  <p className="text-sm font-medium text-white truncate mb-1">{d.title || "Untitled"}</p>
                  <p className="text-xs text-zinc-500 mb-2">{d.user?.email || "—"} · {d.platform || "—"}</p>
                  <div className="flex items-center justify-between">
                    <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", st.bgColor, st.color)}>{st.label}</span>
                    <span className="text-xs text-zinc-600">{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">Page {pagination.page} of {pagination.pages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 rounded-lg glass text-zinc-400 hover:text-white disabled:opacity-40"><HiChevronLeft className="w-4 h-4" /></button>
                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  let pn = pagination.pages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= pagination.pages - 2 ? pagination.pages - 4 + i : page - 2 + i;
                  return <button key={pn} onClick={() => setPage(pn)}
                    className={cn("w-9 h-9 rounded-lg text-sm font-medium transition-colors", pn === page ? "bg-primary/20 text-primary" : "text-zinc-500 hover:text-white hover:bg-white/5")}>{pn}</button>;
                })}
                <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
                  className="p-2 rounded-lg glass text-zinc-400 hover:text-white disabled:opacity-40"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
