import { URL } from "url";

/**
 * Rewrites an HLS (m3u8) manifest so that every referenced media segment /
 * variant playlist is fetched back through our authenticated proxy endpoint.
 *
 * The browser cannot load HLS segments from arbitrary CDNs directly (CORS,
 * hotlink protection, expiring signatures), so we route each URI through
 * `/stream?url=<encoded>&token=<token>` where `<token>` keeps the request
 * authenticated.
 */
export function isHlsUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().includes("mpegurl")) return true;
  return /\.m3u8($|\?)/i.test(url);
}

export function rewriteHlsManifest(
  body: Buffer,
  manifestUrl: string,
  proxyPath: string,
  token: string | null
): string {
  const base = new URL(manifestUrl);
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  const lines = body.toString("utf-8").split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Comments / directives (EXT lines) pass through untouched.
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    let absolute: string;
    try {
      absolute = new URL(trimmed, base).toString();
    } catch {
      out.push(line);
      continue;
    }
    if (/^https?:\/\//i.test(absolute)) {
      out.push(`${proxyPath}?url=${encodeURIComponent(absolute)}${tokenQuery}`);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}
