import { pythonClient } from "./pythonService";
import {
  hasValidCookies,
  saveCookies,
  getMergedCookieContent,
} from "./providerSessions";
import { log } from "./logger";

export interface InstagramAuthStatus {
  authenticated: boolean;
  hasCookieFile: boolean;
  browsersAvailable: string[];
  message: string;
}

export interface InstagramAuthPoll {
  authenticated: boolean;
  message: string;
  cookieContent?: string;
}

const INSTAGRAM_PATTERN = /instagram\.com\/(?:reel|p|tv|stories)\//i;

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_PATTERN.test(url);
}

export async function checkInstagramAuth(userId?: string): Promise<InstagramAuthStatus> {
  let authenticated = false;
  let hasCookieFile = false;
  let browsersAvailable: string[] = [];

  if (userId && (await hasValidCookies(userId, "instagram"))) {
    authenticated = true;
    hasCookieFile = true;
  }

  try {
    const { data } = await pythonClient.get<InstagramAuthStatus>(
      "/api/download/instagram/auth/status"
    );
    if (!authenticated) {
      authenticated = data.authenticated;
      hasCookieFile = data.hasCookieFile;
    }
    browsersAvailable = data.browsersAvailable || [];
  } catch {
    // python unreachable; rely on vault state only
  }

  return {
    authenticated,
    hasCookieFile,
    browsersAvailable,
    message: authenticated
      ? "Instagram session is valid"
      : "Instagram authentication required",
  };
}

export async function triggerBrowserAuth(): Promise<{
  success: boolean;
  message: string;
  chromeOpened: boolean;
}> {
  try {
    const { data } = await pythonClient.post<{
      success: boolean;
      message: string;
      chromeOpened: boolean;
    }>("/api/download/instagram/auth/browser");
    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.detail || "Failed to launch browser",
      chromeOpened: false,
    };
  }
}

export async function pollAuthCookies(userId?: string): Promise<InstagramAuthPoll> {
  try {
    const { data } = await pythonClient.get<InstagramAuthPoll>(
      "/api/download/instagram/auth/poll"
    );
    if (data.authenticated && userId && data.cookieContent) {
      try {
        await saveCookies(userId, "instagram", data.cookieContent);
        log("INFO", "InstagramService", "Persisted Instagram cookies for user", {
          userId,
        });
      } catch (error) {
        log("WARN", "InstagramService", "Failed to persist Instagram cookies", {
          error: String(error),
        });
      }
    }
    return data;
  } catch {
    return { authenticated: false, message: "Failed to check authentication status" };
  }
}

export async function analyzeInstagramUrl(url: string, userId?: string) {
  try {
    const payload: Record<string, unknown> = { url };
    if (userId) {
      const cookieContent = await getMergedCookieContent(userId);
      if (cookieContent) payload.cookieContent = cookieContent;
    }
    const { data } = await pythonClient.post("/api/download/instagram/analyze", payload);
    return data;
  } catch (error: any) {
    const detail = error?.response?.data?.detail;
    if (detail) throw new Error(detail);
    throw new Error("Analysis failed");
  }
}

export async function getInstagramCookieContent(userId: string): Promise<string | null> {
  return getMergedCookieContent(userId);
}
