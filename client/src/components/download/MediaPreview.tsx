import { useState } from "react";
import { motion } from "framer-motion";
import { cn, formatDuration, formatFileSize } from "@/lib/utils";
import { downloadApi, getApiError } from "@/lib/api";
import { MediaPlayer } from "@/components/download/MediaPlayer";
import { DriveFolderView } from "@/components/download/DriveFolderView";
import { SpotifyCard } from "@/components/download/SpotifyCard";
import toast from "react-hot-toast";
import type { AnalyzeResult, PrepareItem } from "@/types";
import {
  HiPlay,
  HiMusicalNote,
  HiTv,
  HiPhoto,
  HiClock,
  HiGlobeAlt,
  HiDocumentText,
  HiArchiveBox,
  HiFolder,
  HiDocumentArrowDown,
  HiXMark,
  HiArrowDownTray,
  HiArrowPath,
  HiListBullet,
  HiFolderArrowDown,
} from "react-icons/hi2";

interface MediaPreviewProps {
  info: AnalyzeResult;
  /** Fetch + save the real media file (legacy / single item download). */
  onDownload?: (url: string, formatSpec: string) => Promise<void>;
  /** Builds a proxied, Range-aware playback URL (legacy direct-media URL). */
  streamUrl?: (mediaUrl: string) => string;
  /** Prepends auth token to a prepared relative stream path. */
  preparedStreamUrl?: (path: string) => string;
  /** Triggers the browser save for a prepared downloadUrl path. */
  preparedDownload?: (path: string, filename?: string) => void;
  /** Download an entire Google Drive folder as a ZIP. */
  onDriveDownloadAll?: (folderUrl: string) => Promise<void>;
}

const platformColors: Record<string, string> = {
  youtube: "#FF0000",
  vimeo: "#1AB7EA",
  soundcloud: "#FF5500",
  tiktok: "#69C9D0",
  instagram: "#E1306C",
  twitter: "#1DA1F2",
  twitch: "#9146FF",
  dailymotion: "#0066DC",
  pinterest: "#E60023",
  googledrive: "#34A853",
  telegram: "#0088CC",
  terabox: "#00B8FF",
};

const mediaTypeIcons: Record<string, React.ReactNode> = {
  VIDEO: <HiTv className="w-4 h-4" />,
  AUDIO: <HiMusicalNote className="w-4 h-4" />,
  IMAGE: <HiPhoto className="w-4 h-4" />,
  DOCUMENT: <HiDocumentText className="w-4 h-4" />,
  ARCHIVE: <HiArchiveBox className="w-4 h-4" />,
  FOLDER: <HiFolder className="w-4 h-4" />,
  PLAYLIST: <HiListBullet className="w-4 h-4" />,
  SHORT: <HiPlay className="w-4 h-4" />,
  OTHER: <HiDocumentArrowDown className="w-4 h-4" />,
};

const mediaTypeColors: Record<string, string> = {
  VIDEO: "bg-blue-500/15 text-blue-400",
  AUDIO: "bg-purple-500/15 text-purple-400",
  IMAGE: "bg-green-500/15 text-green-400",
  DOCUMENT: "bg-amber-500/15 text-amber-400",
  ARCHIVE: "bg-orange-500/15 text-orange-400",
  FOLDER: "bg-cyan-500/15 text-cyan-400",
  PLAYLIST: "bg-pink-500/15 text-pink-400",
  SHORT: "bg-rose-500/15 text-rose-400",
  OTHER: "bg-zinc-500/15 text-zinc-400",
};

/** True when this card came from the /prepare flow (real media is ready). */
function isPrepared(info: AnalyzeResult): boolean {
  return Boolean(info.downloadUrl);
}

