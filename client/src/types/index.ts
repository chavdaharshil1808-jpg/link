export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  provider: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserSettings {
  id: string;
  theme: "DARK" | "LIGHT";
  language: string;
  downloadFolder: string;
  concurrentDownloads: number;
  defaultFormat: string;
  defaultQuality: string;
  proxy: string | null;
  cookiesFilePath: string | null;
  bandwidthLimit: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

export interface DownloadInfo {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  mediaType: "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT" | "ARCHIVE" | "FOLDER" | "PLAYLIST" | "SHORT" | "FILE" | "OTHER" | "UNKNOWN";
  status: "PENDING" | "ANALYZING" | "DOWNLOADING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  speed: number | null;
  eta: number | null;
  filename: string | null;
  filePath: string | null;
  format: string | null;
  quality: string | null;
  fileSize: number | null;
  errorMsg: string | null;
  downloadUrl: string | null;
  extension: string | null;
  driveFileId: string | null;
  driveIsFolder: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  mediaType: string;
  extension: string;
  isFolder: boolean;
}

export interface AnalyzeResult {
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  mediaType: string;
  platform: string;
  driveFileId?: string | null;
  driveIsFolder?: boolean;
  driveFiles?: DriveFileInfo[] | null;
  fileSize?: number | null;
  extension?: string | null;
  platformUrl: string;
  preview?: PreviewInfo | null;
  resolution?: string | null;
  error?: string | null;
  /** Actual downloadable media (prepare flow). */
  filename?: string | null;
  mimeType?: string | null;
  downloadUrl?: string | null;
  streamUrl?: string | null;
  /** Playlist / multi-image items. */
  items?: PrepareItem[] | null;
}

export interface PreviewInfo {
  url: string;
  formatId?: string | null;
  ext?: string | null;
  mediaType?: string;
}

export interface PrepareItem {
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  mediaType: string;
  extension?: string | null;
}

export interface Favorite {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  platform: string | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface InstagramAuthStatus {
  authenticated: boolean;
  hasCookieFile: boolean;
  browsersAvailable: string[];
  message: string;
}

export interface InstagramAuthPoll {
  authenticated: boolean;
  message: string;
}

export type InstagramStep =
  | "idle"
  | "detecting"
  | "auth_required"
  | "authenticating"
  | "extracting"
  | "preparing"
  | "downloading"
  | "merging"
  | "completed"
  | "error";

export interface InstagramProgressState {
  step: InstagramStep;
  progress: number;
  message: string;
  error?: string;
  downloadId?: string;
}
