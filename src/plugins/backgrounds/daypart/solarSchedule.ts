import type { GeocodedLocation } from "../../../location/geocoding";
import {
  type Daypart,
  DAYPARTS,
  type DaypartSchedule,
  defaultDaypartSchedule,
} from "./model";
import {
  minuteInTimeZone,
  type SolarEvent,
  type SolarState,
  solarTimesForDate,
  zonedDateTime,
} from "./solar";

export type ScheduleMode = "clock" | "solar";

export type SolarBoundary = {
  event: SolarEvent;
  offsetMinutes: number;
};

export type SolarScheduleConfig = {
  location?: GeocodedLocation;
  boundaries: Record<Daypart, SolarBoundary>;
};

export type SolarScheduleStatus =
  | "ready"
  | "missing-location"
  | "invalid-location"
  | "polar-day"
  | "polar-night"
  | "unavailable";

export type ResolvedSolarSchedule = {
  status: SolarScheduleStatus;
  schedule: DaypartSchedule;
  minuteOfDay?: number;
  eventMinutes: Partial<Record<SolarEvent, number>>;
  state?: SolarState;
  dateKey?: string;
};

export const SOLAR_OFFSET_MIN = -360;
export const SOLAR_OFFSET_MAX = 360;
export const DAYPART_MIN_GAP = 15;

export const defaultSolarBoundaries: Record<Daypart, SolarBoundary> = {
  morning: { event: "civilDawn", offsetMinutes: 0 },
  day: { event: "solarNoon", offsetMinutes: -120 },
  evening: { event: "sunset", offsetMinutes: -60 },
  night: { event: "civilDusk", offsetMinutes: 0 },
};

export const defaultSolarSchedule: SolarScheduleConfig = {
  boundaries: defaultSolarBoundaries,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isSolarEvent(value: unknown): value is SolarEvent {
  return (
    value === "civilDawn" ||
    value === "sunrise" ||
    value === "solarNoon" ||
    value === "sunset" ||
    value === "civilDusk"
  );
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normaliseLocation(value: unknown): GeocodedLocation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<GeocodedLocation>;
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);
  const timeZone = String(candidate.timeZone ?? "");
  const name = String(candidate.name ?? "").trim();
  if (
    !name ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !validTimeZone(timeZone)
  ) {
    return undefined;
  }
  return {
    id: String(candidate.id ?? `${latitude},${longitude}`),
    name,
    label: String(candidate.label ?? name).trim() || name,
    latitude,
    longitude,
    timeZone,
  };
}

function normaliseBoundary(
  value: Partial<SolarBoundary> | undefined,
  fallback: SolarBoundary,
): SolarBoundary {
  const offset = Number(value?.offsetMinutes);
  return {
    event: isSolarEvent(value?.event) ? value.event : fallback.event,
    offsetMinutes: clamp(
      Number.isFinite(offset) ? Math.round(offset) : fallback.offsetMinutes,
      SOLAR_OFFSET_MIN,
      SOLAR_OFFSET_MAX,
    ),
  };
}

export function normaliseSolarSchedule(
  value?: Partial<SolarScheduleConfig>,
): SolarScheduleConfig {
  return {
    location: normaliseLocation(value?.location),
    boundaries: Object.fromEntries(
      DAYPARTS.map((daypart) => [
        daypart,
        normaliseBoundary(
          value?.boundaries?.[daypart],
          defaultSolarBoundaries[daypart],
        ),
      ]),
    ) as Record<Daypart, SolarBoundary>,
  };
}

export function orderedBoundaryMinutes(
  minutes: Record<Daypart, number>,
  minimumGap = DAYPART_MIN_GAP,
): Record<Daypart, number> {
  const result = {} as Record<Daypart, number>;
  DAYPARTS.forEach((daypart, index) => {
    const minimum = index * minimumGap;
    const maximum = 24 * 60 - 1 - (DAYPARTS.length - index - 1) * minimumGap;
    const requested = clamp(Math.round(minutes[daypart]), minimum, maximum);
    result[daypart] =
      index === 0
        ? requested
        : Math.max(requested, result[DAYPARTS[index - 1]] + minimumGap);
  });
  return result;
}

export function offsetForBoundaryMinute(
  minute: number,
  anchorMinute: number,
): number {
  return clamp(
    Math.round(minute - anchorMinute),
    SOLAR_OFFSET_MIN,
    SOLAR_OFFSET_MAX,
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function minutesToTime(value: number): string {
  const minute = clamp(Math.round(value), 0, 24 * 60 - 1);
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function resolveSolarSchedule(
  now: Date,
  value?: Partial<SolarScheduleConfig>,
  fallbackSchedule: DaypartSchedule = defaultDaypartSchedule,
): ResolvedSolarSchedule {
  const config = normaliseSolarSchedule(value);
  if (!value?.location) {
    return {
      status: "missing-location",
      schedule: fallbackSchedule,
      eventMinutes: {},
    };
  }
  const location = config.location;
  if (!location) {
    return {
      status: "invalid-location",
      schedule: fallbackSchedule,
      eventMinutes: {},
    };
  }

  const localNow = zonedDateTime(now, location.timeZone);
  const minuteOfDay = localNow.hour * 60 + localNow.minute;
  const times = solarTimesForDate(
    localNow,
    location.latitude,
    location.longitude,
    location.timeZone,
  );
  const eventMinutes = Object.fromEntries(
    Object.entries(times.events).map(([event, date]) => [
      event,
      minuteInTimeZone(date, location.timeZone),
    ]),
  ) as Partial<Record<SolarEvent, number>>;
  const base = {
    schedule: fallbackSchedule,
    minuteOfDay,
    eventMinutes,
    state: times.state,
    dateKey: dateKey(localNow.year, localNow.month, localNow.day),
  };
  if (times.state !== "normal") {
    return { ...base, status: times.state };
  }

  const requested = {} as Record<Daypart, number>;
  for (const daypart of DAYPARTS) {
    const boundary = config.boundaries[daypart];
    const anchor = eventMinutes[boundary.event];
    if (anchor === undefined) {
      return { ...base, status: "unavailable" };
    }
    requested[daypart] = clamp(anchor + boundary.offsetMinutes, 0, 24 * 60 - 1);
  }
  const ordered = orderedBoundaryMinutes(requested);
  return {
    ...base,
    status: "ready",
    schedule: Object.fromEntries(
      DAYPARTS.map((daypart) => [daypart, minutesToTime(ordered[daypart])]),
    ) as DaypartSchedule,
  };
}
