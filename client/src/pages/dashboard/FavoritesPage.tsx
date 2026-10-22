import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { favoritesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Favorite } from "@/types";
import {
  HiHeart,
  HiTrash,
  HiExclamationTriangle,
  HiArrowTopRightOnSquare,
  HiMusicalNote,
  HiTv,
  HiPhoto,
  HiGlobeAlt,
} from "react-icons/hi2";

export default function FavoritesPage() {
  const queryClient = useQueryClient();
  const [removeId, setRemoveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const res = await favoritesApi.list();
      return res.data as Favorite[];
    },
  });

  const removeMutation = useMutation({
    mutationFn: (url: string) => favoritesApi.remove(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Removed from favorites");
      setRemoveId(null);
    },
    onError: () => {
      toast.error("Failed to remove favorite");
      setRemoveId(null);
    },
  });

  const favorites = data || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-white mb-1">Favorites</h1>
        <p className="text-sm text-zinc-500 mb-5">
          Your saved media for quick access
        </p>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <HiHeart className="w-8 h-8 text-primary animate-pulse" />
        </div>
      ) : favorites.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-2xl p-12 text-center"
        >
          <HiHeart className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            No favorites yet
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Save media to your favorites for quick access later. Click the heart
            icon on any download to add it here.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {favorites.map((fav, i) => (
              <motion.div
                key={fav.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl overflow-hidden group"
              >
                <div className="relative aspect-video bg-dark-border/50">
                  {fav.thumbnail ? (
                    <img
                      src={fav.thumbnail}
                      alt={fav.title || "Thumbnail"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/5">
                      <HiTv className="w-10 h-10 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {fav.platform && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-primary/80 text-white text-[10px] font-semibold uppercase tracking-wider">
                      {fav.platform}
                    </span>
                  )}
                  <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={fav.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white hover:bg-white/20 transition-colors"
                    >
                      <HiArrowTopRightOnSquare className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setRemoveId(fav.id)}
                      className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <HiTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-medium text-white truncate mb-1">
                    {fav.title || "Untitled"}
                  </h4>
                  <p className="text-xs text-zinc-500 truncate">
                    {fav.url}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      <AnimatePresence>
        {removeId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setRemoveId(null)}
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
                  Remove Favorite
                </h3>
                <p className="text-sm text-zinc-400 text-center mb-6">
                  Are you sure you want to remove this from favorites?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRemoveId(null)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-sm hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const fav = favorites.find((f) => f.id === removeId);
                      if (fav) removeMutation.mutate(fav.url);
                    }}
                    disabled={removeMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {removeMutation.isPending ? "Removing..." : "Remove"}
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
