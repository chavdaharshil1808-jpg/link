import { useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import type { AnalyzeResult } from "@/types";
import { downloadApi, getApiError } from "@/lib/api";
import {
  HiMusicalNote,
  HiGlobeAlt,
  HiArrowDownTray,
  HiArrowPath,
} from "react-icons/hi2";

interface SpotifyCardProps {
  info: AnalyzeResult;
}

export function SpotifyCard({ info }: SpotifyCardProps) {
  const [imgError, setImgError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const hasArt = !imgError && Boolean(info.thumbnail);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await downloadApi.prepare(info.url);
      const data = res.data;
      downloadApi.preparedDownload(data.downloadUrl, data.filename || undefined);
      toast.success("Download started");
    } catch (err) {
      toast.error(getApiError(err, "Failed to download track"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="relative aspect-square sm:aspect-video bg-gradient-to-br from-green-500/20 to-[#1DB954]/5">
        {hasArt ? (
          <img
            src={info.thumbnail}
            alt={info.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HiMusicalNote className="w-16 h-16 text-[#1DB954]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-[#1DB954]CC">
          Spotify
        </span>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-semibold text-white line-clamp-2 mb-1">
          {info.title}
        </h3>
        {info.uploader && info.uploader !== "Unknown" && (
          <p className="text-sm text-zinc-400 mb-4">{info.uploader}</p>
        )}

        <div className="flex items-start gap-3 rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-4">
          <HiMusicalNote className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 leading-relaxed">
            <p className="font-medium text-white mb-1">
              Downloads as MP3
            </p>
            <p>
              Spotify streams are DRM-protected, so we find the matching audio
              on YouTube Music and tag it with title, artist, and cover art.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 bg-[#1DB954] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <HiArrowPath className="w-4 h-4 animate-spin" />
          ) : (
            <HiArrowDownTray className="w-4 h-4" />
          )}
          {downloading ? "Preparing MP3..." : "Download"}
        </button>

        {info.platformUrl && (
          <a
            href={info.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full flex items-center justify-center gap-2 border border-white/10 text-white font-semibold py-3 rounded-xl hover:bg-white/5 transition-colors"
          >
            <HiGlobeAlt className="w-4 h-4" />
            Open in Spotify
          </a>
        )}
      </div>
    </motion.div>
  );
}
