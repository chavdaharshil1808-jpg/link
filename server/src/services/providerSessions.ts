import { prisma } from "../lib/prisma";
import { encrypt, decrypt } from "../utils/crypto";
import { sessionLog } from "./logger";

export interface ProviderDefinition {
  id: string;
  label: string;
  domains: string[];
  requiredCookie?: string;
}

export const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  { id: "google", label: "Google", domains: [".google.com", ".youtube.com", ".googleusercontent.com"] },
  { id: "instagram", label: "Instagram", domains: [".instagram.com", ".cdninstagram.com"], requiredCookie: "sessionid" },
  { id: "facebook", label: "Facebook", domains: [".facebook.com", ".fbcdn.net"] },
  { id: "youtube", label: "YouTube", domains: [".youtube.com", ".google.com"] },
  { id: "twitter", label: "Twitter / X", domains: [".twitter.com", ".x.com"] },
  { id: "tiktok", label: "TikTok", domains: [".tiktok.com"] },
  { id: "reddit", label: "Reddit", domains: [".reddit.com", ".redd.it"] },
  { id: "pinterest", label: "Pinterest", domains: [".pinterest.com"] },
  { id: "linkedin", label: "LinkedIn", domains: [".linkedin.com"] },
];

export function isSupportedProvider(provider: string): boolean {
  return SUPPORTED_PROVIDERS.some((p) => p.id === provider);
}

export function getProviderDefinition(provider: string): ProviderDefinition | undefined {
  return SUPPORTED_PROVIDERS.find((p) => p.id === provider);
}

export interface ParsedCookies {
  lines: string[];
  count: number;
  maxExpiry: number;
  hasRequired: boolean;
  headerLines: string[];
}

export function parseCookieContent(
  content: string,
  requiredCookie?: string
): ParsedCookies {
  const headerLines: string[] = [];
  const lines: string[] = [];
  let maxExpiry = 0;
  let hasRequired = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      headerLines.push(line);
      continue;
    }
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const name = parts[5];
    const expires = parseInt(parts[4], 10) || 0;
    if (expires > maxExpiry) maxExpiry = expires;
    if (requiredCookie && name === requiredCookie) hasRequired = true;
    lines.push(line);
  }

  return { lines, count: lines.length, maxExpiry, hasRequired, headerLines };
}

function isExpired(parsed: ParsedCookies): boolean {
  if (parsed.maxExpiry <= 0) return false;
  return parsed.maxExpiry * 1000 < Date.now();
}

export interface ProviderStatus {
  provider: string;
  label: string;
  authenticated: boolean;
  hasCookies: boolean;
  cookieCount: number;
  expiresAt: string | null;
  requiredCookiePresent: boolean;
  lastValidatedAt: string | null;
}

export async function saveCookies(
  userId: string,
  provider: string,
  content: string
): Promise<void> {
  if (!isSupportedProvider(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const def = getProviderDefinition(provider)!;
  const parsed = parseCookieContent(content, def.requiredCookie);
  if (parsed.count === 0) {
    throw new Error("No valid cookies found in the provided content");
  }

  const expiresAt =
    parsed.maxExpiry > 0 ? new Date(parsed.maxExpiry * 1000) : null;
  const encrypted = encrypt(content);

  await prisma.providerSession.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      cookieData: encrypted,
      cookieCount: parsed.count,
      expiresAt,
      isValid: !isExpired(parsed),
    },
    update: {
      cookieData: encrypted,
      cookieCount: parsed.count,
      expiresAt,
      isValid: !isExpired(parsed),
      lastValidatedAt: new Date(),
    },
  });

  sessionLog("provider_cookies_saved", `Cookies saved for provider ${provider}`, {
    provider,
    cookieCount: parsed.count,
    expiresAt: expiresAt?.toISOString() ?? null,
  });
}

export async function getCookies(
  userId: string,
  provider: string
): Promise<{ content: string; count: number; expiresAt: Date | null } | null> {
  const row = await prisma.providerSession.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    sessionLog("provider_cookies_expired", `Cookies expired for provider ${provider}`, {
      provider,
      expiresAt: row.expiresAt.toISOString(),
    });
    return null;
  }
  try {
    const content = decrypt(row.cookieData);
    const parsed = parseCookieContent(
      content,
      getProviderDefinition(provider)?.requiredCookie
    );
    if (parsed.count === 0) return null;
    if (isExpired(parsed)) return null;
    sessionLog("provider_cookies_loaded", `Cookies loaded for provider ${provider}`, {
      provider,
      cookieCount: parsed.count,
    });
    return { content, count: parsed.count, expiresAt: row.expiresAt };
  } catch {
    return null;
  }
}

export async function hasValidCookies(
  userId: string,
  provider: string
): Promise<boolean> {
  return (await getCookies(userId, provider)) !== null;
}

export async function deleteCookies(
  userId: string,
  provider: string
): Promise<boolean> {
  const result = await prisma.providerSession.deleteMany({
    where: { userId, provider },
  });
  if (result.count > 0) {
    sessionLog("logout", `Cookies deleted for provider ${provider}`, { provider });
    return true;
  }
  return false;
}

export async function listProviderStatus(userId: string): Promise<ProviderStatus[]> {
  const rows = await prisma.providerSession.findMany({ where: { userId } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return SUPPORTED_PROVIDERS.map((def) => {
    const row = byProvider.get(def.id);
    let authenticated = false;
    let cookieCount = 0;
    let expiresAt: string | null = null;
    let requiredCookiePresent = false;
    let lastValidatedAt: string | null = null;
    if (row) {
      try {
        const parsed = parseCookieContent(decrypt(row.cookieData), def.requiredCookie);
        cookieCount = parsed.count;
        requiredCookiePresent = def.requiredCookie ? parsed.hasRequired : parsed.count > 0;
        authenticated = row.isValid && !isExpired(parsed);
        expiresAt = row.expiresAt?.toISOString() ?? null;
        lastValidatedAt = row.lastValidatedAt.toISOString();
      } catch {
        authenticated = false;
      }
    }
    return {
      provider: def.id,
      label: def.label,
      authenticated,
      hasCookies: cookieCount > 0,
      cookieCount,
      expiresAt,
      requiredCookiePresent: def.requiredCookie ? requiredCookiePresent : cookieCount > 0,
      lastValidatedAt,
    };
  });
}

export async function getMergedCookieContent(userId: string): Promise<string | null> {
  const rows = await prisma.providerSession.findMany({
    where: { userId, isValid: true },
  });
  if (rows.length === 0) return null;

  const header = "# Netscape HTTP Cookie File\n# Merged from user provider sessions\n\n";
  const lines = new Map<string, string>();
  for (const row of rows) {
    try {
      if (row.expiresAt && row.expiresAt.getTime() < Date.now()) continue;
      const parsed = parseCookieContent(decrypt(row.cookieData));
      if (isExpired(parsed)) continue;
      for (const line of parsed.lines) {
        const key = line.split("\t").slice(5).join("\t");
        lines.set(key, line);
      }
    } catch {
      // skip undecryptable rows
    }
  }
  if (lines.size === 0) return null;
  return header + Array.from(lines.values()).join("\n") + "\n";
}
