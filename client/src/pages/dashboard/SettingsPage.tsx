import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { settingsApi } from "@/lib/api";
import { useSettingsStore } from "@/stores";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/types";
import {
  HiSun,
  HiMoon,
  HiCog,
  HiGlobeAlt,
  HiWrench,
  HiCheckCircle,
  HiArrowPath,
} from "react-icons/hi2";

type SettingsForm = Pick<
  UserSettings,
  | "theme"
  | "concurrentDownloads"
  | "defaultFormat"
  | "defaultQuality"
  | "proxy"
  | "bandwidthLimit"
  | "cookiesFilePath"
  | "downloadFolder"
>;

export default function SettingsPage() {
  const { setSettings, updateSettings } = useSettingsStore();
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data as UserSettings;
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isDirty },
  } = useForm<SettingsForm>({
    defaultValues: {
      theme: "DARK",
      concurrentDownloads: 3,
      defaultFormat: "best",
      defaultQuality: "best",
      proxy: "",
      bandwidthLimit: 0,
      cookiesFilePath: "",
      downloadFolder: "",
    },
  });

  useEffect(() => {
    if (data) {
      setSettings(data);
      reset({
        theme: data.theme,
        concurrentDownloads: data.concurrentDownloads,
        defaultFormat: data.defaultFormat,
        defaultQuality: data.defaultQuality,
        proxy: data.proxy || "",
        bandwidthLimit: data.bandwidthLimit,
        cookiesFilePath: data.cookiesFilePath || "",
        downloadFolder: data.downloadFolder,
      });
    }
  }, [data, setSettings, reset]);

  const currentTheme = watch("theme");

  const onSubmit = async (formData: SettingsForm) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        theme: formData.theme,
        concurrentDownloads: formData.concurrentDownloads,
        defaultFormat: formData.defaultFormat,
        defaultQuality: formData.defaultQuality,
        proxy: formData.proxy || null,
        bandwidthLimit: formData.bandwidthLimit,
        cookiesFilePath: formData.cookiesFilePath || null,
        downloadFolder: formData.downloadFolder,
      };
      await settingsApi.update(payload);
      updateSettings(formData);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <HiArrowPath className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-zinc-500 mb-5">
          Configure your download preferences
        </p>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Appearance */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <HiSun className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Appearance</h2>
              <p className="text-xs text-zinc-500">Customize the look and feel</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-3 block">
                Theme
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValue("theme", "DARK", { shouldDirty: true })}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                    currentTheme === "DARK"
                      ? "border-primary/50 bg-primary/10"
                      : "border-dark-border/50 bg-dark-border/20 hover:border-zinc-600"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#09090B] border border-zinc-800 flex items-center justify-center">
                    <HiMoon className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">Dark</p>
                    <p className="text-xs text-zinc-500">Easy on the eyes</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setValue("theme", "LIGHT", { shouldDirty: true })}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                    currentTheme === "LIGHT"
                      ? "border-primary/50 bg-primary/10"
                      : "border-dark-border/50 bg-dark-border/20 hover:border-zinc-600"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                    <HiSun className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">Light</p>
                    <p className="text-xs text-zinc-500">Bright and clean</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Download */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <HiCog className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Download</h2>
              <p className="text-xs text-zinc-500">Configure download behavior</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-zinc-300">
                  Concurrent Downloads
                </label>
                <span className="text-sm font-mono text-primary">
                  {watch("concurrentDownloads")}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                {...register("concurrentDownloads", {
                  valueAsNumber: true,
                  onChange: () => {},
                })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-dark-border/60 accent-primary"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-600">1</span>
                <span className="text-[10px] text-zinc-600">10</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                  Default Format
                </label>
                <select
                  {...register("defaultFormat")}
                  className="input-field text-sm"
                >
                  <option value="best">Best Quality</option>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mkv">MKV</option>
                  <option value="mp3">MP3</option>
                  <option value="flac">FLAC</option>
                  <option value="opus">Opus</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                  Default Quality
                </label>
                <select
                  {...register("defaultQuality")}
                  className="input-field text-sm"
                >
                  <option value="best">Best</option>
                  <option value="2160">2160p (4K)</option>
                  <option value="1440">1440p (2K)</option>
                  <option value="1080">1080p (FHD)</option>
                  <option value="720">720p (HD)</option>
                  <option value="480">480p (SD)</option>
                  <option value="360">360p</option>
                </select>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Network */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
              <HiGlobeAlt className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Network</h2>
              <p className="text-xs text-zinc-500">Proxy and bandwidth settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Proxy URL
              </label>
              <input
                type="text"
                placeholder="socks5://127.0.0.1:1080"
                {...register("proxy")}
                className="input-field text-sm"
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                Supports HTTP, HTTPS, and SOCKS5 proxies
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-zinc-300">
                  Bandwidth Limit
                </label>
                <span className="text-xs text-zinc-500">
                  {watch("bandwidthLimit") === 0
                    ? "Unlimited"
                    : `${watch("bandwidthLimit")} KB/s`}
                </span>
              </div>
              <input
                type="number"
                placeholder="0 for unlimited"
                min={0}
                {...register("bandwidthLimit", { valueAsNumber: true })}
                className="input-field text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Cookies File Path
              </label>
              <input
                type="text"
                placeholder="/path/to/cookies.txt"
                {...register("cookiesFilePath")}
                className="input-field text-sm"
              />
              <p className="text-[11px] text-zinc-600 mt-1">
                Netscape format cookies file for authenticated downloads
              </p>
            </div>
          </div>
        </motion.div>

        {/* Advanced */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <HiWrench className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Advanced</h2>
              <p className="text-xs text-zinc-500">
                Paths and advanced configuration
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Download Folder
              </label>
              <input
                type="text"
                placeholder="~/Downloads"
                {...register("downloadFolder")}
                className="input-field text-sm"
              />
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex justify-end pb-8"
        >
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 bg-gradient-primary text-white font-semibold px-8 py-3 rounded-xl hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {saving ? (
              <>
                <HiArrowPath className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <HiCheckCircle className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </motion.div>
      </form>
    </div>
  );
}
