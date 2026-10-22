import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { publicApi, getApiError } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { detectPlatform } from "@/lib/platform";
import type { PlatformInfo } from "@/lib/platform";
import { PlatformBadge } from "@/components/download/PlatformBadge";
import { MediaPreview } from "@/components/download/MediaPreview";
import { cn, isValidUrl } from "@/lib/utils";
import type { AnalyzeResult } from "@/types";
import {
  HiGlobeAlt, HiClipboardDocument, HiMagnifyingGlass, HiArrowDownTray,
  HiCheckCircle, HiClock, HiTv,
  HiBolt, HiShieldCheck, HiHeart, HiComputerDesktop, HiMoon,
  HiArrowTrendingUp, HiUserGroup, HiDeviceTablet,
} from "react-icons/hi2";
import { BsYoutube, BsInstagram, BsFacebook, BsTwitterX, BsPinterest, BsVimeo, BsTelegram } from "react-icons/bs";

type PageState = "input" | "analyzing" | "preview" | "error";

const fadeUp = { hidden: { opacity: 0, y: 40 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease: "easeOut" } }) };
const scaleIn = { hidden: { opacity: 0, scale: 0.9 }, visible: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" } }) };

const platforms = [
  { name: "YouTube", icon: BsYoutube, color: "#FF0000", gradient: "from-red-500/20 to-red-600/10" },
  { name: "Instagram", icon: BsInstagram, color: "#E1306C", gradient: "from-pink-500/20 to-purple-600/10" },
  { name: "Facebook", icon: BsFacebook, color: "#1877F2", gradient: "from-blue-500/20 to-blue-600/10" },
  { name: "X (Twitter)", icon: BsTwitterX, color: "#1DA1F2", gradient: "from-sky-500/20 to-sky-600/10" },
  { name: "Pinterest", icon: BsPinterest, color: "#E60023", gradient: "from-red-500/20 to-red-600/10" },
  { name: "Vimeo", icon: BsVimeo, color: "#1AB7EA", gradient: "from-cyan-500/20 to-cyan-600/10" },
  { name: "Telegram", icon: BsTelegram, color: "#0088CC", gradient: "from-blue-500/20 to-blue-600/10" },
];

const features = [
  { icon: HiBolt, title: "Ultra Fast Downloads", desc: "Powered by yt-dlp with optimized parallel connections for lightning-fast downloads.", color: "text-yellow-400", bg: "bg-yellow-500/15" },
  { icon: HiTv, title: "HD Quality", desc: "From 360p to 4K HDR. Choose your preferred resolution or let us pick the best.", color: "text-blue-400", bg: "bg-blue-500/15" },
  { icon: HiShieldCheck, title: "Secure Downloads", desc: "All downloads are encrypted and private. We never track or store your content.", color: "text-green-400", bg: "bg-green-500/15" },
  { icon: HiClock, title: "Download History", desc: "Full download history with search, filter, and pagination. Never lose track.", color: "text-purple-400", bg: "bg-purple-500/15" },
  { icon: HiGlobeAlt, title: "Multiple Platforms", desc: "YouTube, Instagram, Facebook, X/Twitter, Pinterest, Vimeo, and many more.", color: "text-cyan-400", bg: "bg-cyan-500/15" },
  { icon: HiMoon, title: "Dark Mode", desc: "Beautiful dark mode interface that's easy on the eyes, day or night.", color: "text-zinc-400", bg: "bg-zinc-500/15" },
];

const stats = [
  { icon: HiArrowDownTray, value: "1M+", label: "Total Downloads" },
  { icon: HiUserGroup, value: "50K+", label: "Active Users" },
  { icon: HiDeviceTablet, value: "1000+", label: "Supported Platforms" },
];

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isFocused, setIsFocused] = useState(false);
  const [pageState, setPageState] = useState<PageState>("input");
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformInfo | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

  const scrollToDownload = () => downloadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (isValidUrl(value)) { const platform = detectPlatform(value); setDetectedPlatform(platform); }
    else { setDetectedPlatform(null); }
  }, []);

  const handlePaste = useCallback(async () => {
    try { const text = await navigator.clipboard.readText(); handleUrlChange(text); toast.success("URL pasted from clipboard"); }
    catch { toast.error("Unable to read clipboard. Please paste manually."); }
  }, [handleUrlChange]);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) { toast.error("Please enter a URL"); return; }
    if (!isValidUrl(url)) { toast.error("Please enter a valid URL"); return; }
    const platform = detectPlatform(url);
    if (!platform) { toast.error("Unsupported URL."); return; }
    if (!isAuthenticated) {
      toast.error("Please sign in to download media");
      navigate("/signup");
      return;
    }
    setIsAnalyzing(true); setPageState("analyzing");
    try {
      // Prepare = analyze + download the best format internally. The result is
      // the actual media (downloadUrl/streamUrl), never metadata JSON.
      const res = await publicApi.prepare(url);
      const data: AnalyzeResult = res.data;
      setAnalyzeResult(data); setDetectedPlatform(platform); setPageState("preview");
      toast.success("Media ready to download");
    } catch (err: any) {
      const msg = getApiError(err, "Failed to prepare URL");
      setErrorMsg(msg); setPageState("error"); toast.error(msg);
    } finally { setIsAnalyzing(false); }
  }, [url, isAuthenticated, navigate]);

  const handleDownload = useCallback(async (mediaUrl: string, formatSpec: string) => {
    if (!isAuthenticated) {
      toast.error("Please sign in to download media");
      navigate("/signup");
      return;
    }
    setIsDownloading(true);
    try {
      await publicApi.fetchMedia(mediaUrl, formatSpec);
      toast.success("Download started");
    } catch (err: any) {
      const msg = getApiError(err, "Failed to download media");
      setErrorMsg(msg); setPageState("error"); toast.error(msg);
    } finally {
      setIsDownloading(false);
    }
  }, [isAuthenticated, navigate]);

  const handleReset = useCallback(() => {
    setUrl(""); setPageState("input"); setAnalyzeResult(null); setDetectedPlatform(null);
    setErrorMsg(""); setIsDownloading(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter") handleAnalyze(); }, [handleAnalyze]);

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* ===== ANIMATED 3D BACKGROUND ===== */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] rounded-full bg-[#6C5CE7]/10 blur-[200px] animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full bg-[#00E5FF]/6 blur-[160px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[700px] h-[700px] rounded-full bg-[#6C5CE7]/6 blur-[160px]" style={{ animation: "float 7s ease-in-out infinite reverse" }} />
        <div className="absolute top-1/2 left-3/4 w-[400px] h-[400px] rounded-full bg-[#00E5FF]/4 blur-[120px] animate-float" style={{ animationDuration: "9s" }} />
      </div>

      {/* ===== NAVBAR ===== */}
      <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed top-0 left-0 right-0 z-50">
        <div className="absolute inset-0 bg-[#09090B]/80 backdrop-blur-xl border-b border-white/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00E5FF] flex items-center justify-center">
              <HiArrowDownTray className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent">Universal Downloader</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/about" className="text-sm text-zinc-400 hover:text-white transition-colors">About</Link>
            <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Sign In</Link>
            <Link to="/signup" className="px-5 py-2 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-[#6C5CE7]/30 transition-all">Get Started</Link>
          </div>
        </div>
      </motion.nav>

      {/* ===== HERO SECTION ===== */}
      <section className="relative z-10 pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#6C5CE7]/10 border border-[#6C5CE7]/20 text-xs font-medium text-[#6C5CE7] mb-6">
              <HiBolt className="w-3.5 h-3.5" />
              World's Most Powerful Downloader
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}
            className="text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05] mb-6"
          >
            <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">Download Any</span>
            <br />
            <span className="bg-gradient-to-r from-[#6C5CE7] via-[#00E5FF] to-[#6C5CE7] bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient_4s_linear_infinite]">
              Media Instantly
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}
            className="text-base sm:text-lg text-zinc-500 max-w-2xl mx-auto mb-8"
          >
            Paste any link from YouTube, Instagram, Facebook, X/Twitter, Pinterest, Vimeo, Telegram, Google Drive, direct audio files, and 1000+ platforms. 
            Download in ultra HD with one click. Free, fast, and private.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <button onClick={() => { scrollToDownload(); }} className="px-8 py-3.5 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white font-semibold rounded-2xl hover:shadow-xl hover:shadow-[#6C5CE7]/30 active:scale-[0.98] transition-all text-base">
              <div className="flex items-center gap-2"><HiArrowDownTray className="w-5 h-5" /> Get Started</div>
            </button>
            <Link to="/about" className="px-8 py-3.5 glass text-zinc-300 font-medium rounded-2xl hover:bg-white/5 hover:text-white transition-all text-base border border-white/10">
              Learn More
            </Link>
          </motion.div>

          {/* Floating Glass Cards */}
          <div className="hidden lg:block mt-16 relative h-64">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}
              className="absolute left-0 top-0 glass rounded-2xl p-5 w-56 border border-white/10 animate-float"
              style={{ animationDuration: "6s" }}
            >
              <BsYoutube className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-sm font-semibold text-white">YouTube Video</p>
              <p className="text-xs text-zinc-500 mt-1">1080p · 12.4 MB</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}
              className="absolute right-0 top-10 glass rounded-2xl p-5 w-56 border border-white/10 animate-float"
              style={{ animationDuration: "7s", animationDelay: "1s" }}
            >
              <BsInstagram className="w-8 h-8 text-pink-500 mb-3" />
              <p className="text-sm font-semibold text-white">Instagram Reel</p>
              <p className="text-xs text-zinc-500 mt-1">HD · 8.2 MB</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6 }}
              className="absolute left-1/4 bottom-0 glass rounded-2xl p-5 w-56 border border-white/10"
            >
              <BsTwitterX className="w-8 h-8 text-white mb-3" />
              <p className="text-sm font-semibold text-white">X/Twitter Video</p>
              <p className="text-xs text-zinc-500 mt-1">720p · 5.1 MB</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6 }}
              className="absolute right-1/4 top-0 glass rounded-2xl p-5 w-56 border border-white/10 animate-float"
              style={{ animationDuration: "8s", animationDelay: "0.5s" }}
            >
              <BsFacebook className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-sm font-semibold text-white">Facebook Video</p>
              <p className="text-xs text-zinc-500 mt-1">4K · 45.8 MB</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== DOWNLOAD ENGINE ===== */}
      <section ref={downloadRef} className="relative z-10 max-w-4xl mx-auto px-4 pb-8 scroll-mt-24">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Start Downloading</h2>
          <p className="text-zinc-500">Paste your URL below and download in seconds</p>
        </motion.div>

        {pageState !== "preview" && pageState !== "error" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6 mb-6 border border-white/5 shadow-2xl shadow-[#6C5CE7]/5">
            <div className={cn("flex items-center gap-3 bg-dark-border/30 rounded-2xl px-5 py-4 transition-all duration-200 border", isFocused ? "border-[#6C5CE7]/50 ring-1 ring-[#6C5CE7]/20 shadow-[0_0_30px_rgba(108,92,231,0.08)]" : "border-transparent")}>
              <HiGlobeAlt className="w-5 h-5 text-zinc-500 shrink-0" />
              <input type="url" placeholder="Paste your URL here (YouTube, Instagram, Google Drive, Spotify, audio, etc.)..." value={url}
                onChange={(e) => handleUrlChange(e.target.value)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown} disabled={isAnalyzing}
                className="flex-1 bg-transparent text-white placeholder:text-zinc-600 outline-none text-sm disabled:opacity-50" />
              <button onClick={handlePaste} disabled={isAnalyzing}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors shrink-0 disabled:opacity-50">
                <HiClipboardDocument className="w-3.5 h-3.5" />Paste
              </button>
              <button onClick={handleAnalyze} disabled={isAnalyzing || !url.trim()}
                className="flex items-center gap-2 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 hover:shadow-lg hover:shadow-[#6C5CE7]/30">
                <HiMagnifyingGlass className={cn("w-4 h-4", isAnalyzing && "animate-spin")} />
                {isAnalyzing ? "Preparing..." : "Analyze"}
              </button>
            </div>
            {detectedPlatform && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2">
                <HiCheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-zinc-500">Detected: </span>
                <PlatformBadge platform={detectedPlatform} size="sm" />
              </motion.div>
            )}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {pageState === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="glass rounded-3xl p-12 flex flex-col items-center border border-white/5">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] flex items-center justify-center mb-4">
                <HiMagnifyingGlass className="w-8 h-8 text-white" />
              </motion.div>
              <p className="text-white font-medium">Preparing media...</p>
              <p className="text-sm text-zinc-500 mt-1">Detecting, downloading the best format, and building your preview</p>
              <div className="w-48 h-1.5 bg-dark-border/60 rounded-full mt-4 overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] rounded-full"
                  animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />
              </div>
            </motion.div>
          )}

          {pageState === "preview" && analyzeResult && (
            <motion.div key="preview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white">Your media is ready to download</p>
                <button onClick={handleReset} className="text-sm text-zinc-500 hover:text-zinc-300 py-1.5 px-3 rounded-xl glass-hover transition-colors">
                  Cancel
                </button>
              </div>
              <MediaPreview
                info={analyzeResult}
                onDownload={handleDownload}
                streamUrl={publicApi.streamUrl}
                preparedStreamUrl={publicApi.preparedStreamUrl}
                preparedDownload={publicApi.preparedDownload}
                onDriveDownloadAll={(folderUrl) =>
                  publicApi.fetchMedia(folderUrl, "best", true)
                }
              />
            </motion.div>
          )}

          {pageState === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-lg mx-auto">
              <div className="glass rounded-2xl p-8 border border-red-500/20 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <HiGlobeAlt className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Something went wrong</h3>
                <p className="text-sm text-zinc-400 mb-6">{errorMsg}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleReset} className="flex items-center gap-2 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white font-semibold px-6 py-2.5 rounded-xl transition-all">Try Again</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ===== SUPPORTED PLATFORMS ===== */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Supported Platforms</h2>
          <p className="text-zinc-500">Download from all your favorite platforms</p>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          {platforms.map((p, i) => (
            <motion.div key={p.name} custom={i} variants={scaleIn} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="glass rounded-2xl p-6 flex flex-col items-center text-center group hover:border-white/20 transition-all border border-white/5"
              style={{ ['--hover-color' as string]: p.color }}
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <p.icon className="w-7 h-7" style={{ color: p.color }} />
              </div>
              <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{p.name}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Everything You Need</h2>
          <p className="text-zinc-500">Powerful features designed for the best download experience</p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              className="glass rounded-2xl p-6 hover:border-white/20 transition-all border border-white/5 group"
            >
              <div className={`w-11 h-11 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== STATISTICS ===== */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 py-24">
        <div className="glass rounded-3xl p-8 sm:p-12 border border-white/5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((s, i) => (
              <motion.div key={s.label} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#6C5CE7]/20 to-[#00E5FF]/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="w-6 h-6 text-[#6C5CE7]" />
                </div>
                <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent mb-1">{s.value}</p>
                <p className="text-sm text-zinc-500">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 pb-32 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Start?</h2>
          <p className="text-zinc-500 mb-8 max-w-lg mx-auto">Join thousands of users who trust Universal Downloader for their media needs.</p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white font-semibold rounded-2xl hover:shadow-xl hover:shadow-[#6C5CE7]/30 active:scale-[0.98] transition-all text-base">
            <HiArrowDownTray className="w-5 h-5" />Get Started Free
          </Link>
        </motion.div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5CE7] to-[#00E5FF] flex items-center justify-center">
                  <HiArrowDownTray className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent">Universal Downloader</span>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">Download media from 1000+ platforms. Fast, free, and private.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li><Link to="/" className="text-sm text-zinc-500 hover:text-white transition-colors">Home</Link></li>
                <li><Link to="/about" className="text-sm text-zinc-500 hover:text-white transition-colors">About</Link></li>
                <li><Link to="/signup" className="text-sm text-zinc-500 hover:text-white transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Privacy Policy</span></li>
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Terms of Service</span></li>
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Cookie Policy</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2.5">
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Contact</span></li>
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">FAQ</span></li>
                <li><span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Documentation</span></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} Universal Downloader. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-600">Made with ❤️ for the open web</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
