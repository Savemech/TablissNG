export type GeocodedLocation = {
  id: string;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

type OpenMeteoLocation = {
  id?: unknown;
  name?: unknown;
  admin1?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
};

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const MAX_RESULTS = 6;
const TIMEOUT_MS = 10_000;

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function locationLabel(location: OpenMeteoLocation): string {
  const name = String(location.name ?? "").trim();
  const details = [location.admin1, location.country]
    .map((value) => String(value ?? "").trim())
    .filter(
      (value, index, values) =>
        value && value !== name && values.indexOf(value) === index,
    );
  return [name, ...details].join(", ");
}

export function normaliseGeocodingResults(
  payload: unknown,
): GeocodedLocation[] {
  if (!payload || typeof payload !== "object" || !("results" in payload)) {
    return [];
  }
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  return results.flatMap((candidate): GeocodedLocation[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const location = candidate as OpenMeteoLocation;
    const name = String(location.name ?? "").trim();
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const timeZone = String(location.timezone ?? "");
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
      return [];
    }
    return [
      {
        id: String(location.id ?? `${latitude},${longitude}`),
        name,
        label: locationLabel(location),
        latitude,
        longitude,
        timeZone,
      },
    ];
  });
}

export async function searchLocations(
  query: string,
  language = "en",
  signal?: AbortSignal,
): Promise<GeocodedLocation[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, TIMEOUT_MS);
  const url = new URL(GEOCODING_ENDPOINT);
  url.searchParams.set("name", normalizedQuery);
  url.searchParams.set("count", String(MAX_RESULTS));
  url.searchParams.set("language", language.split(/[-_]/)[0].toLowerCase());
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Location search failed with HTTP ${response.status}`);
    }
    return normaliseGeocodingResults(await response.json());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
