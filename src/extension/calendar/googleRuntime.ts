import { getCalendarFeedCache, putCalendarFeedCache } from "./cacheStore";
import { fetchGoogleEvents } from "./googleApi";
import type { CalendarRefreshResult, GoogleCalendarFeed } from "./types";

const PAST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function safeError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Google Calendar refresh failed";
}

export async function refreshGoogleCalendarFeed(
  feed: GoogleCalendarFeed,
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
    const result = await fetchGoogleEvents(
      feed,
      new Date(now - PAST_WINDOW_MS),
      new Date(now + FUTURE_WINDOW_MS),
      existing?.etag,
    );
    if (result.notModified && existing) {
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
    await putCalendarFeedCache({
      feedId: feed.id,
      events: result.events,
      fetchedAt: now,
      lastAttemptAt: now,
      etag: result.etag,
      calendarName: feed.name,
    });
    return {
      feedId: feed.id,
      eventCount: result.events.length,
      status: "ready",
    };
  } catch (cause) {
    await putCalendarFeedCache({
      feedId: feed.id,
      events: existing?.events ?? [],
      fetchedAt: existing?.fetchedAt,
      lastAttemptAt: now,
      etag: existing?.etag,
      calendarName: existing?.calendarName ?? feed.name,
      error: safeError(cause),
    });
    throw cause;
  }
}
