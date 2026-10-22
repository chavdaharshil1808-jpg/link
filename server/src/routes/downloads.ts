import { Router, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import * as pythonService from "../services/pythonService";
import { getMergedCookieContent } from "../services/providerSessions";
import { log } from "../services/logger";
import { config } from "../config";
import { isHlsUrl, rewriteHlsManifest } from "../utils/hlsProxy";

const pythonClient = axios.create({
  baseURL: config.PYTHON_SERVICE_URL,
  timeout: 300000,
});

const router = Router();

router.use(authenticate);

const analyzeSchema = z.object({
  url: z.string().url().max(2048),
});

const downloadSchema = z.object({
  url: z.string().url().max(2048),
  formatSpec: z.string().min(1).default("best"),
  downloadSubtitles: z.boolean().default(false),
});

const fetchSchema = z.object({
  url: z.string().url().max(2048),
  formatSpec: z.string().min(1).default("best"),
  downloadSubtitles: z.boolean().default(false),
  driveAll: z.boolean().default(false),
});

const prepareSchema = z.object({
  url: z.string().url().max(2048),
  formatSpec: z.string().min(1).default("best"),
  downloadSubtitles: z.boolean().default(false),
});

function isTransientConnectionError(error: any): boolean {
  const code = error?.code || error?.cause?.code;
  const message =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    code === "EPIPE" ||
    code === "EAI_AGAIN" ||
    message.includes("socket hang up") ||
    message.includes("econnreset")
  );
}

async function postFetchWithRetry(payload: unknown): Promise<import("axios").AxiosResponse> {
  const attempt = () =>
    pythonClient.post("/api/download/fetch", payload, {
      responseType: "stream",
      timeout: 0,
    });
  try {
    return await attempt();
  } catch (error: any) {
    if (isTransientConnectionError(error)) {
      log("WARN", "Downloads", "Retrying Python fetch after transient connection error", {
        code: error?.code,
      });
      return await attempt();
    }
    throw error;
  }
}

function parseFilenameFromDisposition(disposition: unknown): string {
  if (typeof disposition !== "string") return "download";
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1].replace(/"/g, ""));
    } catch {
      return star[1];
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain && plain[1] ? plain[1] : "download";
}

function mediaTypeFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("video/")) return "VIDEO";
  if (ct.startsWith("audio/")) return "AUDIO";
  if (ct.startsWith("image/")) return "IMAGE";
  if (ct.startsWith("text/") || ct.includes("pdf") || ct.includes("document")) {
    return "DOCUMENT";
  }
  if (
    ct.includes("zip") ||
    ct.includes("rar") ||
    ct.includes("tar") ||
    ct.includes("7z") ||
    ct.includes("gzip") ||
    ct.includes("compressed")
  ) {
    return "ARCHIVE";
  }
  return "FILE";
}

router.post("/analyze", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  log("INFO", "Downloads", `Analyze request | user=${req.userId}`, { url: req.body.url?.slice(0, 100) });
  try {
    const body = analyzeSchema.parse(req.body);
    const cookieContent = await getMergedCookieContent(req.userId!);
    log("INFO", "Downloads", "Sending analyze request to Python service", {
      url: body.url.slice(0, 100),
      usingCookies: Boolean(cookieContent),
    });
    const result = await pythonService.analyzeUrl(body.url, cookieContent);
    const duration = Date.now() - start;
    log("INFO", "Downloads", `Analyze success | user=${req.userId} | ${duration}ms`, { title: result.title?.slice(0, 80) });
    res.json(result);
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      log("WARN", "Downloads", `Analyze validation failed | ${duration}ms`, { details: error.errors });
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      log("ERROR", "Downloads", `Python service unreachable | ${duration}ms`);
      res.status(503).json({ error: "Download service is not running. Please start the Python service (python -m uvicorn app.main:app --reload --port 8001)." });
      return;
    }
    if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
      log("ERROR", "Downloads", `Python service timed out | ${duration}ms`);
      res.status(504).json({ error: "Download service timed out. The request took too long or the service is overloaded." });
      return;
    }
    const message = error instanceof Error ? error.message : "Analysis failed";
    log("ERROR", "Downloads", `Analyze failed | ${duration}ms`, { error: message });
    res.status(400).json({ error: message });
  }
});

