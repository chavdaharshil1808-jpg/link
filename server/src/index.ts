import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import downloadRoutes from "./routes/downloads";
import publicDownloadRoutes from "./routes/publicDownloads";
import favoritesRoutes from "./routes/favorites";
import settingsRoutes from "./routes/settings";
import instagramRoutes from "./routes/instagram";
import adminRoutes from "./routes/admin";
import profileRoutes from "./routes/profile";
import historyRoutes from "./routes/history";
import cookieRoutes from "./routes/cookies";
import { checkPythonService } from "./services/pythonService";
import { cleanupExpiredSessions } from "./services/sessionManager";
import { log } from "./services/logger";

const app = express();

app.set("trust proxy", "loopback");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: [config.CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const authHeader = req.headers.authorization;
  const hasToken = authHeader && authHeader.startsWith("Bearer ");
  const bodyStr = req.method === "GET" ? "(query)" : JSON.stringify(req.body).slice(0, 300);
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | Auth:${hasToken ? "yes" : "no"} | Body:${bodyStr}`);
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 500 ? "ERR" : res.statusCode >= 400 ? "WARN" : "OK";
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} [${statusColor}] (${duration}ms)`);
    return originalJson(body);
  };
  next();
});

app.use(
  rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  })
);

app.get("/health", async (_req, res) => {
  const pythonAlive = await checkPythonService();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      server: true,
      python: pythonAlive,
    },
  });
});

app.get("/api/health", async (_req, res) => {
  const pythonAlive = await checkPythonService();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      server: true,
      python: pythonAlive,
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/downloads", downloadRoutes);
app.use("/api/public/download", publicDownloadRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/cookies", cookieRoutes);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`[Server] ========================================`);
  console.log(`[Server]  Universal Downloader Server`);
  console.log(`[Server] ========================================`);
  console.log(`[Server] Port:       ${config.PORT}`);
  console.log(`[Server] Environment: ${config.NODE_ENV}`);
  console.log(`[Server] Client URL: ${config.CLIENT_URL}`);
  console.log(`[Server] Python URL: ${config.PYTHON_SERVICE_URL}`);
  console.log(`[Server] Database:   ${config.DATABASE_URL}`);
  console.log(`[Server] ========================================`);
  // Check Python service
  checkPythonService().then(alive => {
    console.log(`[Server] Python Service: ${alive ? "ONLINE" : "OFFLINE"}`);
    if (!alive) {
      console.log(`[Server] WARNING: Python service is not running. Start it with: cd python-service && python -m uvicorn app.main:app --reload --port 8001`);
    }
  });
  // Session cleanup interval
  cleanupExpiredSessions().catch(err => {
    log("ERROR", "Server", "Initial session cleanup failed", { error: String(err) });
  });
  setInterval(() => {
    cleanupExpiredSessions().catch(err => {
      log("ERROR", "Server", "Scheduled session cleanup failed", { error: String(err) });
    });
  }, config.SESSION_CLEANUP_INTERVAL_MIN * 60 * 1000);
});

export default app;
