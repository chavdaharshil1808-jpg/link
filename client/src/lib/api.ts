import axios from "axios";
import type { AuthResponse } from "@/types";
import {
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredSession,
  setSessionMeta,
  getSessionMeta,
  type SessionMeta,
} from "@/lib/sessionManager";

const AUTH_STORAGE_KEY = "ud-auth";

let onTokenRefreshed: ((token: string) => void) | null = null;

export function setOnTokenRefreshed(cb: ((token: string) => void) | null) {
  onTokenRefreshed = cb;
}

export function getApiError(err: any, fallback = "Something went wrong"): string {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response?.data?.detail) {
    const detail = err.response.data.detail;
    return Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : detail;
  }
  if (err?.message) return err.message;
  return fallback;
}

// Backend server URL (used for direct browser navigations like OAuth)
export const SERVER_URL = "http://localhost:3001";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Access token lives in memory only. The refresh token is persisted in storage
// and is the key to silently restoring the session after a reload.
let accessToken: string | null = null;
let refreshToken: string | null = getStoredRefreshToken();
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setRefreshToken(token: string | null, meta?: Partial<SessionMeta>) {
  refreshToken = token;
  if (token && meta) {
    setSessionMeta({ ...getSessionMeta(), ...meta });
  }
  setStoredRefreshToken(token);
  if (!token) {
    setStoredRefreshToken(null);
  }
}

export function clearSessionTokens() {
  accessToken = null;
  refreshToken = null;
  clearStoredSession();
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

function saveBlobFromResponse(
  response: { data: Blob; headers: Record<string, any> },
  fallbackName: string
) {
  let filename = fallbackName;
  const disposition = response.headers?.["content-disposition"];
  if (typeof disposition === "string") {
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (match && match[1]) filename = match[1];
  }
  const blobUrl = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

async function readBlobError(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) return parsed.error;
          if (parsed?.detail) return parsed.detail;
        } catch {
          return text;
        }
      }
    } catch {}
  }
  return getApiError(err, fallback);
}

async function performRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const { data } = await axios.post<AuthResponse>(
      "/api/auth/refresh",
      { refreshToken },
      { withCredentials: true }
    );
    accessToken = data.accessToken;
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
      setStoredRefreshToken(data.refreshToken);
    }
    if (onTokenRefreshed) onTokenRefreshed(data.accessToken);
    return true;
  } catch {
    clearSessionTokens();
    return false;
  }
}

function ensureRefreshed(): Promise<boolean> {
  if (accessToken) return Promise.resolve(true);
  refreshPromise = refreshPromise ?? performRefresh();
  return refreshPromise.finally(() => {
    refreshPromise = null;
  });
}

export async function restoreSession(): Promise<boolean> {
  if (!refreshToken) return false;
  const ok = await ensureRefreshed();
  if (!ok || !accessToken) return false;
  try {
    const { data } = await api.get<{ user: AuthResponse["user"] }>("/auth/me");
    return Boolean(data.user);
  } catch {
    clearSessionTokens();
    return false;
  }
}

// Admin token (separate from user JWT)
let adminAccessToken: string | null = null;

export function setAdminAccessToken(token: string | null) {
  adminAccessToken = token;
}

export function getAdminAccessToken() {
  return adminAccessToken;
}

