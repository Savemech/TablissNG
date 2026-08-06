import { minuteInTimeZone, solarTimesForDate, zonedDateTime } from "./solar";

describe("local solar calculation", () => {
  test("matches published Paris sunrise and sunset within a few minutes", () => {
    const times = solarTimesForDate(
      { year: 2026, month: 8, day: 6 },
      48.8566,
      2.3522,
      "Europe/Paris",
    );
    expect(times.state).toBe("normal");
    expect(
      Math.abs(
        minuteInTimeZone(times.events.sunrise!, "Europe/Paris") - (6 * 60 + 30),
      ),
    ).toBeLessThanOrEqual(5);
    expect(
      Math.abs(
        minuteInTimeZone(times.events.sunset!, "Europe/Paris") - (21 * 60 + 21),
      ),
    ).toBeLessThanOrEqual(5);
  });

  test("selects the requested local date across time zones", () => {
    const times = solarTimesForDate(
      { year: 2026, month: 8, day: 6 },
      40.7128,
      -74.006,
      "America/New_York",
    );
    expect(
      zonedDateTime(times.events.solarNoon, "America/New_York"),
    ).toMatchObject({ year: 2026, month: 8, day: 6 });
    expect(
      Math.abs(
        minuteInTimeZone(times.events.sunrise!, "America/New_York") -
          (5 * 60 + 57),
      ),
    ).toBeLessThanOrEqual(5);
  });

  test("reports polar conditions instead of returning invalid dates", () => {
    const times = solarTimesForDate(
      { year: 2026, month: 12, day: 21 },
      69.6492,
      18.9553,
      "Europe/Oslo",
    );
    expect(times.state).toBe("polar-night");
    expect(times.events.sunrise).toBeUndefined();
    expect(times.events.sunset).toBeUndefined();
    expect(Number.isNaN(times.events.solarNoon.valueOf())).toBe(false);
  });
});
