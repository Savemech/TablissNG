import { getCalendarFeedCache, putCalendarFeedCache } from "./cacheStore";
import { getCalendarFeeds } from "./feedStore";
import { parseICalendar } from "./ical";
import type { CalendarFeedCache, ICalFeed } from "./types";

const MAX_ICAL_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const PAST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export type CalendarRefreshResult = {
  feedId: string;
  eventCount: number;
  status: "cached" | "ready";
};

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Calendar refresh failed";
}

async function limitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ICAL_BYTES) {
    throw new Error("Calendar response is larger than 4 MiB");
  }
  if (!response.body) {
    const text = await response.text();
    if (new Blob([text]).size > MAX_ICAL_BYTES) {
      throw new Error("Calendar response is larger than 4 MiB");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_ICAL_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Calendar response is larger than 4 MiB");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(combined);
}

async function fetchCalendar(
  feed: ICalFeed,
  existing?: CalendarFeedCache,
): Promise<Response> {
  const headers = new Headers({
    Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.5",
  });
  if (existing?.etag) headers.set("If-None-Match", existing.etag);
  if (existing?.lastModified) {
    headers.set("If-Modified-Since", existing.lastModified);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(feed.url, {
      cache: "no-cache",
      credentials: "omit",
      redirect: "follow",
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshCalendarFeed(
  feed: ICalFeed,
  force = false,
): Promise<CalendarRefreshResult> {
  const now = Date.now();
  const existing = await getCalendarFeedCache(feed.id);
  const refreshAfter = Math.max(5, feed.refreshMinutes) * 60 * 1000;
  if (
    !force &&
    existing?.fetchedAt &&
    now - existing.fetchedAt < refreshAfter
  ) {
    return {
      feedId: feed.id,
      eventCount: existing.events.length,
      status: "cached",
    };
  }

  try {
    const response = await fetchCalendar(feed, existing);
    if (response.status === 304 && existing) {
      await putCalendarFeedCache({
        ...existing,
        fetchedAt: now,
        lastAttemptAt: now,
        error: undefined,
      });
      return {
        feedId: feed.id,
        eventCount: existing.events.length,
        status: "cached",
      };
    }
    if (!response.ok) {
      throw new Error(`Calendar request failed with HTTP ${response.status}`);
    }
    const source = await limitedText(response);
    const parsed = parseICalendar(source, feed, {
      fallbackTimeZone: feed.timeZone,
      rangeStart: new Date(now - PAST_WINDOW_MS),
      rangeEnd: new Date(now + FUTURE_WINDOW_MS),
    });
    await putCalendarFeedCache({
      feedId: feed.id,
      events: parsed.events,
      fetchedAt: now,
      lastAttemptAt: now,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      calendarName: parsed.name,
      error: parsed.truncated
        ? "Some very frequent recurrences were truncated"
        : undefined,
    });
    return {
      feedId: feed.id,
      eventCount: parsed.events.length,
      status: "ready",
    };
  } catch (cause) {
    await putCalendarFeedCache({
      feedId: feed.id,
      events: existing?.events ?? [],
      fetchedAt: existing?.fetchedAt,
      lastAttemptAt: now,
      etag: existing?.etag,
      lastModified: existing?.lastModified,
      calendarName: existing?.calendarName,
      error: safeError(cause),
    });
    throw cause;
  }
}

export async function refreshCalendarFeedById(
  feedId: string,
  force = false,
): Promise<CalendarRefreshResult> {
  const feeds = await getCalendarFeeds();
  const feed = feeds.find((candidate) => candidate.id === feedId);
  if (!feed || !feed.enabled) throw new Error("Calendar feed was not found");
  return refreshCalendarFeed(feed, force);
}

export async function refreshAllCalendarFeeds(
  force = false,
): Promise<{ completed: number; failed: number; feedIds: string[] }> {
  const feeds = (await getCalendarFeeds()).filter(({ enabled }) => enabled);
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  const feedIds: string[] = [];
  const worker = async () => {
    while (cursor < feeds.length) {
      const feed = feeds[cursor++];
      try {
        await refreshCalendarFeed(feed, force);
        completed += 1;
      } catch {
        failed += 1;
      }
      feedIds.push(feed.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, feeds.length) }, worker));
  return { completed, failed, feedIds };
}
