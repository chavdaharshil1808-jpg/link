import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HiMagnifyingGlass, HiTrash, HiExclamationTriangle, HiChevronLeft, HiChevronRight, HiArrowPath } from "react-icons/hi2";

interface AdminUser {
  id: string; email: string; name: string | null; role: string;
  provider: string; emailVerified: boolean; createdAt: string;
  downloadCount: number;
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const limit = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: async () => { const res = await adminApi.users(page, limit, search); return res.data; },
  });

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => adminApi.toggleUser(userId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("User status toggled"); },
    onError: () => toast.error("Failed to toggle user"),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("User deleted"); setDeleteId(null); },
    onError: () => toast.error("Failed to delete user"),
  });

  const users: AdminUser[] = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">User Management</h1>
        <p className="text-sm text-zinc-500 mb-5">Manage registered users</p>
        <div className="flex items-center gap-3 bg-dark-card border border-dark-border/50 rounded-xl px-4 py-3">
          <HiMagnifyingGlass className="w-5 h-5 text-zinc-500 shrink-0" />
          <input type="text" placeholder="Search by name or email..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-600 outline-none text-sm" />
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><HiArrowPath className="w-8 h-8 text-primary animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-zinc-500">No users found</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block glass rounded-2xl overflow-hidden border border-white/5">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border/30">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Provider</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Downloads</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Joined</th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <motion.tr key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-dark-border/20 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3"><p className="text-sm font-medium text-white">{u.name || "—"}</p></td>
                    <td className="px-5 py-3"><p className="text-sm text-zinc-400">{u.email}</p></td>
                    <td className="px-5 py-3">
                      <span className={cn("px-2 py-1 rounded-md text-xs font-medium", u.role === "ADMIN" ? "bg-purple-500/15 text-purple-400" : "bg-zinc-500/15 text-zinc-400")}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3"><span className="text-sm text-zinc-400 capitalize">{u.provider}</span></td>
                    <td className="px-5 py-3"><span className="text-sm text-zinc-400">{u.downloadCount}</span></td>
                    <td className="px-5 py-3"><span className="text-xs text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</span></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleMutation.mutate(u.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                        >Toggle</button>
                        <button onClick={() => setDeleteId(u.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        ><HiTrash className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {users.map((u) => (
              <div key={u.id} className="glass rounded-xl p-4 border border-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white">{u.name || "Unnamed"}</p>
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  </div>
                  <button onClick={() => setDeleteId(u.id)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><HiTrash className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className={cn("px-2 py-0.5 rounded-md", u.role === "ADMIN" ? "bg-purple-500/15 text-purple-400" : "bg-zinc-500/15 text-zinc-400")}>{u.role}</span>
                  <span>{u.downloadCount} downloads</span>
                  <span>{new Date(u.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
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

      <AnimatePresence>
        {deleteId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50" onClick={() => setDeleteId(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                  <HiExclamationTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white text-center mb-2">Delete User</h3>
                <p className="text-sm text-zinc-400 text-center mb-6">This will permanently delete this user and all associated data.</p>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
                  <button onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50">{deleteMutation.isPending ? "Deleting..." : "Delete"}</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
