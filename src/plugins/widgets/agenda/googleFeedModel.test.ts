import type {
  GoogleCalendarFeed,
  GoogleCalendarInfo,
} from "../../../extension/calendar/types";
import { updateGoogleCalendarSelection } from "./googleFeedModel";

const calendar: GoogleCalendarInfo = {
  id: "work@example.com",
  name: "Work",
  colour: "#4285f4",
  timeZone: "Europe/Madrid",
  primary: true,
};

const existing: GoogleCalendarFeed = {
  id: "stable-feed-id",
  kind: "google",
  name: "Old name",
  calendarId: calendar.id,
  colour: "#000000",
  enabled: false,
  refreshMinutes: 60,
  timeZone: "UTC",
};

describe("Google Calendar selection", () => {
  test("creates a local feed for a selected calendar", () => {
    expect(
      updateGoogleCalendarSelection([], calendar, true, () => "new-feed"),
    ).toEqual([
      {
        id: "new-feed",
        kind: "google",
        name: "Work",
        calendarId: "work@example.com",
        colour: "#4285f4",
        enabled: true,
        refreshMinutes: 30,
        timeZone: "Europe/Madrid",
      },
    ]);
  });

  test("keeps cache identity and user refresh settings", () => {
    expect(
      updateGoogleCalendarSelection([existing], calendar, true, () => "unused"),
    ).toEqual([
      {
        ...existing,
        name: calendar.name,
        colour: calendar.colour,
        timeZone: calendar.timeZone,
      },
    ]);
  });

  test("removes only the deselected calendar", () => {
    expect(
      updateGoogleCalendarSelection(
        [existing],
        calendar,
        false,
        () => "unused",
      ),
    ).toEqual([]);
  });
});
