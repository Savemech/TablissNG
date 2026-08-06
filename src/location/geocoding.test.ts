import { normaliseGeocodingResults } from "./geocoding";

describe("location geocoding", () => {
  test("keeps only bounded coordinates with a real IANA time zone", () => {
    expect(
      normaliseGeocodingResults({
        results: [
          {
            id: 2988507,
            name: "Paris",
            admin1: "Île-de-France",
            country: "France",
            latitude: 48.85341,
            longitude: 2.3488,
            timezone: "Europe/Paris",
          },
          {
            name: "Broken",
            latitude: 200,
            longitude: 2,
            timezone: "Mars/Olympus_Mons",
          },
        ],
      }),
    ).toEqual([
      {
        id: "2988507",
        name: "Paris",
        label: "Paris, Île-de-France, France",
        latitude: 48.85341,
        longitude: 2.3488,
        timeZone: "Europe/Paris",
      },
    ]);
  });

  test("handles malformed provider responses", () => {
    expect(normaliseGeocodingResults(undefined)).toEqual([]);
    expect(normaliseGeocodingResults({ results: "nope" })).toEqual([]);
  });
});
