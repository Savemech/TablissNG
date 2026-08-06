import { parseICalendar } from "./ical";
import type { ICalFeed } from "./types";

const feed: ICalFeed = {
  id: "work",
  kind: "ical",
  name: "Work",
  url: "https://calendar.example/work.ics",
  colour: "#4f8cff",
  enabled: true,
  refreshMinutes: 30,
  timeZone: "Europe/Madrid",
};

const crlf = String.fromCharCode(13, 10);
const calendar =
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-CALNAME:Test calendar",
    "BEGIN:VEVENT",
    "UID:standup",
    "DTSTART;TZID=Europe/Madrid:20260803T093000",
    "DTEND;TZID=Europe/Madrid:20260803T100000",
    "RRULE:FREQ=DAILY;COUNT=5",
    "EXDATE;TZID=Europe/Madrid:20260805T093000",
    "SUMMARY:Stand-up",
    "LOCATION:Room 1",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:standup",
    "RECURRENCE-ID;TZID=Europe/Madrid:20260806T093000",
    "DTSTART;TZID=Europe/Madrid:20260806T113000",
    "DTEND;TZID=Europe/Madrid:20260806T120000",
    "SUMMARY:Moved stand-up",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:holiday",
    "DTSTART;VALUE=DATE:20260806",
    "DTEND;VALUE=DATE:20260808",
    "SUMMARY:Holiday",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join(crlf) + crlf;

describe("iCalendar normalisation", () => {
  test("expands recurrences, exclusions, exceptions and all-day spans", () => {
    const parsed = parseICalendar(calendar, feed, {
      fallbackTimeZone: "Europe/Madrid",
      rangeStart: new Date("2026-08-03T00:00:00Z"),
      rangeEnd: new Date("2026-08-09T00:00:00Z"),
    });
    expect(parsed.name).toBe("Test calendar");
    expect(parsed.truncated).toBe(false);
    expect(parsed.events.map(({ title }) => title)).toEqual([
      "Stand-up",
      "Stand-up",
      "Holiday",
      "Moved stand-up",
      "Stand-up",
    ]);
    expect(
      parsed.events.find(({ title }) => title === "Moved stand-up")?.start,
    ).toBe("2026-08-06T09:30:00.000Z");
    expect(
      parsed.events.find(({ title }) => title === "Holiday"),
    ).toMatchObject({
      allDay: true,
      startDate: "2026-08-06",
      endDateExclusive: "2026-08-08",
    });
  });

  test("rejects a non-calendar response", () => {
    expect(() =>
      parseICalendar("not a calendar", feed, {
        fallbackTimeZone: "UTC",
        rangeStart: new Date(0),
        rangeEnd: new Date(1),
      }),
    ).toThrow();
  });
});
