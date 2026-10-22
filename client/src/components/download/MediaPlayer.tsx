import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { cn } from "@/lib/utils";

interface MediaPlayerProps {
  src: string;
  poster?: string;
  kind?: "video" | "audio";
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
  onError?: (message: string) => void;
}

function isHlsUrl(src: string): boolean {
  return /\.m3u8($|\?)/i.test(src);
}

/**
 * Plays a proxied media URL in a native <video>/<audio> element.
 * HLS (m3u8) streams are handled transparently via hls.js so the user always
 * sees actual media instead of an empty frame or raw manifest.
 */
export function MediaPlayer({
  src,
  poster,
  kind = "video",
  autoPlay = false,
  controls = true,
  className,
  onError,
}: MediaPlayerProps) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    setFailed(false);

    const hlsUrl = isHlsUrl(src);
    const canPlayNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    let hls: Hls | null = null;

    if (hlsUrl && !canPlayNative && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, startLevel: -1 });
      hls.loadSource(src);
      hls.attachMedia(el);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          setFailed(true);
          onErrorRef.current?.("Unable to play this media stream.");
        }
      });
    } else {
      el.src = src;
      el.addEventListener("error", () => {
        setFailed(true);
        onErrorRef.current?.("Unable to load media.");
      });
    }

    if (autoPlay) {
      const p = el.play();
      if (p) p.catch(() => {});
    }

    return () => {
      if (hls) {
        hls.destroy();
      } else {
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [src, autoPlay]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <span className="text-sm text-zinc-500">
          Preview unavailable for this stream. Use Download instead.
        </span>
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <audio
        ref={mediaRef as React.RefObject<HTMLAudioElement>}
        controls={controls}
        autoPlay={autoPlay}
        className={cn("w-full", className)}
      />
    );
  }

  return (
    <video
      ref={mediaRef as React.RefObject<HTMLVideoElement>}
      controls={controls}
      autoPlay={autoPlay}
      poster={poster}
      playsInline
      className={cn("w-full h-full object-contain bg-black", className)}
    />
  );
}
