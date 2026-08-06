import { fromZonedTime } from "date-fns-tz";
import ICAL from "ical.js";

import type { AgendaEvent, ICalFeed, ParsedCalendar } from "./types";

const MAX_COMPONENTS = 5_000;
const MAX_RECURRENCE_STEPS = 50_000;

type ICalEvent = InstanceType<typeof ICAL.Event>;
type ICalTime = InstanceType<typeof ICAL.Time>;
type OccurrenceDetails = ReturnType<ICalEvent["getOccurrenceDetails"]>;

type ParseOptions = {
  fallbackTimeZone: string;
  rangeStart: Date;
  rangeEnd: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(time: ICalTime): string {
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

function propertyTimeZone(
  event: ICalEvent,
  propertyName: "dtstart" | "dtend",
): string | undefined {
  const property = event.component.getFirstProperty(propertyName);
  const value = property?.getParameter("tzid");
  return typeof value === "string" && value ? value : undefined;
}

function timeToDate(time: ICalTime, timeZone: string): Date {
  if (time.zone?.tzid === "UTC" || time.zone?.component) {
    return time.toJSDate();
  }
  const local = `${dateKey(time)}T${pad(time.hour)}:${pad(time.minute)}:${pad(
    time.second,
  )}`;
  try {
    return fromZonedTime(local, timeZone);
  } catch {
    return fromZonedTime(local, "UTC");
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function statusOf(event: ICalEvent): string {
  return String(
    event.component.getFirstPropertyValue("status") ?? "",
  ).toUpperCase();
}

function normaliseOccurrence(
  feed: ICalFeed,
  master: ICalEvent,
  details: OccurrenceDetails,
  fallbackTimeZone: string,
): AgendaEvent | undefined {
  if (statusOf(details.item) === "CANCELLED") return undefined;
  const allDay = details.startDate.isDate;
  const startTimeZone =
    propertyTimeZone(details.item, "dtstart") ??
    propertyTimeZone(master, "dtstart") ??
    fallbackTimeZone;
  const endTimeZone =
    propertyTimeZone(details.item, "dtend") ??
    propertyTimeZone(master, "dtend") ??
    startTimeZone;
  const start = timeToDate(details.startDate, startTimeZone);
  const end = timeToDate(details.endDate, endTimeZone);
  const recurrenceId = details.recurrenceId.toString();
  const item = details.item;
  const uid = stringValue(item.uid) ?? stringValue(master.uid) ?? "event";
  const componentUrl = stringValue(item.component.getFirstPropertyValue("url"));
  return {
    id: `${feed.id}:${uid}:${recurrenceId}`,
    feedId: feed.id,
    uid,
    title: stringValue(item.summary) ?? "Untitled event",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    startDate: allDay ? dateKey(details.startDate) : undefined,
    endDateExclusive: allDay ? dateKey(details.endDate) : undefined,
    location: stringValue(item.location),
    url: componentUrl,
    colour: feed.colour,
  };
}

function overlapsRange(
  event: AgendaEvent,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return (
    new Date(event.start).getTime() < rangeEnd.getTime() &&
    new Date(event.end).getTime() > rangeStart.getTime()
  );
}

export function parseICalendar(
  source: string,
  feed: ICalFeed,
  options: ParseOptions,
): ParsedCalendar {
  const root = new ICAL.Component(ICAL.parse(source));
  if (root.name !== "vcalendar") {
    throw new Error("The response is not an iCalendar document");
  }
  const components = root.getAllSubcomponents("vevent");
  if (components.length > MAX_COMPONENTS) {
    throw new Error(`Calendar contains more than ${MAX_COMPONENTS} events`);
  }
  const exceptions = components.filter((component) =>
    component.hasProperty("recurrence-id"),
  );
  const events: AgendaEvent[] = [];
  let recurrenceSteps = 0;
  let truncated = false;

  for (const [componentIndex, component] of components.entries()) {
    if (component.hasProperty("recurrence-id")) continue;
    const uid = stringValue(component.getFirstPropertyValue("uid"));
    const relatedExceptions = exceptions.filter(
      (exception) =>
        stringValue(exception.getFirstPropertyValue("uid")) === uid,
    );
    const event = new ICAL.Event(component, {
      strictExceptions: true,
      exceptions: relatedExceptions,
    });
    if (statusOf(event) === "CANCELLED") continue;

    if (!event.isRecurring()) {
      const occurrence = event.startDate;
      const normalised = normaliseOccurrence(
        feed,
        event,
        event.getOccurrenceDetails(occurrence),
        options.fallbackTimeZone,
      );
      if (normalised) {
        if (normalised.uid === "event") {
          normalised.uid = `event-${componentIndex}`;
          normalised.id = `${feed.id}:${normalised.uid}:${occurrence}`;
        }
        if (overlapsRange(normalised, options.rangeStart, options.rangeEnd)) {
          events.push(normalised);
        }
      }
      continue;
    }

    const iterator = event.iterator();
    let occurrence: ICalTime | null;
    while ((occurrence = iterator.next())) {
      recurrenceSteps += 1;
      if (recurrenceSteps > MAX_RECURRENCE_STEPS) {
        truncated = true;
        break;
      }
      const normalised = normaliseOccurrence(
        feed,
        event,
        event.getOccurrenceDetails(occurrence),
        options.fallbackTimeZone,
      );
      if (!normalised) continue;
      const start = new Date(normalised.start);
      if (start >= options.rangeEnd) break;
      if (overlapsRange(normalised, options.rangeStart, options.rangeEnd)) {
        events.push(normalised);
      }
    }
    if (truncated) break;
  }

  events.sort(
    (left, right) =>
      left.start.localeCompare(right.start) ||
      left.title.localeCompare(right.title),
  );
  const name = stringValue(root.getFirstPropertyValue("x-wr-calname"));
  return { name, events, truncated };
}
