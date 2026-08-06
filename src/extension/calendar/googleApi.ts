import { fromZonedTime } from "date-fns-tz";

import {
  getGoogleAccessToken,
  invalidateGoogleAccessToken,
} from "./googleAuth";
import type {
  AgendaEvent,
  GoogleCalendarFeed,
  GoogleCalendarInfo,
} from "./types";

const API_ROOT = "https://www.googleapis.com/calendar/v3";
const MAX_PAGES = 4;

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  backgroundColor?: string;
  timeZone?: string;
  primary?: boolean;
  deleted?: boolean;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  location?: string;
  htmlLink?: string;
};

type GoogleListResponse<T> = {
  items?: T[];
  nextPageToken?: string;
  etag?: string;
};

export type GoogleEventsResult = {
  events: AgendaEvent[];
  etag?: string;
  notModified: boolean;
};

async function googleError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  return new Error(
    body.error?.message ??
      `Google Calendar request failed with HTTP ${response.status}`,
  );
}

async function authorizedFetch(
  url: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await getGoogleAccessToken(false);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  const response = await fetch(url, {
    ...init,
    credentials: "omit",
    headers,
  });
  if (response.status === 401 && retry) {
    await invalidateGoogleAccessToken(token);
    return authorizedFetch(url, init, false);
  }
  return response;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarInfo[]> {
  const calendars: GoogleCalendarInfo[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${API_ROOT}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    url.searchParams.set(
      "fields",
      "items(id,summary,backgroundColor,timeZone,primary,deleted),nextPageToken",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await authorizedFetch(url.href);
    if (!response.ok) throw await googleError(response);
    const body =
      (await response.json()) as GoogleListResponse<GoogleCalendarListEntry>;
    for (const item of body.items ?? []) {
      if (!item.id || item.deleted) continue;
      calendars.push({
        id: item.id,
        name: item.summary?.trim() || item.id,
        colour: item.backgroundColor || "#4285f4",
        timeZone: item.timeZone || "UTC",
        primary: Boolean(item.primary),
      });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return calendars.sort(
    (left, right) =>
      Number(right.primary) - Number(left.primary) ||
      left.name.localeCompare(right.name),
  );
}

export function normaliseGoogleEvent(
  feed: GoogleCalendarFeed,
  event: GoogleEvent,
): AgendaEvent | undefined {
  if (event.status === "cancelled" || !event.id || !event.start || !event.end) {
    return undefined;
  }
  const allDay = Boolean(event.start.date);
  const startDate = event.start.date;
  const endDate = event.end.date;
  const startValue = event.start.dateTime;
  const endValue = event.end.dateTime;
  let start: Date;
  let end: Date;
  if (allDay && startDate && endDate) {
    start = fromZonedTime(`${startDate}T00:00:00`, feed.timeZone);
    end = fromZonedTime(`${endDate}T00:00:00`, feed.timeZone);
  } else if (startValue && endValue) {
    start = new Date(startValue);
    end = new Date(endValue);
  } else {
    return undefined;
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return undefined;
  }
  return {
    id: `${feed.id}:${event.id}`,
    feedId: feed.id,
    uid: event.id,
    title: event.summary?.trim() || "Busy",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    startDate: allDay ? startDate : undefined,
    endDateExclusive: allDay ? endDate : undefined,
    location: event.location?.trim() || undefined,
    url: event.htmlLink,
    colour: feed.colour,
  };
}

export async function fetchGoogleEvents(
  feed: GoogleCalendarFeed,
  rangeStart: Date,
  rangeEnd: Date,
  etag?: string,
): Promise<GoogleEventsResult> {
  const events: AgendaEvent[] = [];
  let pageToken: string | undefined;
  let responseEtag: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(
      `${API_ROOT}/calendars/${encodeURIComponent(feed.calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeMin", rangeStart.toISOString());
    url.searchParams.set("timeMax", rangeEnd.toISOString());
    url.searchParams.set("timeZone", feed.timeZone);
    url.searchParams.set(
      "fields",
      "etag,items(id,status,summary,start,end,location,htmlLink),nextPageToken",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const headers = new Headers();
    if (etag && page === 0) headers.set("If-None-Match", etag);
    const response = await authorizedFetch(url.href, { headers });
    if (response.status === 304) {
      return { events: [], etag, notModified: true };
    }
    if (!response.ok) throw await googleError(response);
    const body = (await response.json()) as GoogleListResponse<GoogleEvent>;
    responseEtag ??= body.etag ?? response.headers.get("etag") ?? undefined;
    for (const item of body.items ?? []) {
      const event = normaliseGoogleEvent(feed, item);
      if (event) events.push(event);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  events.sort((left, right) => left.start.localeCompare(right.start));
  return { events, etag: responseEtag, notModified: false };
}
