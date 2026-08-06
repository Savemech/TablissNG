import {
  isLocalPageUrl,
  permissionOriginForUrl,
} from "../../../extension/favicon/fetch";
import type { AutomaticFaviconSource } from "../../../extension/favicon/types";
import type { BookmarkNode } from "./layout";
import type { FaviconSettings } from "./types";

export type FaviconTarget = { bookmarkId: string; pageUrl: string };

export function faviconTargets(
  nodes: Iterable<BookmarkNode>,
  settings: Pick<FaviconSettings, "source" | "includeLocal">,
): FaviconTarget[] {
  const targets: FaviconTarget[] = [];
  for (const node of nodes) {
    if (!node.url || !permissionOriginForUrl(node.url)) continue;
    const local = isLocalPageUrl(node.url);
    if (local && (settings.source !== "direct" || !settings.includeLocal)) {
      continue;
    }
    targets.push({ bookmarkId: node.id, pageUrl: node.url });
  }
  return targets;
}

export function faviconPermissionOrigins(
  targets: readonly FaviconTarget[],
  source: AutomaticFaviconSource,
): string[] {
  if (source === "google") return ["https://www.google.com/*"];
  if (source === "duckduckgo") {
    return ["https://icons.duckduckgo.com/*"];
  }
  return [
    ...new Set(
      targets
        .map(({ pageUrl }) => permissionOriginForUrl(pageUrl))
        .filter((origin): origin is string => Boolean(origin)),
    ),
  ];
}

export async function requestFaviconPermissions(
  targets: readonly FaviconTarget[],
  source: AutomaticFaviconSource,
): Promise<boolean> {
  const origins = faviconPermissionOrigins(targets, source);
  if (origins.length === 0) return true;
  return browser.permissions.request({ origins });
}
