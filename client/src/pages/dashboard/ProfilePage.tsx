import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores";
import { profileApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  HiUser,
  HiShieldCheck,
  HiKey,
  HiClipboardDocument,
  HiExclamationTriangle,
  HiCheckBadge,
  HiXMark,
  HiArrowPath,
} from "react-icons/hi2";

export default function ProfilePage() {
  const { user, handleLogout } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || "");
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial = (user?.name?.[0] || user?.email?.[0] || "?").toUpperCase();

  const handleSaveName = async () => {
    if (!nameValue.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await profileApi.update({ name: nameValue.trim() });
      setUser(res.data.user || { ...user!, name: nameValue.trim() });
      setEditingName(false);
      toast.success("Name updated");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update name");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await profileApi.deleteAccount();
      toast.success("Account deleted");
      await handleLogout();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete account");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-white mb-1">Profile</h1>
        <p className="text-sm text-zinc-500 mb-5">
          Manage your account settings
        </p>
      </motion.div>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center text-white text-3xl font-bold shrink-0">
            {initial}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-white">
              {user?.name || "Unnamed User"}
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5">{user?.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/15 text-primary">
                <HiShieldCheck className="w-3 h-3" />
                {user?.provider || "Email"}
              </span>
              {user?.emailVerified ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-500/15 text-green-400">
                  <HiCheckBadge className="w-3 h-3" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-500/15 text-zinc-400">
                  <HiXMark className="w-3 h-3" />
                  Not Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Name Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <HiUser className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Name</h3>
            <p className="text-xs text-zinc-500">Your display name</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {editingName ? (
            <>
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                autoFocus
                className="flex-1 input-field text-sm"
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameValue(user?.name || "");
                }}
                className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <HiXMark className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm text-white">
                {user?.name || "Not set"}
              </p>
              <button
                onClick={() => setEditingName(true)}
                className="px-4 py-2.5 rounded-xl glass text-sm font-medium text-zinc-300 hover:text-white glass-hover"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Email */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
            <HiShieldCheck className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Email</h3>
            <p className="text-xs text-zinc-500">Your email address</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-zinc-400">{user?.email}</p>
          {user?.emailVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <HiCheckBadge className="w-3.5 h-3.5" />
              Verified
            </span>
          )}
        </div>
      </motion.div>

      {/* API Key */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <HiKey className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">API Key</h3>
            <p className="text-xs text-zinc-500">
              Use this to authenticate API requests
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-dark-border/40 rounded-xl px-4 py-3 font-mono text-xs text-zinc-400 truncate">
            {user?.id || "—"}
          </div>
          <button
            onClick={handleCopyApiKey}
            className={cn(
              "p-2.5 rounded-xl transition-colors",
              copied
                ? "bg-green-500/15 text-green-400"
                : "glass text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            title="Copy API Key"
          >
            {copied ? (
              <HiCheckBadge className="w-4 h-4" />
            ) : (
              <HiClipboardDocument className="w-4 h-4" />
            )}
          </button>
        </div>
      </motion.div>

      {/* Account Info */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass rounded-2xl p-6"
      >
        <h3 className="text-base font-semibold text-white mb-4">
          Account Details
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-dark-border/30">
            <span className="text-sm text-zinc-500">Role</span>
            <span className="text-sm text-white capitalize">{user?.role || "user"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-dark-border/30">
            <span className="text-sm text-zinc-500">Provider</span>
            <span className="text-sm text-white capitalize">{user?.provider || "Email"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500">Member since</span>
            <span className="text-sm text-white">
              {user?.createdAt ? formatDate(user.createdAt) : "—"}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-6 border border-red-500/20"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
            <HiExclamationTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-red-400">Danger Zone</h3>
            <p className="text-xs text-zinc-500">
              Irreversible account actions
            </p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          Once you delete your account, all data including downloads, history, and
          favorites will be permanently removed. This action cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-colors"
        >
          Delete Account
        </button>
      </motion.div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
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
                Delete Account?
              </h3>
              <p className="text-sm text-zinc-400 text-center mb-6">
                This will permanently delete your account and all associated data.
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-sm hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
