import type { GeocodedLocation } from "../../../location/geocoding";
import {
  type Daypart,
  daypartAtMinutes,
  type DaypartSchedule,
  normaliseDaypartSchedule,
} from "./model";
import { minuteInTimeZone } from "./solar";
import {
  normaliseSolarSchedule,
  resolveSolarSchedule,
  type ScheduleMode,
  type SolarScheduleConfig,
  type SolarScheduleStatus,
} from "./solarSchedule";

export type DaypartRuntimeData = {
  schedule?: Partial<DaypartSchedule>;
  scheduleMode?: ScheduleMode;
  solar?: Partial<SolarScheduleConfig>;
};

export type DaypartRuntime = {
  mode: ScheduleMode;
  source: "clock" | "solar";
  daypart: Daypart;
  schedule: DaypartSchedule;
  minuteOfDay: number;
  solarStatus?: SolarScheduleStatus;
  solarEventMinutes: ReturnType<typeof resolveSolarSchedule>["eventMinutes"];
  solarLocation?: GeocodedLocation;
  solarDateKey?: string;
};

function clockMinute(now: Date, timeZone?: string | null): number {
  if (timeZone) {
    try {
      return minuteInTimeZone(now, timeZone);
    } catch {
      // Invalid legacy time zones fall back to the browser's local clock.
    }
  }
  return now.getHours() * 60 + now.getMinutes();
}

export function resolveDaypartRuntime(
  now: Date,
  data: DaypartRuntimeData,
  clockTimeZone?: string | null,
): DaypartRuntime {
  const fixedSchedule = normaliseDaypartSchedule(data.schedule);
  const mode = data.scheduleMode === "solar" ? "solar" : "clock";
  if (mode === "solar") {
    const resolved = resolveSolarSchedule(now, data.solar, fixedSchedule);
    if (resolved.minuteOfDay !== undefined) {
      return {
        mode,
        source: resolved.status === "ready" ? "solar" : "clock",
        daypart: daypartAtMinutes(resolved.minuteOfDay, resolved.schedule),
        schedule: resolved.schedule,
        minuteOfDay: resolved.minuteOfDay,
        solarStatus: resolved.status,
        solarEventMinutes: resolved.eventMinutes,
        solarLocation: normaliseSolarSchedule(data.solar).location,
        solarDateKey: resolved.dateKey,
      };
    }
  }

  const minuteOfDay = clockMinute(now, clockTimeZone);
  return {
    mode,
    source: "clock",
    daypart: daypartAtMinutes(minuteOfDay, fixedSchedule),
    schedule: fixedSchedule,
    minuteOfDay,
    solarStatus: mode === "solar" ? "missing-location" : undefined,
    solarEventMinutes: {},
    solarLocation: normaliseSolarSchedule(data.solar).location,
  };
}
