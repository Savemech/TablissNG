import { defaultDaypartSchedule, timeToMinutes } from "./model";
import { resolveDaypartRuntime } from "./runtime";
import {
  constrainBoundaryMinute,
  defaultSolarBoundaries,
  normaliseSolarSchedule,
  offsetForBoundaryMinute,
  orderedBoundaryMinutes,
  resolveSolarSchedule,
} from "./solarSchedule";

const paris = {
  id: "2988507",
  name: "Paris",
  label: "Paris, France",
  latitude: 48.8566,
  longitude: 2.3522,
  timeZone: "Europe/Paris",
};

describe("solar daypart schedule", () => {
  test("starts the evening one hour before today's sunset", () => {
    const resolved = resolveSolarSchedule(new Date("2026-08-06T18:30:00Z"), {
      location: paris,
      boundaries: defaultSolarBoundaries,
    });
    expect(resolved.status).toBe("ready");
    const sunset = resolved.eventMinutes.sunset!;
    expect(timeToMinutes(resolved.schedule.evening)).toBe(sunset - 60);
    expect(resolved.schedule.evening).toMatch(/^20:2\d$/);
  });

  test("uses city-local time and keeps legacy clock schedules intact", () => {
    const solar = resolveDaypartRuntime(
      new Date("2026-08-06T18:30:00Z"),
      {
        scheduleMode: "solar",
        schedule: defaultDaypartSchedule,
        solar: { location: paris, boundaries: defaultSolarBoundaries },
      },
      "UTC",
    );
    expect(solar.source).toBe("solar");
    expect(solar.daypart).toBe("evening");

    const clock = resolveDaypartRuntime(
      new Date("2026-08-06T18:30:00Z"),
      { schedule: defaultDaypartSchedule },
      "UTC",
    );
    expect(clock.mode).toBe("clock");
    expect(clock.daypart).toBe("evening");
  });

  test("falls back safely during polar night", () => {
    const resolved = resolveSolarSchedule(new Date("2026-12-21T12:00:00Z"), {
      location: {
        ...paris,
        id: "tromso",
        name: "Tromsø",
        label: "Tromsø, Norway",
        latitude: 69.6492,
        longitude: 18.9553,
        timeZone: "Europe/Oslo",
      },
      boundaries: defaultSolarBoundaries,
    });
    expect(resolved.status).toBe("polar-night");
    expect(resolved.schedule).toEqual(defaultDaypartSchedule);
  });

  test("normalises imported config and prevents crossed visual handles", () => {
    expect(
      normaliseSolarSchedule({
        boundaries: {
          ...defaultSolarBoundaries,
          evening: { event: "sunset", offsetMinutes: 99_999 },
        },
      }).boundaries.evening.offsetMinutes,
    ).toBe(360);
    expect(
      orderedBoundaryMinutes({
        morning: 800,
        day: 500,
        evening: 400,
        night: 300,
      }),
    ).toEqual({ morning: 800, day: 815, evening: 830, night: 845 });
    expect(offsetForBoundaryMinute(20 * 60, 21 * 60)).toBe(-60);
    const boundaries = { morning: 360, day: 660, evening: 1020, night: 1320 };
    expect(constrainBoundaryMinute("evening", 650, boundaries)).toBe(675);
    expect(constrainBoundaryMinute("evening", 1400, boundaries)).toBe(1305);
  });
});
