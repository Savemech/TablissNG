import type { AutomaticFaviconSource } from "./favicon/types";

export const BACKGROUND_HEALTH = "fdial/background/health";
export const FETCH_FAVICON = "fdial/favicon/fetch";

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

export type ExtensionMessage = BackgroundHealthMessage | FetchFaviconMessage;

export type BackgroundResponse =
  | { ok: true; status: "healthy" | "ready" | "cached" }
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