export function MediaPreview({
  info,
  onDownload,
  streamUrl,
  preparedStreamUrl,
  preparedDownload,
  onDriveDownloadAll,
}: MediaPreviewProps) {
  const [imgError, setImgError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingItems, setDownloadingItems] = useState<Set<number>>(
    new Set()
  );
  const [downloadingAll, setDownloadingAll] = useState(false);

  const isSpotify =
    info.mediaType === "SPOTIFY" || info.platform?.toLowerCase() === "spotify";

  // Only the metadata-only (analyze) Spotify card uses SpotifyCard; once
  // prepared, the real .mp3/.zip renders via PreparedMediaCard below.
  if (isSpotify && !isPrepared(info)) {
    return <SpotifyCard info={info} />;
  }

  if (info.driveIsFolder || info.mediaType === "FOLDER") {
    const downloadAll =
      onDriveDownloadAll ??
      ((url: string) => downloadApi.fetchMedia(url, "best", false, true));
    return (
      <DriveFolderView
        info={info}
        onDownload={onDownload}
        onDownloadAll={downloadAll}
      />
    );
  }

  // Multi-item media: playlist / multi-image gallery.
  if (info.items && info.items.length > 0) {
    return (
      <MediaItemsView
        info={info}
        items={info.items}
        onDownload={onDownload}
        onDownloadItem={async (item, index) => {
          const fetchMedia = onDownload ?? downloadApi.fetchMedia;
          setDownloadingItems((prev) => new Set(prev).add(index));
          try {
            await fetchMedia(item.url, item.mediaType === "AUDIO" ? "bestaudio/best" : "best");
            toast.success(`Downloaded: ${item.title}`);
          } catch (err) {
            toast.error(getApiError(err, "Failed to download item"));
          } finally {
            setDownloadingItems((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });
          }
        }}
        onDownloadAll={async () => {
          const fetchMedia = onDownload ?? downloadApi.fetchMedia;
          setDownloadingAll(true);
          try {
            for (let i = 0; i < info.items!.length; i++) {
              const item = info.items![i];
              await fetchMedia(
                item.url,
                item.mediaType === "AUDIO" ? "bestaudio/best" : "best"
              );
            }
            toast.success(`Downloaded ${info.items!.length} items`);
          } catch (err) {
            toast.error(getApiError(err, "Download stopped early"));
          } finally {
            setDownloadingAll(false);
          }
        }}
        downloadingAll={downloadingAll}
        downloadingItems={downloadingItems}
      />
    );
  }

  const platformColor =
    platformColors[info.platform?.toLowerCase()] || "#6C5CE7";

  // Prepared media: the actual file is stored server-side. Preview + download
  // both hit the real file; nothing metadata-only is ever shown.
  if (isPrepared(info)) {
    const toPreparedStream = preparedStreamUrl ?? downloadApi.preparedStreamUrl;
    const toPreparedDownload = preparedDownload ?? downloadApi.preparedDownload;
    const streamSrc = info.streamUrl ? toPreparedStream(info.streamUrl) : null;

    return (
      <PreparedMediaCard
        info={info}
        platformColor={platformColor}
        streamSrc={streamSrc}
        onPreviewError={() => setImgError(true)}
        onDownloadNow={() => {
          if (!downloading && info.downloadUrl) {
            toPreparedDownload(info.downloadUrl, info.filename || undefined);
            toast.success("Download started");
          }
        }}
      />
    );
  }

  const hasThumbnail =
    !imgError &&
    info.thumbnail &&
    !info.thumbnail.includes("google") &&
    info.mediaType !== "DOCUMENT" &&
    info.mediaType !== "ARCHIVE" &&
    info.mediaType !== "FOLDER";

  const isVideo =
    info.mediaType === "VIDEO" ||
    info.mediaType === "SHORT" ||
    info.mediaType === "PLAYLIST";
  const isAudio = info.mediaType === "AUDIO";
  const isImage = info.mediaType === "IMAGE";

  const playableUrl = info.preview?.url;
  const toStreamUrl = streamUrl ?? downloadApi.streamUrl;
  const streamSrc = playableUrl ? toStreamUrl(playableUrl) : null;

  const downloadFormat = isAudio ? "bestaudio/best" : "best";

  const handleDownloadNow = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const fetchMedia = onDownload ?? downloadApi.fetchMedia;
      await fetchMedia(info.url, downloadFormat);
      toast.success("Download started");
    } catch (err) {
      toast.error(getApiError(err, "Failed to download media"));
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
      <div className="relative aspect-video bg-dark-border/50">
        {isImage && streamSrc ? (
          <img
            src={streamSrc}
            alt={info.title}
            className="w-full h-full object-contain bg-black"
            onError={() => setImgError(true)}
          />
        ) : isVideo && playing && streamSrc ? (
          <MediaPlayer
            key={streamSrc}
            src={streamSrc}
            poster={info.thumbnail || undefined}
            autoPlay
            className="w-full h-full"
          />
        ) : isAudio && streamSrc ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-purple-500/20 to-accent/10 p-6">
            {hasThumbnail ? (
              <>
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[2px]"
                  onError={() => setImgError(true)}
                />
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="relative z-10 w-28 h-28 rounded-xl object-cover shadow-2xl border border-white/10"
                  onError={() => setImgError(true)}
                />
              </>
            ) : (
              <HiMusicalNote className="w-14 h-14 text-purple-400" />
            )}
            <div className="relative z-10 w-full max-w-sm">
              <MediaPlayer
                key={streamSrc}
                src={streamSrc}
                kind="audio"
                autoPlay
                className="w-full"
              />
            </div>
          </div>
        ) : hasThumbnail ? (
          <img
            src={info.thumbnail}
            alt={info.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10">
            {mediaTypeIcons[info.mediaType] || <HiDocumentArrowDown className="w-16 h-16 text-zinc-600" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {isVideo && !playing && streamSrc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => setPlaying(true)}
              className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors cursor-pointer"
              aria-label="Play media"
            >
              <HiPlay className="w-7 h-7 text-white ml-0.5" />
            </button>
          </div>
        )}
        {isVideo && playing && (
          <button
            onClick={() => setPlaying(false)}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/70 backdrop-blur-sm text-white hover:bg-black/90 transition-colors z-10"
            aria-label="Close player"
          >
            <HiXMark className="w-4 h-4" />
          </button>
        )}
        {info.duration > 0 && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium backdrop-blur-sm">
            {formatDuration(info.duration)}
          </span>
        )}
        {info.extension && (
          <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium backdrop-blur-sm uppercase">
            .{info.extension}
          </span>
        )}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: `${platformColor}CC` }}
        >
          {info.platform}
        </span>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-semibold text-white line-clamp-2 mb-3">
          {info.title}
        </h3>

        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-zinc-400">
          {info.uploader && info.uploader !== "Unknown" && (
            <span className="flex items-center gap-1">
              <HiGlobeAlt className="w-3.5 h-3.5" />
              {info.uploader}
            </span>
          )}
          {info.duration > 0 && (
            <span className="flex items-center gap-1">
              <HiClock className="w-3.5 h-3.5" />
              {formatDuration(info.duration)}
            </span>
          )}
          {info.resolution && (
            <span className="flex items-center gap-1">
              <HiTv className="w-3.5 h-3.5" />
              {info.resolution}
            </span>
          )}
          {info.fileSize != null && info.fileSize > 0 && (
            <span className="flex items-center gap-1">
              <HiArchiveBox className="w-3.5 h-3.5" />
              {formatFileSize(info.fileSize)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
              mediaTypeColors[info.mediaType] || "bg-zinc-500/15 text-zinc-400"
            )}
          >
            {mediaTypeIcons[info.mediaType] || <HiDocumentArrowDown className="w-4 h-4" />}
            {info.mediaType}
            {info.extension ? ` (.${info.extension.toUpperCase()})` : ""}
          </span>
          {info.driveIsFolder && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400">
              <HiFolder className="w-4 h-4" />
              Drive Folder
            </span>
          )}
        </div>

        <button
          onClick={handleDownloadNow}
          disabled={downloading}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-primary text-white font-semibold py-3 rounded-xl hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <HiArrowPath className="w-4 h-4 animate-spin" />
          ) : (
            <HiArrowDownTray className="w-4 h-4" />
          )}
          {downloading ? "Preparing file..." : "Download"}
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Prepared media card: plays the ACTUAL stored file.                  */
/* ------------------------------------------------------------------ */

