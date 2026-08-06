import { normaliseGoogleEvent } from "./googleApi";
import type { GoogleCalendarFeed } from "./types";

const feed: GoogleCalendarFeed = {
  id: "google-work",
  kind: "google",
  name: "Work",
  calendarId: "work@example.com",
  colour: "#4285f4",
  enabled: true,
  refreshMinutes: 30,
  timeZone: "Europe/Madrid",
};

describe("Google Calendar normalisation", () => {
  test("preserves all-day dates in the calendar timezone", () => {
    expect(
      normaliseGoogleEvent(feed, {
        id: "holiday",
        summary: "Holiday",
        start: { date: "2026-08-06" },
        end: { date: "2026-08-08" },
      }),
    ).toMatchObject({
      id: "google-work:holiday",
      title: "Holiday",
      allDay: true,
      start: "2026-08-05T22:00:00.000Z",
      end: "2026-08-07T22:00:00.000Z",
      startDate: "2026-08-06",
      endDateExclusive: "2026-08-08",
    });
  });

  test("normalises timed events and rejects cancelled events", () => {
    expect(
      normaliseGoogleEvent(feed, {
        id: "meeting",
        summary: " Planning ",
        start: { dateTime: "2026-08-06T09:30:00+02:00" },
        end: { dateTime: "2026-08-06T10:00:00+02:00" },
        location: " Room 1 ",
        htmlLink: "https://calendar.google.com/event?eid=meeting",
      }),
    ).toMatchObject({
      title: "Planning",
      start: "2026-08-06T07:30:00.000Z",
      end: "2026-08-06T08:00:00.000Z",
      allDay: false,
      location: "Room 1",
    });
    expect(
      normaliseGoogleEvent(feed, {
        id: "cancelled",
        status: "cancelled",
        start: { dateTime: "2026-08-06T09:30:00Z" },
        end: { dateTime: "2026-08-06T10:00:00Z" },
      }),
    ).toBeUndefined();
  });
});