router.post("/start", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  log("INFO", "Downloads", `Start download request | user=${req.userId}`, { url: req.body.url?.slice(0, 100), formatSpec: req.body.formatSpec });
  try {
    const body = downloadSchema.parse(req.body);

    const download = await prisma.download.create({
      data: {
        userId: req.userId!,
        url: body.url,
        mediaType: "VIDEO",
        status: "ANALYZING",
        format: body.formatSpec,
      },
    });
    log("INFO", "Downloads", "Download record created", { downloadId: download.id });

    try {
      const cookieContent = await getMergedCookieContent(req.userId!);
      log("INFO", "Downloads", "Calling Python service startDownload", {
        downloadId: download.id,
        url: body.url.slice(0, 100),
        usingCookies: Boolean(cookieContent),
      });
      const result = await pythonService.startDownload(
        body.url,
        body.formatSpec,
        body.downloadSubtitles,
        download.id,
        cookieContent
      );

      await prisma.download.update({
        where: { id: download.id },
        data: { status: "DOWNLOADING" },
      });

      const duration = Date.now() - start;
      log("INFO", "Downloads", `Download started successfully | ${duration}ms`, { downloadId: download.id, taskId: result.id });

      res.json({
        id: download.id,
        status: "downloading",
        taskId: result.id,
      });
    } catch (error) {
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : "Download failed";

      log("ERROR", "Downloads", `Download failed to start | ${duration}ms`, { downloadId: download.id, error: errorMsg });

      if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
        await prisma.download.update({
          where: { id: download.id },
          data: { status: "FAILED", errorMsg: "Download service is not running. Please start the Python service." },
        });
        res.status(503).json({ error: "Download service is not running. Please start the Python service (python -m uvicorn app.main:app --reload --port 8001)." });
        return;
      }

      if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
        await prisma.download.update({
          where: { id: download.id },
          data: { status: "FAILED", errorMsg: "Download service timed out." },
        });
        res.status(504).json({ error: "Download service timed out. The request took too long." });
        return;
      }

      await prisma.download.update({
        where: { id: download.id },
        data: { status: "FAILED", errorMsg },
      });
      res.status(500).json({ error: errorMsg });
    }
  } catch (error) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      log("WARN", "Downloads", `Download validation failed | ${duration}ms`, { details: error.errors });
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    log("ERROR", "Downloads", `Download start error | ${duration}ms`, { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/status/:downloadId", async (req: AuthRequest, res: Response) => {
  try {
    const download = await prisma.download.findFirst({
      where: { id: req.params.downloadId, userId: req.userId! },
    });

    if (!download) {
      res.status(404).json({ error: "Download not found" });
      return;
    }

    let pythonStatus = null;
    if (download.status === "DOWNLOADING" || download.status === "ANALYZING") {
      try {
        pythonStatus = await pythonService.getDownloadStatus(download.id);

        if (pythonStatus) {
          if (pythonStatus.status === "completed") {
            await prisma.download.update({
              where: { id: download.id },
              data: {
                status: "COMPLETED",
                progress: 100,
                filename: pythonStatus.filename,
                filePath: pythonStatus.filepath,
              },
            });
            download.status = "COMPLETED";
            download.progress = 100;
            log("INFO", "Downloads", "Download completed", { downloadId: download.id, filename: pythonStatus.filename });
          } else if (pythonStatus.status === "failed") {
            await prisma.download.update({
              where: { id: download.id },
              data: {
                status: "FAILED",
                errorMsg: pythonStatus.error,
              },
            });
            download.status = "FAILED";
            download.errorMsg = pythonStatus.error;
            log("ERROR", "Downloads", "Download failed", { downloadId: download.id, error: pythonStatus.error });
          } else {
            download.progress = pythonStatus.progress ?? 0;
            download.speed = pythonStatus.speed ?? 0;
            download.eta = pythonStatus.eta ?? 0;
          }
        }
      } catch (pyError) {
        log("WARN", "Downloads", "Python status check failed", { downloadId: download.id, error: String(pyError) });
      }
    }

    const isCompleted = download.status === "COMPLETED";
    const ext = download.filename ? download.filename.split(".").pop() || null : null;
    res.json({
      id: download.id,
      url: download.url,
      title: download.title,
      thumbnail: download.thumbnail,
      mediaType: download.mediaType,
      status: download.status,
      progress: download.progress,
      speed: download.speed,
      eta: download.eta,
      filename: download.filename,
      filePath: download.filePath,
      format: download.format,
      quality: download.quality,
      fileSize: download.fileSize,
      errorMsg: download.errorMsg,
      downloadUrl: isCompleted ? `/api/downloads/file/${download.id}` : null,
      extension: ext,
      driveFileId: null,
      driveIsFolder: false,
      createdAt: download.createdAt,
      updatedAt: download.updatedAt,
    });
  } catch (error) {
    log("ERROR", "Downloads", "Status check error", { downloadId: req.params.downloadId, error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/prepare", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  log("INFO", "Downloads", `Prepare request | user=${req.userId}`, {
    url: req.body.url?.slice(0, 100),
    formatSpec: req.body.formatSpec,
  });
  try {
    const body = prepareSchema.parse(req.body);
    const cookieContent = await getMergedCookieContent(req.userId!);
    const { data } = await pythonClient.post(
      "/api/download/prepare",
      {
        url: body.url,
        format_spec: body.formatSpec,
        cookieContent: cookieContent || undefined,
        downloadSubtitles: body.downloadSubtitles,
      },
      { timeout: 1500000 }
    );

    // Rewrite python-internal file paths into this proxy's authenticated URLs.
    const fileId = String(data.downloadUrl).split("/").pop() || "";
    const filePath = `/api/downloads/file/${fileId}`;
    const mediaResult = {
      ...data,
      downloadUrl: filePath,
      streamUrl: `${filePath}?inline=1`,
      fileSize: data.filesize ?? data.fileSize ?? null,
    };

    const duration = Date.now() - start;
    log("INFO", "Downloads", `Prepare success | user=${req.userId} | ${duration}ms`, {
      title: mediaResult.title?.slice(0, 80),
      mediaType: mediaResult.mediaType,
      filename: mediaResult.filename,
      filesize: mediaResult.filesize,
    });
    res.json(mediaResult);
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      log("WARN", "Downloads", `Prepare validation failed | ${duration}ms`, { details: error.errors });
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      log("ERROR", "Downloads", `Python service unreachable | ${duration}ms`);
      res.status(503).json({ error: "Download service is not running. Please start the Python service." });
      return;
    }
    const message = error instanceof Error ? error.message : "Prepare failed";
    log("ERROR", "Downloads", `Prepare failed | ${duration}ms`, { error: message });
    res.status(400).json({ error: message });
  }
});