interface PreparedMediaCardProps {
  info: AnalyzeResult;
  platformColor: string;
  streamSrc: string | null;
  onPreviewError: () => void;
  onDownloadNow: () => void;
}

function PreparedMediaCard({
  info,
  platformColor,
  streamSrc,
  onPreviewError,
  onDownloadNow,
}: PreparedMediaCardProps) {
  const mediaType = info.mediaType;
  const isVideo = mediaType === "VIDEO" || mediaType === "SHORT";
  const isAudio = mediaType === "AUDIO";
  const isImage = mediaType === "IMAGE";
  const isPdf = mediaType === "PDF" || info.mimeType === "application/pdf" || (info.extension || "").toLowerCase() === "pdf";
  const isDocument = mediaType === "DOCUMENT";
  const isArchive = mediaType === "ARCHIVE";

  const body = (() => {
    if (isImage && streamSrc) {
      return (
        <img
          src={streamSrc}
          alt={info.title}
          className="w-full h-full object-contain bg-black"
          onError={onPreviewError}
        />
      );
    }
    if (isVideo && streamSrc) {
      return (
        <MediaPlayer
          key={streamSrc}
          src={streamSrc}
          poster={info.thumbnail || undefined}
          autoPlay
          className="w-full h-full"
        />
      );
    }
    if (isAudio && streamSrc) {
      return (
        <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-purple-500/20 to-accent/10 p-6">
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-28 h-28 rounded-xl object-cover shadow-2xl border border-white/10"
              onError={onPreviewError}
            />
          ) : (
            <HiMusicalNote className="w-16 h-16 text-purple-400" />
          )}
          <div className="w-full max-w-sm">
            <MediaPlayer
              key={streamSrc}
              src={streamSrc}
              kind="audio"
              autoPlay
              className="w-full"
            />
          </div>
        </div>
      );
    }
    if (isPdf && streamSrc) {
      return (
        <iframe
          key={streamSrc}
          src={streamSrc}
          title={info.title}
          className="w-full h-full bg-white"
        />
      );
    }
    return null;
  })();

  const showFileCard = isDocument || isArchive || (!body && !isImage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className={cn("relative bg-dark-border/50", showFileCard ? "aspect-video" : "aspect-video")}>
        {body ? (
          body
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/20 to-accent/10">
            {mediaTypeIcons[mediaType] || (
              <HiDocumentArrowDown className="w-16 h-16 text-zinc-600" />
            )}
            <span className="text-sm text-zinc-400">{info.filename}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
        {info.duration > 0 && isVideo && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-medium backdrop-blur-sm">
            {formatDuration(info.duration)}
          </span>
        )}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: `${platformColor}CC` }}
        >
          {info.platform || "Media"}
        </span>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-semibold text-white line-clamp-2 mb-3">
          {info.title}
        </h3>

        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-zinc-400">
          <span className="inline-flex items-center gap-1">
            {mediaTypeIcons[mediaType] || <HiDocumentArrowDown className="w-3.5 h-3.5" />}
            {info.mediaType}
            {info.extension ? ` · .${info.extension.toUpperCase()}` : ""}
          </span>
          {info.fileSize != null && info.fileSize > 0 && (
            <span className="inline-flex items-center gap-1">
              <HiArchiveBox className="w-3.5 h-3.5" />
              {formatFileSize(info.fileSize)}
            </span>
          )}
          {info.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <HiClock className="w-3.5 h-3.5" />
              {formatDuration(info.duration)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <HiTv className="w-3.5 h-3.5" />
            {info.mimeType || "file"}
          </span>
        </div>

        <button
          onClick={onDownloadNow}
          className="mt-2 w-full flex items-center justify-center gap-2 bg-gradient-primary text-white font-semibold py-3 rounded-xl hover:shadow-glow transition-all"
        >
          <HiArrowDownTray className="w-4 h-4" />
          Download {info.filename ? ` · ${info.filename}` : ""}
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Playlist / gallery view: every item listed, individually downloadable. */
/* ------------------------------------------------------------------ */

interface MediaItemsViewProps {
  info: AnalyzeResult;
  items: PrepareItem[];
  onDownload?: (url: string, formatSpec: string) => Promise<void>;
  onDownloadItem: (item: PrepareItem, index: number) => Promise<void>;
  onDownloadAll: () => Promise<void>;
  downloadingAll: boolean;
  downloadingItems: Set<number>;
}

function MediaItemsView({
  info,
  items,
  onDownloadItem,
  onDownloadAll,
  downloadingAll,
  downloadingItems,
}: MediaItemsViewProps) {
  const platformColor = platformColors[info.platform?.toLowerCase()] || "#6C5CE7";
  const isGallery = info.mediaType === "IMAGE";
  const icon = isGallery ? <HiPhoto className="w-4 h-4" /> : <HiListBullet className="w-4 h-4" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white line-clamp-2">
              {info.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-zinc-400">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: `${platformColor}CC` }}
              >
                {icon}
                {isGallery ? "Gallery" : "Playlist"}
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                <HiListBullet className="w-3.5 h-3.5" />
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              {info.duration > 0 && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <HiClock className="w-3.5 h-3.5" />
                  {formatDuration(info.duration)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onDownloadAll}
            disabled={downloadingAll}
            className="flex items-center gap-2 bg-gradient-primary text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {downloadingAll ? (
              <HiArrowPath className="w-4 h-4 animate-spin" />
            ) : (
              <HiFolderArrowDown className="w-4 h-4" />
            )}
            {downloadingAll ? "Downloading..." : "Download all"}
          </button>
        </div>

        {isGallery ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item, i) => (
              <GalleryItem
                key={i}
                item={item}
                index={i}
                downloading={downloadingItems.has(i)}
                onDownload={() => onDownloadItem(item, i)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <PlaylistItem
                key={i}
                item={item}
                index={i}
                downloading={downloadingItems.has(i)}
                onDownload={() => onDownloadItem(item, i)}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GalleryItem({
  item,
  index,
  downloading,
  onDownload,
}: {
  item: PrepareItem;
  index: number;
  downloading: boolean;
  onDownload: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group relative rounded-xl overflow-hidden bg-dark-border/50 border border-white/5 aspect-square"
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10">
          <HiPhoto className="w-8 h-8 text-zinc-600" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
        <p className="text-xs font-medium text-white line-clamp-2 mb-2">
          {index + 1}. {item.title}
        </p>
        <button
          onClick={onDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50"
        >
          {downloading ? (
            <HiArrowPath className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <HiArrowDownTray className="w-3.5 h-3.5" />
          )}
          Download
        </button>
      </div>
    </motion.div>
  );
}

function PlaylistItem({
  item,
  index,
  downloading,
  onDownload,
}: {
  item: PrepareItem;
  index: number;
  downloading: boolean;
  onDownload: () => void;
}) {
  const isAudio = item.mediaType === "AUDIO";
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 rounded-xl bg-dark-border/40 border border-white/5 p-3 hover:bg-dark-border/70 transition-colors"
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-dark-border/60 flex items-center justify-center">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-zinc-600">{isAudio ? <HiMusicalNote className="w-5 h-5" /> : <HiTv className="w-5 h-5" />}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {index + 1}. {item.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
          <span>{item.mediaType}</span>
          {item.extension && <span>.{item.extension.toUpperCase()}</span>}
          {item.duration > 0 && <span>{formatDuration(item.duration)}</span>}
        </div>
      </div>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors shrink-0 disabled:opacity-50"
      >
        {downloading ? (
          <HiArrowPath className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <HiArrowDownTray className="w-3.5 h-3.5" />
        )}
        Download
      </button>
    </motion.div>
  );
}
