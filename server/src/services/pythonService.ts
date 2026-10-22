import axios from "axios";
import { config } from "../config";

const pythonClient = axios.create({
  baseURL: config.PYTHON_SERVICE_URL,
  timeout: 300000, // 5 minutes for downloads
});

// Export the client for health checks
export { pythonClient };

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
  platformUrl: string;
  preview?: {
    url: string;
    formatId?: string | null;
    ext?: string | null;
    mediaType?: string;
  } | null;
  resolution?: string | null;
  fileSize?: number | null;
  extension?: string | null;
  driveFileId?: string | null;
  driveIsFolder?: boolean;
  driveFiles?: DriveFileInfo[] | null;
  error?: string | null;
}

export interface DownloadResult {
  id: string;
  status: string;
  filename: string | null;
  filepath: string | null;
  title: string | null;
}

export interface DownloadStatus {
  id: string;
  status: string;
  progress: number;
  speed: number;
  eta: number;
  filename: string | null;
  filepath: string | null;
  error: string | null;
}

function extractError(error: any, fallback: string): string {
  if (error?.code === "ECONNREFUSED" || error?.code === "ECONNRESET") {
    return "Download service is not running. Please start the Python service.";
  }
  if (error?.code === "ETIMEDOUT" || error?.code === "ECONNABORTED") {
    return "Download service timed out. The request took too long.";
  }
  const detail = error?.response?.data?.detail;
  if (detail) {
    return Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : String(detail);
  }
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

export async function checkPythonService(): Promise<boolean> {
  try {
    await pythonClient.get("/health", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function analyzeUrl(
  url: string,
  cookieContent?: string | null
): Promise<AnalyzeResult> {
  try {
    const { data } = await pythonClient.post<AnalyzeResult>("/api/download/analyze", {
      url,
      cookieContent: cookieContent || undefined,
    });
    return data;
  } catch (error: any) {
    throw new Error(extractError(error, "Analysis failed"));
  }
}

export async function startDownload(
  url: string,
  formatSpec: string,
  downloadSubtitles: boolean = false,
  downloadId?: string,
  cookieContent?: string | null
): Promise<DownloadResult> {
  try {
    const { data } = await pythonClient.post<DownloadResult>("/api/download/start", {
      url,
      format_spec: formatSpec,
      downloadSubtitles,
      downloadId: downloadId || "",
      cookieContent: cookieContent || undefined,
    });
    return data;
  } catch (error: any) {
    throw new Error(extractError(error, "Download failed"));
  }
}

export async function getDownloadStatus(downloadId: string): Promise<DownloadStatus | null> {
  try {
    const { data } = await pythonClient.get<DownloadStatus>(`/api/download/status/${downloadId}`);
    return data;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

export async function cancelDownload(downloadId: string): Promise<void> {
  try {
    await pythonClient.post("/api/download/cancel", { downloadId });
  } catch (error: any) {
    throw new Error(extractError(error, "Cancel failed"));
  }
}

export async function deleteFile(filepath: string): Promise<void> {
  try {
    await pythonClient.post("/api/download/delete", { filepath });
  } catch (error: any) {
    throw new Error(extractError(error, "Delete failed"));
  }
}
