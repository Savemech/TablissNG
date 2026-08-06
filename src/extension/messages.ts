import type { AutomaticFaviconSource } from "./favicon/types";

export const BACKGROUND_HEALTH = "fdial/background/health";
export const FETCH_FAVICON = "fdial/favicon/fetch";
export const FETCH_FAVICON_BATCH = "fdial/favicon/fetch-batch";
export const REFRESH_CALENDAR_FEED = "fdial/calendar/refresh-feed";
export const REFRESH_ALL_CALENDARS = "fdial/calendar/refresh-all";
export const CALENDAR_CACHE_UPDATED = "fdial/calendar/cache-updated";

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

export type RefreshCalendarFeedMessage = {
  type: typeof REFRESH_CALENDAR_FEED;
  feedId: string;
  force?: boolean;
};

export type RefreshAllCalendarsMessage = {
  type: typeof REFRESH_ALL_CALENDARS;
  force?: boolean;
};

export type CalendarCacheUpdatedMessage = {
  type: typeof CALENDAR_CACHE_UPDATED;
  feedIds: string[];
};

export type ExtensionMessage =
  | BackgroundHealthMessage
  | FetchFaviconMessage
  | FetchFaviconBatchMessage
  | RefreshCalendarFeedMessage
  | RefreshAllCalendarsMessage
  | CalendarCacheUpdatedMessage;

export type BackgroundResponse =
  | { ok: true; status: "healthy" | "ready" | "cached" }
  | { ok: true; status: "complete"; completed: number; failed: number }
  | {
      ok: true;
      status: "calendar-ready" | "calendar-cached";
      feedId: string;
      eventCount: number;
    }
  | {
      ok: true;
      status: "calendar-complete";
      completed: number;
      failed: number;
    }
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

export function isRefreshCalendarFeedMessage(
  message: unknown,
): message is RefreshCalendarFeedMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<RefreshCalendarFeedMessage>;
  return (
    candidate.type === REFRESH_CALENDAR_FEED &&
    typeof candidate.feedId === "string" &&
    candidate.feedId.length > 0 &&
    (candidate.force === undefined || typeof candidate.force === "boolean")
  );
}

export function isRefreshAllCalendarsMessage(
  message: unknown,
): message is RefreshAllCalendarsMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<RefreshAllCalendarsMessage>;
  return (
    candidate.type === REFRESH_ALL_CALENDARS &&
    (candidate.force === undefined || typeof candidate.force === "boolean")
  );
}
