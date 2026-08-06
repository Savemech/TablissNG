import tlds from "tlds";

/**
 * Normalizes a URL by adding https:// if it has a known TLD and no scheme.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }

  try {
    const urlObj = new URL(`https://${trimmed}`);
    const hostname = urlObj.hostname.toLowerCase();
    const parts = hostname.split(".");
    const actualTld = parts[parts.length - 1];
    if (parts.length > 1 && actualTld && tlds.includes(actualTld)) {
      return `https://${trimmed}`;
    }
  } catch {
    // Return the original URL below.
  }

  return trimmed;
}

export function isSpecialUrl(url: string): boolean {
  const normalized = (url || "").toLowerCase();
  const prefixes = [
    "about:",
    "chrome:",
    "edge:",
    "vivaldi:",
    "opera:",
    "file:",
    "chrome-extension:",
    "moz-extension:",
    "ms-settings:",
    "view-source:",
  ];
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}
