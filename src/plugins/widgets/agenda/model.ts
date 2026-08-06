import { fromZonedTime } from "date-fns-tz";

import type { AgendaEvent } from "../../../extension/calendar/types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

export function eventsForDay(
  events: readonly AgendaEvent[],
  dateKey: string,
  timeZone: string,
  now: Date,
  hidePast: boolean,
): AgendaEvent[] {
  const nextKey = nextDateKey(dateKey);
  const dayStart = fromZonedTime(`${dateKey}T00:00:00`, timeZone).getTime();
  const dayEnd = fromZonedTime(`${nextKey}T00:00:00`, timeZone).getTime();
  const nowTime = now.getTime();
  return events
    .filter((event) => {
      if (event.allDay) {
        return (
          Boolean(event.startDate && event.endDateExclusive) &&
          event.startDate! <= dateKey &&
          event.endDateExclusive! > dateKey
        );
      }
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      return start < dayEnd && end > dayStart && (!hidePast || end > nowTime);
    })
    .sort((left, right) => {
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      return (
        left.start.localeCompare(right.start) ||
        left.title.localeCompare(right.title)
      );
    });
}
