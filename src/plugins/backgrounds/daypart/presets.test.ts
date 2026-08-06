import { DAYPARTS } from "./model";
import {
  daypartPresets,
  defaultPresetByDaypart,
  presetsForDaypart,
  relativeLuminance,
  resolveDaypartPreset,
} from "./presets";

describe("daypart gallery presets", () => {
  test("has a valid default and three choices for every daypart", () => {
    for (const daypart of DAYPARTS) {
      expect(presetsForDaypart(daypart)).toHaveLength(3);
      expect(resolveDaypartPreset(daypart).id).toBe(
        defaultPresetByDaypart[daypart],
      );
    }
    expect(new Set(daypartPresets.map(({ id }) => id)).size).toBe(
      daypartPresets.length,
    );
  });

  test("keeps morning palettes free from red and orange dominant colours", () => {
    for (const preset of presetsForDaypart("morning")) {
      for (const colour of preset.colours) {
        const red = Number.parseInt(colour.slice(1, 3), 16);
        const green = Number.parseInt(colour.slice(3, 5), 16);
        const blue = Number.parseInt(colour.slice(5, 7), 16);
        expect(red > green * 1.2 && red > blue * 1.2).toBe(false);
      }
    }
  });

  test("computes WCAG relative luminance", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
  });
});
