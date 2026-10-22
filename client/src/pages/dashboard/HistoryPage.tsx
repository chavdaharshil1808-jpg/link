import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { downloadApi, getApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DownloadInfo, Pagination } from "@/types";
import {
  HiMagnifyingGlass,
  HiTrash,
  HiChevronLeft,
  HiChevronRight,
  HiTv,
  HiMusicalNote,
  HiPhoto,
  HiDocument,
  HiArrowPath,
  HiExclamationTriangle,
  HiArrowDownTray,
  HiClock,
  HiXCircle,
  HiCheckCircle,
} from "react-icons/hi2";

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: "Pending",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/15",
    icon: <HiClock className="w-3 h-3" />,
  },
  ANALYZING: {
    label: "Analyzing",
    color: "text-blue-400",
    bgColor: "bg-blue-500/15",
    icon: <HiMagnifyingGlass className="w-3 h-3" />,
  },
  DOWNLOADING: {
    label: "Downloading",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
    icon: <HiArrowDownTray className="w-3 h-3" />,
  },
  COMPLETED: {
    label: "Completed",
    color: "text-green-400",
    bgColor: "bg-green-500/15",
    icon: <HiCheckCircle className="w-3 h-3" />,
  },
  FAILED: {
    label: "Failed",
    color: "text-red-400",
    bgColor: "bg-red-500/15",
    icon: <HiXCircle className="w-3 h-3" />,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "text-zinc-400",
    bgColor: "bg-zinc-500/15",
    icon: <HiXCircle className="w-3 h-3" />,
  },
};

const mediaIcons: Record<string, React.ReactNode> = {
  VIDEO: <HiTv className="w-4 h-4 text-blue-400" />,
  AUDIO: <HiMusicalNote className="w-4 h-4 text-purple-400" />,
  IMAGE: <HiPhoto className="w-4 h-4 text-green-400" />,
  PLAYLIST: <HiTv className="w-4 h-4 text-orange-400" />,
  SHORT: <HiTv className="w-4 h-4 text-pink-400" />,
  FILE: <HiDocument className="w-4 h-4 text-zinc-400" />,
  UNKNOWN: <HiDocument className="w-4 h-4 text-zinc-500" />,
};

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + "...";
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const limit = 15;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["downloads", "history", page, limit],
    queryFn: async () => {
      const res = await downloadApi.history(page, limit);
      return res.data as { downloads: DownloadInfo[]; pagination: Pagination };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => downloadApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads", "history"] });
      toast.success("Download deleted");
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Failed to delete download");
      setDeleteId(null);
    },
  });

  const downloads = data?.downloads || [];
  const pagination = data?.pagination;

  const filteredDownloads = search
    ? downloads.filter(
        (d) =>
          d.title?.toLowerCase().includes(search.toLowerCase()) ||
          d.url.toLowerCase().includes(search.toLowerCase())
      )
    : downloads;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-white mb-1">History</h1>
        <p className="text-sm text-zinc-500 mb-5">
          View your past downloads
        </p>

        {/* Search Bar */}
        <div className="flex items-center gap-3 bg-dark-card border border-dark-border/50 rounded-xl px-4 py-3">
          <HiMagnifyingGlass className="w-5 h-5 text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by title or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-600 outline-none text-sm"
          />
          {isFetching && (
            <HiArrowPath className="w-4 h-4 text-zinc-500 animate-spin" />
          )}
        </div>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <HiArrowPath className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredDownloads.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-2xl p-12 text-center"
        >
          <HiClock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            {search ? "No results found" : "No history yet"}
          </h3>
          <p className="text-sm text-zinc-500">
            {search
              ? "Try a different search term"
              : "Your download history will appear here"}
          </p>
        </motion.div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block glass rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border/30">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Media
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Title
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    URL
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Progress
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Date
                  </th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDownloads.map((item, i) => {
                  const status = statusConfig[item.status] || statusConfig.UNKNOWN;
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-dark-border/20 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3">
                        {mediaIcons[item.mediaType] || mediaIcons.UNKNOWN}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-white truncate max-w-[200px]">
                          {item.title || "Untitled"}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p
                          className="text-xs text-zinc-500 truncate max-w-[200px]"
                          title={item.url}
                        >
                          {truncateUrl(item.url)}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                            status.bgColor,
                            status.color
                          )}
                        >
                          {status.icon}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="w-20">
                          <div className="w-full h-1.5 rounded-full bg-dark-border/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-1">
                            {item.progress.toFixed(0)}%
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-xs text-zinc-500">
                          {timeAgo(item.createdAt)}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.status === "COMPLETED" && (
                            <>
                              <button
                                onClick={() => downloadApi.downloadFile(item.id, item.filename || undefined)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
                                title="Download"
                              >
                                <HiArrowDownTray className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => downloadApi.saveAs(item.id, item.filename || undefined)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700 transition-colors"
                                title="Save As"
                              >
                                <HiArrowDownTray className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setDeleteId(item.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredDownloads.map((item, i) => {
              const status = statusConfig[item.status] || statusConfig.UNKNOWN;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {mediaIcons[item.mediaType] || mediaIcons.UNKNOWN}
                      <p className="text-sm font-medium text-white truncate max-w-[160px]">
                        {item.title || "Untitled"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === "COMPLETED" && (
                        <button
                          onClick={() => downloadApi.downloadFile(item.id, item.filename || undefined)}
                          className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                          title="Download"
                        >
                          <HiArrowDownTray className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 truncate mb-2">
                    {truncateUrl(item.url, 40)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
                        status.bgColor,
                        status.color
                      )}
                    >
                      {status.icon}
                      {status.label}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  {item.status === "DOWNLOADING" && (
                    <div className="mt-3">
                      <div className="w-full h-1.5 rounded-full bg-dark-border/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Page {pagination.page} of {pagination.pages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg glass text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <HiChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.pages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= pagination.pages - 2) {
                    pageNum = pagination.pages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-9 h-9 rounded-lg text-sm font-medium transition-colors",
                        pageNum === page
                          ? "bg-primary/20 text-primary"
                          : "text-zinc-500 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page === pagination.pages}
                  className="p-2 rounded-lg glass text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <HiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div
                className="glass rounded-2xl p-6 max-w-sm w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                  <HiExclamationTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white text-center mb-2">
                  Delete Download
                </h3>
                <p className="text-sm text-zinc-400 text-center mb-6">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteId(null)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-sm hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(deleteId)}
                    disabled={deleteMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
