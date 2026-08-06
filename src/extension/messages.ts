import type { AutomaticFaviconSource } from "./favicon/types";

export const BACKGROUND_HEALTH = "fdial/background/health";
export const FETCH_FAVICON = "fdial/favicon/fetch";
export const FETCH_FAVICON_BATCH = "fdial/favicon/fetch-batch";

export type BackgroundHealthMessage = { type: typeof BACKGROUND_HEALTH };

export type FetchFaviconMessage = {
  type: typeof FETCH_FAVICON;
  bookmarkId: string;
  pageUrl: string;
  source: AutomaticFaviconSource | "manual-url";
  manualUrl?: string;
  ttlDays: number;
  force?: boolean;
};

export type FetchFaviconBatchMessage = {
  type: typeof FETCH_FAVICON_BATCH;
  items: Array<{ bookmarkId: string; pageUrl: string }>;
  source: AutomaticFaviconSource;
  ttlDays: number;
  concurrency: number;
  force?: boolean;
};

export type ExtensionMessage =
  BackgroundHealthMessage | FetchFaviconMessage | FetchFaviconBatchMessage;

export type BackgroundResponse =
  | { ok: true; status: "healthy" | "ready" | "cached" }
  | { ok: true; status: "complete"; completed: number; failed: number }
  | { ok: false; error: string };

export function isFetchFaviconMessage(
  message: unknown,
): message is FetchFaviconMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<FetchFaviconMessage>;
  return (
    candidate.type === FETCH_FAVICON &&
    typeof candidate.bookmarkId === "string" &&
    candidate.bookmarkId.length > 0 &&
    typeof candidate.pageUrl === "string" &&
    ["direct", "google", "duckduckgo", "manual-url"].includes(
      candidate.source ?? "",
    ) &&
    typeof candidate.ttlDays === "number" &&
    Number.isFinite(candidate.ttlDays)
  );
}

export function isFetchFaviconBatchMessage(
  message: unknown,
): message is FetchFaviconBatchMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<FetchFaviconBatchMessage>;
  return (
    candidate.type === FETCH_FAVICON_BATCH &&
    Array.isArray(candidate.items) &&
    candidate.items.length <= 500 &&
    candidate.items.every(
      (item) =>
        item &&
        typeof item.bookmarkId === "string" &&
        item.bookmarkId.length > 0 &&
        typeof item.pageUrl === "string",
    ) &&
    ["direct", "google", "duckduckgo"].includes(candidate.source ?? "") &&
    typeof candidate.ttlDays === "number" &&
    Number.isFinite(candidate.ttlDays) &&
    typeof candidate.concurrency === "number" &&
    Number.isFinite(candidate.concurrency)
  );
}
