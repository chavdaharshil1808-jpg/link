import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/utils";
import { downloadApi } from "@/lib/api";
import { ProgressBar } from "./ProgressBar";
import {
  HiXMark,
  HiArrowPath,
  HiMusicalNote,
  HiTv,
  HiPhoto,
  HiDocument,
  HiArrowDownTray,
} from "react-icons/hi2";

interface DownloadCardProps {
  download: {
    id: string;
    title: string | null;
    thumbnail: string | null;
    url: string;
    mediaType: string;
    status: string;
    progress: number;
    speed: number | null;
    eta: number | null;
    errorMsg: string | null;
    format: string | null;
    quality: string | null;
    fileSize: number | null;
    filename?: string | null;
    downloadUrl?: string | null;
  };
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const mediaIcons: Record<string, React.ReactNode> = {
  VIDEO: <HiTv className="w-4 h-4" />,
  AUDIO: <HiMusicalNote className="w-4 h-4" />,
  IMAGE: <HiPhoto className="w-4 h-4" />,
  PLAYLIST: <HiTv className="w-4 h-4" />,
  SHORT: <HiTv className="w-4 h-4" />,
  FILE: <HiDocument className="w-4 h-4" />,
  UNKNOWN: <HiDocument className="w-4 h-4" />,
};

export function DownloadCard({ download, onCancel, onRetry }: DownloadCardProps) {
  const isActive = download.status === "DOWNLOADING";
  const isFailed = download.status === "FAILED";
  const isCancelled = download.status === "CANCELLED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "glass rounded-xl p-4 flex gap-4",
        isActive && "border-primary/30"
      )}
    >
      {download.thumbnail && (
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-dark-border/50">
          <img
            src={download.thumbnail}
            alt={download.title || "Thumbnail"}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-white truncate">
              {download.title || "Untitled"}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                {mediaIcons[download.mediaType] || mediaIcons.UNKNOWN}
                {download.mediaType}
              </span>
              {download.format && (
                <span className="text-xs text-zinc-600">
                  {download.format}
                  {download.quality && ` ${download.quality}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isFailed && onRetry && (
              <button
                onClick={() => onRetry(download.id)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Retry"
              >
                <HiArrowPath className="w-4 h-4" />
              </button>
            )}
            {(isActive || download.status === "PENDING" || download.status === "ANALYZING") && onCancel && (
              <button
                onClick={() => onCancel(download.id)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Cancel"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <ProgressBar
          progress={download.progress}
          speed={download.speed}
          eta={download.eta}
          status={download.status}
          showDetails={isActive || download.status === "PENDING"}
        />
        {isFailed && download.errorMsg && (
          <p className="text-xs text-red-400 mt-2">{download.errorMsg}</p>
        )}
        {download.status === "COMPLETED" && (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => downloadApi.downloadFile(download.id, download.filename || undefined)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
            >
              <HiArrowDownTray className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => downloadApi.saveAs(download.id, download.filename || undefined)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700 transition-colors"
            >
              Save As
            </button>
          </div>
        )}
        {download.fileSize != null && (
          <p className="text-xs text-zinc-500 mt-1">
            {formatFileSize(download.fileSize)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
