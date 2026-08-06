export const DAYPARTS = ["morning", "day", "evening", "night"] as const;

export type Daypart = (typeof DAYPARTS)[number];
export type DaypartSchedule = Record<Daypart, string>;

export const defaultDaypartSchedule: DaypartSchedule = {
  morning: "06:00",
  day: "11:00",
  evening: "17:00",
  night: "22:00",
};

export function timeToMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

export function normaliseDaypartSchedule(
  schedule?: Partial<DaypartSchedule>,
): DaypartSchedule {
  return Object.fromEntries(
    DAYPARTS.map((daypart) => [
      daypart,
      timeToMinutes(schedule?.[daypart] ?? "") === undefined
        ? defaultDaypartSchedule[daypart]
        : schedule![daypart],
    ]),
  ) as DaypartSchedule;
}

export function daypartAtMinutes(
  minuteOfDay: number,
  schedule?: Partial<DaypartSchedule>,
): Daypart {
  const normalizedMinute =
    ((Math.floor(minuteOfDay) % (24 * 60)) + 24 * 60) % (24 * 60);
  const normalizedSchedule = normaliseDaypartSchedule(schedule);
  const starts = DAYPARTS.map((daypart) => ({
    daypart,
    minute: timeToMinutes(normalizedSchedule[daypart])!,
  })).sort((left, right) => left.minute - right.minute);
  let active = starts.at(-1)!.daypart;
  for (const start of starts) {
    if (start.minute > normalizedMinute) break;
    active = start.daypart;
  }
  return active;
}
