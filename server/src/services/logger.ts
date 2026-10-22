type LogLevel = "INFO" | "WARN" | "ERROR";

export const SessionEvent = {
  SessionLoaded: "session_loaded",
  SessionSaved: "session_saved",
  SessionExpired: "session_expired",
  SessionRevoked: "session_revoked",
  CookiesRefreshed: "cookies_refreshed",
  AuthRestored: "authentication_restored",
  AutoLoginSuccess: "auto_login_success",
  Logout: "logout",
  ProviderCookiesSaved: "provider_cookies_saved",
  ProviderCookiesLoaded: "provider_cookies_loaded",
  ProviderCookiesExpired: "provider_cookies_expired",
} as const;

export type SessionEventName = (typeof SessionEvent)[keyof typeof SessionEvent];

const SENSITIVE_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "cookie",
  "cookieData",
  "cookies",
  "cookieContent",
  "password",
  "passwordHash",
  "secret",
  "sessionid",
  "authorization",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 200) return `${value.slice(0, 200)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = "[redacted]";
      } else {
        result[key] = sanitize(val, depth + 1);
      }
    }
    return result;
  }
  return value;
}

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const safeData = data ? JSON.stringify(sanitize(data)) : "";
  const entry = `[${new Date().toISOString()}] [${scope}] ${level}: ${message}${
    safeData ? " | " + safeData : ""
  }`;
  if (level === "ERROR") {
    console.error(entry);
  } else if (level === "WARN") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

export function sessionLog(
  event: SessionEventName,
  message: string,
  data?: Record<string, unknown>
): void {
  log("INFO", "SessionManager", `${event}: ${message}`, data);
}
