const REFRESH_TOKEN_KEY = "ud-refresh-token";
const SESSION_META_KEY = "ud-session-meta";

export interface SessionMeta {
  rememberMe: boolean;
  sessionId?: string;
}

export function getStoredRefreshToken(): string | null {
  try {
    const meta = getSessionMeta();
    const storage = meta.rememberMe ? localStorage : sessionStorage;
    return storage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(token: string | null): void {
  try {
    const meta = getSessionMeta();
    const storage = meta.rememberMe ? localStorage : sessionStorage;
    if (token) {
      storage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      storage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // storage unavailable - session simply won't persist across reloads
  }
}

export function getSessionMeta(): SessionMeta {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        rememberMe: Boolean(parsed.rememberMe),
        sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      };
    }
  } catch {
    // ignore
  }
  return { rememberMe: false };
}

export function setSessionMeta(meta: SessionMeta): void {
  try {
    if (meta.rememberMe) {
      localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
    } else {
      localStorage.removeItem(SESSION_META_KEY);
      try {
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      } catch {}
    }
  } catch {
    // ignore
  }
}

export function clearStoredSession(): void {
  setStoredRefreshToken(null);
  setSessionMeta({ rememberMe: false });
}

export function hasStoredSession(): boolean {
  return Boolean(getStoredRefreshToken());
}
