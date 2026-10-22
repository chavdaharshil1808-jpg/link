import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, UserSettings } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isSessionReady: boolean;
  setAuth: (user: User) => void;
  setUser: (user: User) => void;
  setSessionReady: (ready: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isSessionReady: false,
      setAuth: (user) => set({ user, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      setSessionReady: (ready) => set({ isSessionReady: ready }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: "ud-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

interface SettingsState {
  settings: UserSettings | null;
  setSettings: (settings: UserSettings) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
  updateSettings: (partial) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...partial } : null,
    })),
}));

interface AdminAuthState {
  adminToken: string | null;
  adminUser: { email: string; role: string } | null;
  isAdminAuthenticated: boolean;
  setAuth: (token: string, user: { email: string; role: string }) => void;
  logout: () => void;
}

export const useAdminStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      adminToken: null,
      adminUser: null,
      isAdminAuthenticated: false,
      setAuth: (adminToken, adminUser) => set({ adminToken, adminUser, isAdminAuthenticated: true }),
      logout: () => set({ adminToken: null, adminUser: null, isAdminAuthenticated: false }),
    }),
    { name: "ud-admin-auth" }
  )
);

interface DownloadState {
  activeDownloads: Map<string, { progress: number; speed: number; eta: number }>;
  addDownload: (id: string) => void;
  updateDownload: (id: string, data: { progress: number; speed: number; eta: number }) => void;
  removeDownload: (id: string) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  activeDownloads: new Map(),
  addDownload: (id) =>
    set((state) => {
      const newMap = new Map(state.activeDownloads);
      newMap.set(id, { progress: 0, speed: 0, eta: 0 });
      return { activeDownloads: newMap };
    }),
  updateDownload: (id, data) =>
    set((state) => {
      const newMap = new Map(state.activeDownloads);
      newMap.set(id, data);
      return { activeDownloads: newMap };
    }),
  removeDownload: (id) =>
    set((state) => {
      const newMap = new Map(state.activeDownloads);
      newMap.delete(id);
      return { activeDownloads: newMap };
    }),
}));
