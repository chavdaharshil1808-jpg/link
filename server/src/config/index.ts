import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.SERVER_PORT || "3001", 10),
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET || "dev-jwt-secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  // Persistent session configuration
  SESSION_ENCRYPTION_KEY: process.env.SESSION_ENCRYPTION_KEY || "",
  SESSION_TTL_DAYS: parseInt(process.env.SESSION_TTL_DAYS || "30", 10),
  SESSION_SHORT_TTL_HOURS: parseInt(process.env.SESSION_SHORT_TTL_HOURS || "24", 10),
  SESSION_CLEANUP_INTERVAL_MIN: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MIN || "60", 10),
  PYTHON_SERVICE_URL: process.env.PYTHON_SERVICE_URL || "http://localhost:8001",
  SERVER_URL: process.env.SERVER_URL || `http://localhost:${parseInt(process.env.SERVER_PORT || "3001", 10)}`,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "noreply@yourdomain.com",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  DOWNLOAD_DIR: process.env.DOWNLOAD_DIR || "./downloads",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "",
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || "admin-jwt-secret-different-from-user-secret",
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
};
