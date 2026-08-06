export type ICalFeed = {
  id: string;
  kind: "ical";
  name: string;
  url: string;
  colour: string;
  enabled: boolean;
  refreshMinutes: number;
  timeZone: string;
};

export type GoogleCalendarFeed = {
  id: string;
  kind: "google";
  name: string;
  calendarId: string;
  colour: string;
  enabled: boolean;
  refreshMinutes: number;
  timeZone: string;
};

export type CalendarFeed = ICalFeed | GoogleCalendarFeed;

export type GoogleCalendarInfo = {
  id: string;
  name: string;
  colour: string;
  timeZone: string;
  primary: boolean;
};

export type AgendaEvent = {
  id: string;
  feedId: string;
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startDate?: string;
  endDateExclusive?: string;
  location?: string;
  url?: string;
  colour: string;
};

export type CalendarFeedCache = {
  feedId: string;
  events: AgendaEvent[];
  fetchedAt?: number;
  lastAttemptAt: number;
  etag?: string;
  lastModified?: string;
  calendarName?: string;
  error?: string;
};

export type ParsedCalendar = {
  name?: string;
  events: AgendaEvent[];
  truncated: boolean;
};

export type CalendarRefreshResult = {
  feedId: string;
  eventCount: number;
  status: "cached" | "ready";
};
