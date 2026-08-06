const DAY_MS = 86_400_000;
const JULIAN_1970 = 2_440_588;
const JULIAN_2000 = 2_451_545;
const JULIAN_CYCLE_OFFSET = 0.0009;
const RAD = Math.PI / 180;
const OBLIQUITY = 23.4397 * RAD;

export const SOLAR_EVENTS = [
  "civilDawn",
  "sunrise",
  "solarNoon",
  "sunset",
  "civilDusk",
] as const;

export type SolarEvent = (typeof SOLAR_EVENTS)[number];
export type SolarState = "normal" | "polar-day" | "polar-night";

export type LocalDate = {
  year: number;
  month: number;
  day: number;
};

export type ZonedDateTime = LocalDate & {
  hour: number;
  minute: number;
};

export type SolarTimes = {
  state: SolarState;
  events: Partial<Record<SolarEvent, Date>> & { solarNoon: Date };
};

function toJulian(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + JULIAN_1970;
}

function fromJulian(julian: number): Date {
  return new Date((julian + 0.5 - JULIAN_1970) * DAY_MS);
}

function toDays(date: Date): number {
  return toJulian(date) - JULIAN_2000;
}

function solarMeanAnomaly(days: number): number {
  return RAD * (357.5291 + 0.98560028 * days);
}

function eclipticLongitude(meanAnomaly: number): number {
  const equationOfCentre =
    RAD *
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly));
  return meanAnomaly + equationOfCentre + RAD * 102.9372 + Math.PI;
}

function declination(longitude: number): number {
  return Math.asin(Math.sin(longitude) * Math.sin(OBLIQUITY));
}

function julianCycle(days: number, westLongitude: number): number {
  return Math.round(days - JULIAN_CYCLE_OFFSET - westLongitude / (2 * Math.PI));
}

function approximateTransit(
  hourAngle: number,
  westLongitude: number,
  cycle: number,
): number {
  return (
    JULIAN_CYCLE_OFFSET + (hourAngle + westLongitude) / (2 * Math.PI) + cycle
  );
}

function solarTransitJulian(
  transit: number,
  meanAnomaly: number,
  longitude: number,
): number {
  return (
    JULIAN_2000 +
    transit +
    0.0053 * Math.sin(meanAnomaly) -
    0.0069 * Math.sin(2 * longitude)
  );
}

function cosineHourAngle(
  altitude: number,
  latitude: number,
  sunDeclination: number,
): number {
  return (
    (Math.sin(altitude) - Math.sin(latitude) * Math.sin(sunDeclination)) /
    (Math.cos(latitude) * Math.cos(sunDeclination))
  );
}

function setJulian(
  altitude: number,
  westLongitude: number,
  latitude: number,
  sunDeclination: number,
  cycle: number,
  meanAnomaly: number,
  longitude: number,
): number | undefined {
  const cosine = cosineHourAngle(altitude, latitude, sunDeclination);
  if (cosine < -1 || cosine > 1) return undefined;
  const hourAngle = Math.acos(cosine);
  const transit = approximateTransit(hourAngle, westLongitude, cycle);
  return solarTransitJulian(transit, meanAnomaly, longitude);
}

function dateKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(
    date.day,
  ).padStart(2, "0")}`;
}

function calculateCandidate(
  date: Date,
  latitudeDegrees: number,
  longitudeDegrees: number,
): SolarTimes {
  const westLongitude = -longitudeDegrees * RAD;
  const latitude = latitudeDegrees * RAD;
  const days = toDays(date);
  const cycle = julianCycle(days, westLongitude);
  const transit = approximateTransit(0, westLongitude, cycle);
  const meanAnomaly = solarMeanAnomaly(transit);
  const longitude = eclipticLongitude(meanAnomaly);
  const sunDeclination = declination(longitude);
  const noonJulian = solarTransitJulian(transit, meanAnomaly, longitude);
  const solarNoon = fromJulian(noonJulian);
  const sunriseCosine = cosineHourAngle(-0.833 * RAD, latitude, sunDeclination);
  const state: SolarState =
    sunriseCosine < -1
      ? "polar-day"
      : sunriseCosine > 1
        ? "polar-night"
        : "normal";

  const pair = (altitude: number): [Date, Date] | undefined => {
    const sunsetJulian = setJulian(
      altitude * RAD,
      westLongitude,
      latitude,
      sunDeclination,
      cycle,
      meanAnomaly,
      longitude,
    );
    if (sunsetJulian === undefined) return undefined;
    return [
      fromJulian(noonJulian - (sunsetJulian - noonJulian)),
      fromJulian(sunsetJulian),
    ];
  };

  const horizon = pair(-0.833);
  const civil = pair(-6);
  return {
    state,
    events: {
      solarNoon,
      ...(horizon ? { sunrise: horizon[0], sunset: horizon[1] } : {}),
      ...(civil ? { civilDawn: civil[0], civilDusk: civil[1] } : {}),
    },
  };
}

export function zonedDateTime(date: Date, timeZone: string): ZonedDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

export function minuteInTimeZone(date: Date, timeZone: string): number {
  const parts = zonedDateTime(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

/**
 * Meeus/SunCalc-style solar transit calculation. It runs entirely locally;
 * atmospheric refraction is approximated with the conventional -0.833°
 * apparent horizon and civil twilight uses -6°.
 */
export function solarTimesForDate(
  localDate: LocalDate,
  latitude: number,
  longitude: number,
  timeZone: string,
): SolarTimes {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError("Solar coordinates are outside WGS84 bounds");
  }
  const base = Date.UTC(localDate.year, localDate.month - 1, localDate.day, 12);
  const targetKey = dateKey(localDate);
  let nearest = calculateCandidate(new Date(base), latitude, longitude);
  for (const dayShift of [-1, 0, 1]) {
    const candidate = calculateCandidate(
      new Date(base + dayShift * DAY_MS),
      latitude,
      longitude,
    );
    const noonDate = zonedDateTime(candidate.events.solarNoon, timeZone);
    if (dateKey(noonDate) === targetKey) return candidate;
    nearest = candidate;
  }
  return nearest;
}
