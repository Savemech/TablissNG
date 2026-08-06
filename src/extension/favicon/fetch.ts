import type { AutomaticFaviconSource } from "./types";

const MAX_ICON_BYTES = 512 * 1024;
const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

export type FetchedFavicon = {
  blob: Blob;
  sourceUrl: string;
};

export function isLocalHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !value.includes(".") ||
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".lan") ||
    value.endsWith(".home")
  ) {
    return true;
  }

  const ipv4 = value.split(".").map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => part >= 0 && part <= 255)) {
    return (
      ipv4[0] === 10 ||
      ipv4[0] === 127 ||
      (ipv4[0] === 169 && ipv4[1] === 254) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
      (ipv4[0] === 192 && ipv4[1] === 168)
    );
  }

  return (
    value.includes(":") &&
    (value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe80:"))
  );
}

export function isLocalPageUrl(pageUrl: string): boolean {
  try {
    return isLocalHostname(new URL(pageUrl).hostname);
  } catch {
    return false;
  }
}

export function permissionOriginForUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return undefined;
  }
}

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  const expression = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(expression)) {
    result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

export function extractIconUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const rel = (attrs.get("rel") ?? "").toLowerCase();
    const href = attrs.get("href");
    if (
      !href ||
      !/(?:^|\s)(?:shortcut\s+)?icon(?:\s|$)|apple-touch-icon/.test(rel)
    ) {
      continue;
    }
    try {
      const url = new URL(href, pageUrl);
      if (!/^https?:$/.test(url.protocol) || seen.has(url.href)) continue;
      seen.add(url.href);
      urls.push(url.href);
    } catch {
      // Ignore malformed icon links and continue with other candidates.
    }
  }
  return urls.slice(0, 8);
}

export function providerUrl(
  source: Exclude<AutomaticFaviconSource, "direct">,
  pageUrl: string,
): string {
  const url = new URL(pageUrl);
  if (source === "google") {
    const endpoint = new URL("https://www.google.com/s2/favicons");
    endpoint.searchParams.set("domain_url", url.href);
    endpoint.searchParams.set("sz", "128");
    return endpoint.href;
  }
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(url.hostname)}.ico`;
}

async function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "no-cache",
      credentials: "include",
      redirect: "follow",
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function imageBlob(
  url: string,
  credentials: RequestCredentials = "omit",
): Promise<Blob> {
  const response = await withTimeout(url, {
    credentials,
    headers: {
      Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok)
    throw new Error(`Icon request failed with HTTP ${response.status}`);
  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "";
  if (!blob.size || blob.size > MAX_ICON_BYTES) {
    throw new Error("Icon response has an invalid size");
  }
  if (
    contentType &&
    !contentType.toLowerCase().startsWith("image/") &&
    !/^(?:application|binary)\/octet-stream(?:;|$)/i.test(contentType)
  ) {
    throw new Error("Icon response is not an image");
  }
  return blob;
}

async function limitedHtml(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_HTML_BYTES);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_HTML_BYTES - bytes;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    bytes += chunk.length;
    if (value.length > remaining) break;
  }
  await reader.cancel().catch(() => undefined);

  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(combined);
}

async function directFavicon(pageUrl: string): Promise<FetchedFavicon> {
  const page = new URL(pageUrl);
  const conventional = new URL("/favicon.ico", page.origin).href;
  try {
    return {
      blob: await imageBlob(conventional, "include"),
      sourceUrl: conventional,
    };
  } catch {
    // Discover declared icons below.
  }

  const response = await withTimeout(page.href, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok)
    throw new Error(`Page request failed with HTTP ${response.status}`);
  const html = await limitedHtml(response);
  const candidates = extractIconUrls(html, response.url || page.href);
  for (const candidate of candidates) {
    try {
      return {
        blob: await imageBlob(candidate, "include"),
        sourceUrl: candidate,
      };
    } catch {
      // Try the next declared icon.
    }
  }
  throw new Error("The page does not expose a usable icon");
}

export async function fetchFavicon(
  source: AutomaticFaviconSource,
  pageUrl: string,
): Promise<FetchedFavicon> {
  if (source === "direct") return directFavicon(pageUrl);
  const sourceUrl = providerUrl(source, pageUrl);
  return { blob: await imageBlob(sourceUrl), sourceUrl };
}

export async function fetchManualIcon(
  iconUrl: string,
): Promise<FetchedFavicon> {
  return {
    blob: await imageBlob(iconUrl, "include"),
    sourceUrl: iconUrl,
  };
}
