import { hasDataCollectionPermissions } from "../../../extension/dataConsent";
import { searchLocations } from "../../../location/geocoding";
import { API } from "../../types";
import { Cache, Coordinates, Data } from "./types";

type Config = Pick<Data, "latitude" | "longitude" | "units">;

/** Get current forecast for a location */
export async function getForecast(
  { latitude, longitude, units }: Config,
  loader: API["loader"],
): Promise<Cache> {
  if (!latitude || !longitude) {
    return;
  }
  if (!(await hasDataCollectionPermissions(["locationInfo"]))) return;

  loader.push();
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    `latitude=${latitude}&` +
    `longitude=${longitude}&` +
    "hourly=temperature_2m,apparent_temperature,relativehumidity_2m,weathercode&" +
    "daily=weathercode,temperature_2m_max,temperature_2m_min&" +
    "timeformat=unixtime&" +
    "timezone=auto&" +
    `temperature_unit=${units === "us" ? "fahrenheit" : "celsius"}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const body = await res.json();
    if (!body?.hourly?.time || !body?.daily?.time) return;

    return {
      timestamp: Date.now(),
      conditions: body.hourly.time.map((time: number, i: number) => ({
        timestamp: time * 1000,
        temperature: body.hourly.temperature_2m[i],
        apparentTemperature: body.hourly.apparent_temperature[i],
        humidity: body.hourly.relativehumidity_2m[i],
        weatherCode: body.hourly.weathercode[i],
      })),
      dailyConditions: body.daily.time.map((time: number, i: number) => ({
        timestamp: time * 1000,
        temperatureMax: body.daily.temperature_2m_max[i],
        temperatureMin: body.daily.temperature_2m_min[i],
        weatherCode: body.daily.weathercode[i],
      })),
    };
  } catch {
    return;
  } finally {
    loader.pop();
  }
}

/** Request current location from the browser */
export function requestLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: round(coords.latitude),
          longitude: round(coords.longitude),
        }),
      reject,
      { timeout: 10000 },
    ),
  );
}

/** Perform geocoding lookup on query string */
export async function geocodeLocation(
  query: string,
): Promise<Coordinates | undefined> {
  if (!(await hasDataCollectionPermissions(["locationInfo"]))) return;
  try {
    const location = (await searchLocations(query, navigator.language))[0];
    if (!location) return;
    return {
      latitude: round(location.latitude),
      longitude: round(location.longitude),
    };
  } catch {
    return;
  }
}

function round(x: number, precision = 4): number {
  return Math.round(x * 10 ** precision) / 10 ** precision;
}
