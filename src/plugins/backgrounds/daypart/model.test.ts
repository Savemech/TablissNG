import {
  daypartAtMinutes,
  defaultDaypartSchedule,
  normaliseDaypartSchedule,
  timeToMinutes,
} from "./model";

describe("daypart schedule", () => {
  test("uses the requested morning, day, evening and night boundaries", () => {
    expect(daypartAtMinutes(5 * 60 + 59, defaultDaypartSchedule)).toBe("night");
    expect(daypartAtMinutes(6 * 60, defaultDaypartSchedule)).toBe("morning");
    expect(daypartAtMinutes(10 * 60 + 59, defaultDaypartSchedule)).toBe(
      "morning",
    );
    expect(daypartAtMinutes(11 * 60, defaultDaypartSchedule)).toBe("day");
    expect(daypartAtMinutes(17 * 60, defaultDaypartSchedule)).toBe("evening");
    expect(daypartAtMinutes(22 * 60, defaultDaypartSchedule)).toBe("night");
  });

  test("wraps before the earliest configured boundary", () => {
    expect(
      daypartAtMinutes(30, {
        morning: "07:00",
        day: "12:00",
        evening: "18:00",
        night: "23:00",
      }),
    ).toBe("night");
  });

  test("falls back from malformed settings", () => {
    expect(timeToMinutes("24:00")).toBeUndefined();
    expect(timeToMinutes("9:30")).toBeUndefined();
    expect(normaliseDaypartSchedule({ morning: "not-a-time" }).morning).toBe(
      "06:00",
    );
  });
});
