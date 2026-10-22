import { useState } from "react";
import { motion } from "framer-motion";
import { cn, formatFileSize } from "@/lib/utils";
import { downloadApi, getApiError } from "@/lib/api";
import toast from "react-hot-toast";
import type { AnalyzeResult, DriveFileInfo } from "@/types";
import {
  HiFolder,
  HiArrowDownTray,
  HiArrowPath,
  HiMusicalNote,
  HiTv,
  HiPhoto,
  HiDocumentText,
  HiArchiveBox,
  HiDocumentArrowDown,
  HiShieldExclamation,
} from "react-icons/hi2";

interface DriveFolderViewProps {
  info: AnalyzeResult;
  /** Single-file download. Defaults to downloadApi.fetchMedia. */
  onDownload?: (url: string, formatSpec: string) => Promise<void>;
  /** Download an entire folder as a ZIP. Defaults to downloadApi.fetchMedia with driveAll. */
  onDownloadAll?: (folderUrl: string) => Promise<void>;
}

const mediaTypeIcons: Record<string, React.ReactNode> = {
  VIDEO: <HiTv className="w-4 h-4" />,
  AUDIO: <HiMusicalNote className="w-4 h-4" />,
  IMAGE: <HiPhoto className="w-4 h-4" />,
  DOCUMENT: <HiDocumentText className="w-4 h-4" />,
  ARCHIVE: <HiArchiveBox className="w-4 h-4" />,
  FOLDER: <HiFolder className="w-4 h-4" />,
};

const mediaTypeColors: Record<string, string> = {
  VIDEO: "text-blue-400 bg-blue-500/15",
  AUDIO: "text-purple-400 bg-purple-500/15",
  IMAGE: "text-green-400 bg-green-500/15",
  DOCUMENT: "text-amber-400 bg-amber-500/15",
  ARCHIVE: "text-orange-400 bg-orange-500/15",
  FOLDER: "text-cyan-400 bg-cyan-500/15",
};

function driveUrlFor(file: DriveFileInfo): string {
  return file.isFolder
    ? `https://drive.google.com/drive/folders/${file.id}`
    : `https://drive.google.com/file/d/${file.id}/view`;
}

export function DriveFolderView({
  info,
  onDownload,
  onDownloadAll,
}: DriveFolderViewProps) {
  const files = info.driveFiles ?? [];
  const folderId = info.driveFileId || "";
  const folderUrl = folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : info.url;

  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const downloadFile = onDownload ?? ((url, fmt) => downloadApi.fetchMedia(url, fmt));
  const downloadAll =
    onDownloadAll ?? ((url) => downloadApi.fetchMedia(url, "best", false, true));

  const fileCount = files.filter((f) => !f.isFolder).length;
  const folderCount = files.filter((f) => f.isFolder).length;

  const handleDownload = async (file: DriveFileInfo) => {
    if (busyFileId || busyAll) return;
    setBusyFileId(file.id);
    try {
      await downloadFile(driveUrlFor(file), "best");
      toast.success(`Downloading ${file.isFolder ? "folder" : "file"}: ${file.name}`);
    } catch (err) {
      toast.error(getApiError(err, "Failed to download file"));
    } finally {
      setBusyFileId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (busyAll || busyFileId) return;
    setBusyAll(true);
    try {
      await downloadAll(folderUrl);
      toast.success("Downloading folder as ZIP...");
    } catch (err) {
      toast.error(getApiError(err, "Failed to download folder"));
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="bg-gradient-to-br from-cyan-500/20 to-accent/10 p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-b border-white/5">
        <div className="w-12 h-12 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
          <HiFolder className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white line-clamp-2">
            {info.title || "Google Drive Folder"}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {fileCount} {fileCount === 1 ? "file" : "files"}
            {folderCount > 0 && ` · ${folderCount} ${folderCount === 1 ? "folder" : "folders"}`}
            {info.fileSize != null && info.fileSize > 0 && ` · ${formatFileSize(info.fileSize)}`}
          </p>
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={busyAll || files.length === 0}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {busyAll ? (
            <HiArrowPath className="w-4 h-4 animate-spin" />
          ) : (
            <HiArrowDownTray className="w-4 h-4" />
          )}
          {busyAll ? "Preparing ZIP..." : "Download All"}
        </button>
      </div>

      {info.error && (
        <div className="px-5 py-3 flex items-start gap-2 bg-amber-500/10 text-amber-300 text-xs">
          <HiShieldExclamation className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{info.error}</span>
        </div>
      )}

      {files.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-zinc-500">
          This folder has no items listed. It may be empty or private.
        </div>
      ) : (
        <ul className="divide-y divide-white/5 max-h-96 overflow-y-auto">
          {files.map((file) => {
            const busy = busyFileId === file.id;
            return (
              <li
                key={`${file.isFolder ? "f" : "d"}-${file.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors"
              >
                <span
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    mediaTypeColors[file.mediaType] || "text-zinc-400 bg-zinc-500/15"
                  )}
                >
                  {mediaTypeIcons[file.mediaType] || (
                    <HiDocumentArrowDown className="w-4 h-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {file.isFolder ? "Folder" : file.size > 0 ? formatFileSize(file.size) : file.mediaType}
                    {file.extension && !file.isFolder ? ` · .${file.extension.toUpperCase()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(file)}
                  disabled={busy || busyAll || busyFileId !== null}
                  title={
                    file.isFolder
                      ? "Download this folder as ZIP"
                      : "Download this file"
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {busy ? (
                    <HiArrowPath className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HiArrowDownTray className="w-3.5 h-3.5" />
                  )}
                  {file.isFolder ? "ZIP" : "Download"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
