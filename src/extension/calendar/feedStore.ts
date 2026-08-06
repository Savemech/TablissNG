import type { CalendarFeed } from "./types";

export const CALENDAR_FEEDS_STORAGE_KEY = "fdial/calendar/feeds";
const MAX_FEEDS = 20;

function isCalendarFeed(value: unknown): value is CalendarFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Partial<CalendarFeed>;
  return (
    feed.kind === "ical" &&
    typeof feed.id === "string" &&
    feed.id.length > 0 &&
    typeof feed.name === "string" &&
    typeof feed.url === "string" &&
    typeof feed.colour === "string" &&
    typeof feed.enabled === "boolean" &&
    typeof feed.refreshMinutes === "number" &&
    Number.isFinite(feed.refreshMinutes) &&
    typeof feed.timeZone === "string" &&
    feed.timeZone.length > 0
  );
}

export async function getCalendarFeeds(): Promise<CalendarFeed[]> {
  const stored = await browser.storage.local.get(CALENDAR_FEEDS_STORAGE_KEY);
  const feeds = stored[CALENDAR_FEEDS_STORAGE_KEY];
  if (!Array.isArray(feeds)) return [];
  return feeds.filter(isCalendarFeed).slice(0, MAX_FEEDS);
}

export async function setCalendarFeeds(
  feeds: readonly CalendarFeed[],
): Promise<void> {
  await browser.storage.local.set({
    [CALENDAR_FEEDS_STORAGE_KEY]: feeds.slice(0, MAX_FEEDS),
  });
}
