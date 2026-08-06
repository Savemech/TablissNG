import type {
  GoogleCalendarFeed,
  GoogleCalendarInfo,
} from "../../../extension/calendar/types";

export function updateGoogleCalendarSelection(
  feeds: readonly GoogleCalendarFeed[],
  calendar: GoogleCalendarInfo,
  selected: boolean,
  createId: () => string,
): GoogleCalendarFeed[] {
  const existing = feeds.find(({ calendarId }) => calendarId === calendar.id);
  if (!selected) {
    return feeds.filter(({ calendarId }) => calendarId !== calendar.id);
  }
  if (existing) {
    return feeds.map((feed) =>
      feed.calendarId === calendar.id
        ? {
            ...feed,
            name: calendar.name,
            colour: calendar.colour,
            timeZone: calendar.timeZone,
          }
        : feed,
    );
  }
  return [
    ...feeds,
    {
      id: createId(),
      kind: "google",
      name: calendar.name,
      calendarId: calendar.id,
      colour: calendar.colour,
      enabled: true,
      refreshMinutes: 30,
      timeZone: calendar.timeZone,
    },
  ];
}
