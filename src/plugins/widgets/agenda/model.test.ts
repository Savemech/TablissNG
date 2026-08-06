import type { AgendaEvent } from "../../../extension/calendar/types";
import {
  dateKeyInTimeZone,
  eventsForDay,
  nextDateKey,
  validTimeZone,
} from "./model";

const timed = (id: string, start: string, end: string): AgendaEvent => ({
  id,
  feedId: "feed",
  uid: id,
  title: id,
  start,
  end,
  allDay: false,
  colour: "#fff",
});

describe("Agenda day model", () => {
  test("uses the selected timezone and calendar-day arithmetic", () => {
    expect(
      dateKeyInTimeZone(new Date("2026-08-05T22:30:00Z"), "Europe/Madrid"),
    ).toBe("2026-08-06");
    expect(nextDateKey("2026-12-31")).toBe("2027-01-01");
    expect(validTimeZone("Europe/Madrid")).toBe(true);
    expect(validTimeZone("Mars/Olympus_Mons")).toBe(false);
  });

  test("selects overlapping, all-day and optionally past events", () => {
    const events: AgendaEvent[] = [
      timed("past", "2026-08-06T06:00:00Z", "2026-08-06T07:00:00Z"),
      timed("next", "2026-08-06T10:00:00Z", "2026-08-06T11:00:00Z"),
      timed("tomorrow", "2026-08-06T22:00:00Z", "2026-08-06T23:00:00Z"),
      {
        ...timed("holiday", "2026-08-05T22:00:00Z", "2026-08-07T22:00:00Z"),
        allDay: true,
        startDate: "2026-08-06",
        endDateExclusive: "2026-08-08",
      },
    ];
    expect(
      eventsForDay(
        events,
        "2026-08-06",
        "Europe/Madrid",
        new Date("2026-08-06T08:00:00Z"),
        true,
      ).map(({ id }) => id),
    ).toEqual(["holiday", "next"]);
  });
});
