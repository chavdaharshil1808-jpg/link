import { Router, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { config } from "../config";
import { validateUrl } from "../utils/urlValidation";
import { authenticate, AuthRequest } from "../middleware/auth";
import { isHlsUrl, rewriteHlsManifest } from "../utils/hlsProxy";

const pythonClient = axios.create({
  baseURL: config.PYTHON_SERVICE_URL,
  timeout: 300000,
});

const analyzeSchema = z.object({
  url: z.string().min(1).max(2048),
});

const downloadSchema = z.object({
  url: z.string().min(1).max(2048),
  formatSpec: z.string().min(1).default("best"),
});

const fetchSchema = z.object({
  url: z.string().min(1).max(2048),
  formatSpec: z.string().min(1).default("best"),
  driveAll: z.boolean().default(false),
});

const prepareSchema = z.object({
  url: z.string().min(1).max(2048),
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
      log("WARN", "Retrying Python fetch after transient connection error", {
        code: error?.code,
      });
      return await attempt();
    }
    throw error;
  }
}

function log(level: string, msg: string, data?: any) {
  const entry = `[PublicDownloads] ${level}: ${msg}${data ? " | " + JSON.stringify(data).slice(0, 500) : ""}`;
  console.log(entry);
}

function extractError(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  if (detail) {
    return Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ") : String(detail);
  }
  return error?.response?.data?.error || error?.message || fallback;
}

const router = Router();

router.use(authenticate);

router.post("/analyze", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  try {
    const body = analyzeSchema.parse(req.body);
    const validation = validateUrl(body.url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    log("INFO", "Analyze request", { url: body.url.slice(0, 100), platform: validation.platform?.platform });
    const { data } = await pythonClient.post("/api/download/analyze", { url: body.url });
    const duration = Date.now() - start;
    log("INFO", `Analyze success | ${duration}ms`, { title: data.title?.slice(0, 80) });
    res.json({ ...data, detectedPlatform: validation.platform });
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error?.code === "ECONNREFUSED") {
      res.status(503).json({ error: "Download service is starting up. Please try again in a moment." });
      return;
    }
    log("ERROR", `Analyze failed | ${duration}ms`, { error: String(error) });
    res.status(400).json({ error: extractError(error, "Failed to analyze URL") });
  }
});

router.post("/start", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  try {
    const body = downloadSchema.parse(req.body);
    const validation = validateUrl(body.url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    log("INFO", "Start download", { url: body.url.slice(0, 100), formatSpec: body.formatSpec });
    const { data } = await pythonClient.post("/api/download/start", {
      url: body.url,
      format_spec: body.formatSpec,
      downloadSubtitles: false,
      downloadId: "",
    });
    const duration = Date.now() - start;
    log("INFO", `Download started | ${duration}ms`, { taskId: data.id });
    res.json({ id: data.id, status: "downloading" });
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error?.code === "ECONNREFUSED") {
      res.status(503).json({ error: "Download service is starting up. Please try again in a moment." });
      return;
    }
    log("ERROR", `Start download failed | ${duration}ms`, { error: String(error) });
    res.status(500).json({ error: extractError(error, "Failed to start download") });
  }
});

router.get("/status/:taskId", async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await pythonClient.get(`/api/download/status/${req.params.taskId}`);
    res.json(data);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      res.status(404).json({ error: "Download task not found" });
      return;
    }
    log("ERROR", "Status check failed", { taskId: req.params.taskId, error: String(error) });
    res.status(500).json({ error: "Failed to check download status" });
  }
});

router.post("/prepare", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  try {
    const body = prepareSchema.parse(req.body);
    const validation = validateUrl(body.url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    log("INFO", "Prepare (analyze + download best format)", {
      url: body.url.slice(0, 100),
      formatSpec: body.formatSpec,
    });
    const { data } = await pythonClient.post(
      "/api/download/prepare",
      {
        url: body.url,
        format_spec: body.formatSpec,
        downloadSubtitles: body.downloadSubtitles,
      },
      { timeout: 1500000 }
    );

    // Rewrite python-internal file paths into this proxy's public URLs so the
    // browser can stream + download the actual stored media.
    const filePath = `/api/public/download/file/${data.downloadUrl.split("/").pop()}`;
    const mediaResult = {
      ...data,
      downloadUrl: filePath,
      streamUrl: `${filePath}?inline=1`,
      fileSize: data.filesize ?? data.fileSize ?? null,
    };
    const duration = Date.now() - start;
    log("INFO", `Prepare success | ${duration}ms`, {
      title: mediaResult.title?.slice(0, 80),
      mediaType: mediaResult.mediaType,
      filename: mediaResult.filename,
      filesize: mediaResult.filesize,
    });
    res.json(mediaResult);
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error?.code === "ECONNREFUSED") {
      res.status(503).json({ error: "Download service is starting up. Please try again in a moment." });
      return;
    }
    log("ERROR", `Prepare failed | ${duration}ms`, { error: String(error) });
    res.status(400).json({ error: extractError(error, "Failed to prepare media") });
  }
});

router.get("/file/:taskId", async (req: AuthRequest, res: Response) => {
  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers["Range"] = req.headers.range;
    const fileResp = await pythonClient.get(
      `/api/download/file/${req.params.taskId}`,
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
      log("ERROR", "File stream error", { taskId: req.params.taskId, error: err.message });
      if (!res.headersSent) res.status(500).json({ error: "Failed to download file" });
    });
  } catch (error: any) {
    log("ERROR", "File download failed", { taskId: req.params.taskId, error: String(error) });
    if (error?.response?.status === 404) {
      res.status(404).json({ error: "File not found or has expired. Prepare the media again." });
      return;
    }
    if (!res.headersSent) res.status(500).json({ error: "Failed to download file" });
  }
});

router.post("/fetch", async (req: AuthRequest, res: Response) => {
  const start = Date.now();
  try {
    const body = fetchSchema.parse(req.body);
    const validation = validateUrl(body.url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    log("INFO", "Fetch (direct download)", { url: body.url.slice(0, 100), formatSpec: body.formatSpec });
    const upstream = await postFetchWithRetry({
      url: body.url,
      format_spec: body.formatSpec,
      downloadSubtitles: false,
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
      log("ERROR", "Fetch stream error", { error: err.message });
      if (!res.headersSent) res.status(502).json({ error: "Failed to download media" });
    });
    upstream.data.on("end", () => {
      const duration = Date.now() - start;
      log("INFO", `Fetch complete | ${duration}ms`);
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error?.code === "ECONNREFUSED") {
      res.status(503).json({ error: "Download service is starting up. Please try again in a moment." });
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
    log("ERROR", `Fetch failed | ${duration}ms`, { error: message });
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
        "/api/public/download/stream",
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
    log("ERROR", "Media stream failed", { error: String(error) });
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to stream media" });
    } else {
      res.end();
    }
  }
});

export default router;