router.get("/file/:downloadId", async (req: AuthRequest, res: Response) => {
  try {
    const downloadId = req.params.downloadId;

    const record = await prisma.download.findUnique({ where: { id: downloadId } });
    if (record) {
      if (record.userId !== req.userId) {
        res.status(403).json({ error: "You do not have access to this download." });
        return;
      }
      if (record.status === "FAILED" || record.status === "CANCELLED") {
        res.status(409).json({ error: `Download is ${record.status.toLowerCase()}.` });
        return;
      }
    }

    const headers: Record<string, string> = {};
    if (req.headers.range) headers["Range"] = req.headers.range;
    const fileResp = await pythonClient.get(
      `/api/download/file/${downloadId}`,
      {
        params: { inline: req.query.inline === "1" ? 1 : 0 },
        headers,
        responseType: "stream",
        timeout: 0,
      }
    );
    const disposition = fileResp.headers["content-disposition"];
    const contentType = fileResp.headers["content-type"];
    const contentRange = fileResp.headers["content-range"];
    const contentLength = fileResp.headers["content-length"];

    res.status(fileResp.status);
    res.setHeader("Content-Type", typeof contentType === "string" ? contentType : "application/octet-stream");
    if (typeof disposition === "string") res.setHeader("Content-Disposition", disposition);
    if (typeof contentRange === "string") res.setHeader("Content-Range", contentRange);
    if (contentLength) {
      res.setHeader("Content-Length", typeof contentLength === "string" ? contentLength : String(contentLength));
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    fileResp.data.pipe(res);
    fileResp.data.on("error", (err: Error) => {
      log("ERROR", "Downloads", "File stream error", {
        downloadId,
        error: err.message,
      });
      if (!res.headersSent) res.status(500).json({ error: "Failed to stream file" });
    });
  } catch (error: any) {
    log("ERROR", "Downloads", "File download failed", {
      downloadId: req.params.downloadId,
      error: String(error),
      code: error?.code,
    });
    if (error?.response?.status === 404) {
      res.status(404).json({ error: "File not found or has expired. Prepare the media again." });
      return;
    }
    if (error?.code === "ECONNREFUSED" || error?.code === "ECONNRESET") {
      res.status(503).json({ error: "Download service is not running. Please try again later." });
      return;
    }
    if (!res.headersSent) res.status(502).json({ error: "Failed to download file" });
  }
});

router.post("/fetch", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  log("INFO", "Downloads", `Fetch (direct download) request | user=${req.userId}`, {
    url: req.body.url?.slice(0, 100),
    formatSpec: req.body.formatSpec,
  });
  try {
    const body = fetchSchema.parse(req.body);
    const cookieContent = await getMergedCookieContent(req.userId!);
    log("INFO", "Downloads", "Calling Python fetch", {
      usingCookies: Boolean(cookieContent),
    });
    const upstream = await postFetchWithRetry({
      url: body.url,
      format_spec: body.formatSpec,
      cookieContent: cookieContent || undefined,
      downloadSubtitles: body.downloadSubtitles,
      drive_all: body.driveAll,
    });

    const disposition = upstream.headers["content-disposition"];
    const contentType = upstream.headers["content-type"];
    const contentLength = upstream.headers["content-length"];

    res.status(upstream.status);
    res.setHeader("Content-Type", typeof contentType === "string" ? contentType : "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      typeof disposition === "string" ? disposition : 'attachment; filename="download"'
    );
    res.setHeader("Cache-Control", "no-store");
    if (contentLength) {
      res.setHeader("Content-Length", String(contentLength));
    }
    upstream.data.pipe(res);
    upstream.data.on("error", (err: Error) => {
      log("ERROR", "Downloads", "Fetch stream error", { error: err.message });
      if (!res.headersSent) res.status(502).json({ error: "Failed to download media" });
    });
    upstream.data.on("end", () => {
      const duration = Date.now() - start;
      log("INFO", "Downloads", `Fetch complete | ${duration}ms | user=${req.userId}`);
      const filename = parseFilenameFromDisposition(disposition);
      prisma.download
        .create({
          data: {
            userId: req.userId!,
            url: body.url,
            title: filename.replace(/\.[^.]+$/, ""),
            mediaType: mediaTypeFromContentType(
              typeof contentType === "string" ? contentType : ""
            ),
            status: "COMPLETED",
            format: body.formatSpec,
            progress: 100,
            filename,
          },
        })
        .then(() => {
          log("INFO", "Downloads", "History record created from fetch", {
            downloadId: undefined,
          });
        })
        .catch((err: Error) => {
          log("WARN", "Downloads", "Failed to record fetch history", {
            error: err.message,
          });
        });
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      log("WARN", "Downloads", `Fetch validation failed | ${duration}ms`, { details: error.errors });
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    let status = 500;
    let message = "Download failed";
    try {
      if (error?.response) {
        status = error.response.status || 500;
        const stream = error.response.data;
        if (stream && typeof stream.on === "function") {
          const text = await new Promise<string>((resolve) => {
            const chunks: Buffer[] = [];
            stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
            stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            stream.on("error", () => resolve(""));
          });
          try {
            const parsed = JSON.parse(text);
            if (typeof parsed.detail === "string") message = parsed.detail;
            else if (typeof parsed.error === "string") message = parsed.error;
          } catch {
            if (text) message = text;
          }
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
    } catch {
      message = error instanceof Error ? error.message : message;
    }
    log("ERROR", "Downloads", `Fetch failed | ${duration}ms`, { error: message });
    res.status(status).json({ error: message });
  }
});

router.get("/stream", async (req: AuthRequest, res: Response) => {
  const mediaUrl = typeof req.query.url === "string" ? req.query.url : "";
  try {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    res.status(400).json({ error: "Invalid media URL" });
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers["Range"] = req.headers.range;
    const upstream = await pythonClient.get("/api/download/stream", {
      params: { url: mediaUrl },
      headers,
      responseType: "stream",
      timeout: 0,
    });
    const upstreamContentType = upstream.headers["content-type"];
    const hls =
      isHlsUrl(mediaUrl) ||
      (typeof upstreamContentType === "string" &&
        upstreamContentType.toLowerCase().includes("mpegurl"));

    // HLS manifests must be rewritten so segments route through this proxy.
    if (hls) {
      const chunks: Buffer[] = [];
      for await (const chunk of upstream.data) {
        chunks.push(Buffer.from(chunk));
      }
      const token =
        typeof req.query.token === "string" ? req.query.token : null;
      const manifest = rewriteHlsManifest(
        Buffer.concat(chunks),
        mediaUrl,
        "/api/downloads/stream",
        token
      );
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      res.send(manifest);
      return;
    }

    res.status(upstream.status);
    res.setHeader("Content-Disposition", "inline");
    const passthrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
    ];
    for (const key of passthrough) {
      const value = upstream.headers[key];
      if (value !== undefined) res.setHeader(key, String(value));
    }
    upstream.data.pipe(res);
    upstream.data.on("error", () => res.destroy());
  } catch (error: any) {
    log("ERROR", "Downloads", "Media stream failed", { error: String(error) });
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to stream media" });
    } else {
      res.end();
    }
  }
});

router.post("/cancel/:downloadId", async (req: AuthRequest, res: Response) => {
  try {
    const download = await prisma.download.findFirst({
      where: { id: req.params.downloadId, userId: req.userId! },
    });

    if (!download) {
      res.status(404).json({ error: "Download not found" });
      return;
    }

    await pythonService.cancelDownload(download.id);
    await prisma.download.update({
      where: { id: download.id },
      data: { status: "CANCELLED" },
    });

    log("INFO", "Downloads", "Download cancelled", { downloadId: download.id });
    res.json({ message: "Download cancelled" });
  } catch (error) {
    log("ERROR", "Downloads", "Cancel error", { downloadId: req.params.downloadId, error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:downloadId", async (req: AuthRequest, res: Response) => {
  try {
    const download = await prisma.download.findFirst({
      where: { id: req.params.downloadId, userId: req.userId! },
    });

    if (!download) {
      res.status(404).json({ error: "Download not found" });
      return;
    }

    if (download.filePath) {
      try {
        await pythonService.deleteFile(download.filePath);
      } catch {
        // File might already be deleted
      }
    }

    await prisma.download.delete({ where: { id: download.id } });
    log("INFO", "Downloads", "Download deleted", { downloadId: download.id });
    res.json({ message: "Download deleted" });
  } catch (error) {
    log("ERROR", "Downloads", "Delete error", { downloadId: req.params.downloadId, error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/history", async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const [downloads, total] = await Promise.all([
      prisma.download.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.download.count({ where: { userId: req.userId! } }),
    ]);

    res.json({
      downloads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log("ERROR", "Downloads", "History fetch error", { error: String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