api.interceptors.request.use((config) => {
  // Use admin token for admin routes, user token otherwise
  if (config.url?.startsWith("/admin/") && adminAccessToken) {
    config.headers.Authorization = `Bearer ${adminAccessToken}`;
  } else if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest._isRefresh) {
      originalRequest._retry = true;
      const ok = await ensureRefreshed();
      if (ok && accessToken) {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      }
      clearSessionTokens();
      if (
        window.location.pathname !== "/login" &&
        !window.location.pathname.startsWith("/auth/") &&
        !window.location.pathname.startsWith("/admin")
      ) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

/** Append the access token to a relative file/stream path (anchor/img/video tags
 *  can't send Authorization headers, so the query param is used). */
function withToken(path: string): string {
  const token = getAccessToken();
  if (!token) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

/** Trigger a browser save for a prepared downloadUrl path. */
function triggerDownload(path: string, filename?: string) {
  const a = document.createElement("a");
  a.href = withToken(path);
  a.download = filename || "download";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const authApi = {
  signup: (data: { email: string; password: string; name?: string }) =>
    api.post<AuthResponse>("/auth/signup", data),
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    api.post<AuthResponse>("/auth/login", data),
  magicLink: (data: { email: string }) =>
    api.post<{ message: string }>("/auth/magic-link", data),
  forgotPassword: (data: { email: string }) =>
    api.post<{ message: string }>("/auth/magic-link", data),
  verifyMagic: (token: string) =>
    api.post<AuthResponse>("/auth/verify-magic", { token }),
  logout: () => api.post("/auth/logout"),
  logoutAll: () => api.post("/auth/logout-all"),
  me: () => api.get<{ user: AuthResponse["user"] }>("/auth/me"),
  sessions: () => api.get<{ sessions: Array<Record<string, any>> }>("/auth/sessions"),
  revokeSession: (sessionId: string) => api.delete(`/auth/sessions/${sessionId}`),
};

export const downloadApi = {
  analyze: (url: string) => api.post("/downloads/analyze", { url }),
  start: (data: { url: string; formatSpec: string; downloadSubtitles?: boolean }) =>
    api.post("/downloads/start", data),
  status: (id: string) => api.get(`/downloads/status/${id}`),
  cancel: (id: string) => api.post(`/downloads/cancel/${id}`),
  delete: (id: string) => api.delete(`/downloads/${id}`),
  history: (page = 1, limit = 20) =>
    api.get(`/downloads/history?page=${page}&limit=${limit}`),
  // Prepare = analyze internally + download the best format to a temp file,
  // returning real media (downloadUrl/streamUrl), never raw metadata JSON.
  prepare: (url: string, formatSpec = "best", downloadSubtitles = false) =>
    api.post("/downloads/prepare", {
      url,
      formatSpec,
      downloadSubtitles,
    }),
  preparedStreamUrl: (path: string) => withToken(path),
  preparedDownload: (path: string, filename?: string) =>
    triggerDownload(path, filename),
  // Direct file download (triggers browser save dialog)
  downloadFile: (downloadId: string, filename?: string) => {
    const token = getAccessToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const a = document.createElement("a");
    a.href = `/api/downloads/file/${downloadId}${qs}`;
    a.download = filename || "download";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
  // Inline playback URL (proxied, Range-aware) for <video>/<audio>/<img> tags
  streamUrl: (mediaUrl: string) => {
    const token = getAccessToken();
    const qs = token ? `&token=${encodeURIComponent(token)}` : "";
    return `/api/downloads/stream?url=${encodeURIComponent(mediaUrl)}${qs}`;
  },
  // Save As (fetch blob then trigger download)
  saveAs: async (downloadId: string, filename?: string) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/downloads/file/${downloadId}`, { headers });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      downloadApi.downloadFile(downloadId, filename);
    }
  },
  // Direct media download — the server downloads the real file with yt-dlp and
  // streams the actual bytes back (never metadata JSON).
  // driveAll: bundle an entire Google Drive folder into a ZIP.
  fetchMedia: async (
    url: string,
    formatSpec: string,
    downloadSubtitles?: boolean,
    driveAll?: boolean
  ) => {
    try {
      const res = await api.post(
        "/downloads/fetch",
        {
          url,
          formatSpec,
          downloadSubtitles: Boolean(downloadSubtitles),
          driveAll: Boolean(driveAll),
        },
        { responseType: "blob", timeout: 0 }
      );
      saveBlobFromResponse(res as any, "download");
    } catch (err) {
      throw new Error(await readBlobError(err, "Failed to download media"));
    }
  },
};

export const favoritesApi = {
  list: () => api.get("/favorites"),
  add: (data: { url: string; title?: string; thumbnail?: string; platform?: string }) =>
    api.post("/favorites", data),
  remove: (url: string) => api.delete(`/favorites/${encodeURIComponent(url)}`),
};

export const settingsApi = {
  get: () => api.get("/settings"),
  update: (data: Record<string, unknown>) => api.put("/settings", data),
};

export const instagramApi = {
  authStatus: () => api.get("/instagram/auth/status"),
  authBrowser: () => api.post("/instagram/auth/browser"),
  authPoll: () => api.get("/instagram/auth/poll"),
  analyze: (url: string) => api.post("/instagram/analyze", { url }),
  getCookies: () => api.get("/instagram/auth/cookies"),
  deleteCookies: () => api.delete("/instagram/auth/cookies"),
};

export const cookiesApi = {
  list: () => api.get("/cookies"),
  import: (data: { provider: string; cookieContent: string }) =>
    api.post("/cookies", data),
  remove: (provider: string) => api.delete(`/cookies/${provider}`),
};

export const publicApi = {
  analyze: (url: string) => api.post("/public/download/analyze", { url }),
  start: (url: string, formatSpec: string) =>
    api.post("/public/download/start", { url, formatSpec }),
  status: (taskId: string) => api.get(`/public/download/status/${taskId}`),
  fileUrl: (taskId: string) => {
    const token = getAccessToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    return `/api/public/download/file/${taskId}${qs}`;
  },
  // Prepare = analyze + download the best format to a temp file, returning
  // real media (downloadUrl/streamUrl) instead of metadata JSON.
  prepare: (url: string, formatSpec = "best", downloadSubtitles = false) =>
    api.post("/public/download/prepare", { url, formatSpec, downloadSubtitles }),
  preparedStreamUrl: (path: string) => withToken(path),
  preparedDownload: (path: string, filename?: string) =>
    triggerDownload(path, filename),
  // Inline playback URL (proxied, Range-aware) for <video>/<audio>/<img> tags
  streamUrl: (mediaUrl: string) => {
    const token = getAccessToken();
    const qs = token ? `&token=${encodeURIComponent(token)}` : "";
    return `/api/public/download/stream?url=${encodeURIComponent(mediaUrl)}${qs}`;
  },
  downloadFile: (taskId: string) => {
    const token = getAccessToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const a = document.createElement("a");
    a.href = `/api/public/download/file/${taskId}${qs}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
  // Direct media download returning the actual media bytes.
  // driveAll: bundle an entire Google Drive folder into a ZIP.
  fetchMedia: async (url: string, formatSpec: string, driveAll?: boolean) => {
    try {
      const res = await api.post(
        "/public/download/fetch",
        { url, formatSpec, driveAll: Boolean(driveAll) },
        { responseType: "blob", timeout: 0 }
      );
      saveBlobFromResponse(res as any, "download");
    } catch (err) {
      throw new Error(await readBlobError(err, "Failed to download media"));
    }
  },
};

export const adminApi = {
  login: (email: string, password: string) =>
    axios.post<{ accessToken: string; user: { email: string; role: string } }>("/api/admin/login", { email, password }),
  dashboard: () => api.get("/admin/dashboard"),
  users: (page = 1, limit = 20, search = "") =>
    api.get(`/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`),
  toggleUser: (userId: string) => api.put(`/admin/users/${userId}/toggle-status`),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),
  downloads: (page = 1, limit = 20) =>
    api.get(`/admin/downloads?page=${page}&limit=${limit}`),
  analytics: () => api.get("/admin/analytics"),
};

export const profileApi = {
  update: (data: { name?: string; avatar?: string | null }) =>
    api.put("/profile/profile", data),
  deleteAccount: () => api.delete("/profile/account"),
  stats: () => api.get("/profile/stats"),
};

export const historyApi = {
  clearAll: () => api.delete("/history/all"),
};
