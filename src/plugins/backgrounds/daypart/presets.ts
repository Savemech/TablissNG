import { relativeLuminance } from "../../../backgroundAppearance";
import type { Daypart } from "./model";

export { relativeLuminance } from "../../../backgroundAppearance";

export type DaypartPreset = {
  id: string;
  daypart: Daypart;
  colours: readonly [string, string, string];
  backgroundImage: string;
  luminance: number;
};

function preset(
  id: string,
  daypart: Daypart,
  colours: readonly [string, string, string],
): DaypartPreset {
  const [highlight, middle, base] = colours;
  return {
    id,
    daypart,
    colours,
    backgroundImage: [
      `radial-gradient(circle at 18% 12%, ${highlight} 0%, transparent 42%)`,
      `radial-gradient(circle at 82% 78%, ${middle} 0%, transparent 48%)`,
      `linear-gradient(135deg, ${middle}, ${base})`,
    ].join(", "),
    luminance:
      relativeLuminance(highlight) * 0.25 +
      relativeLuminance(middle) * 0.4 +
      relativeLuminance(base) * 0.35,
  };
}

export const daypartPresets: readonly DaypartPreset[] = [
  preset("arctic-mint", "morning", ["#ecfff9", "#5eead4", "#1877c9"]),
  preset("bluebell", "morning", ["#e0f7ff", "#75c9ff", "#3974d8"]),
  preset("spring-sky", "morning", ["#f1ffd8", "#6ee7b7", "#38bdf8"]),
  preset("clear-sky", "day", ["#effaff", "#38bdf8", "#2563eb"]),
  preset("alpine", "day", ["#ecfccb", "#34d399", "#0e7490"]),
  preset("electric-lagoon", "day", ["#dbeafe", "#22d3ee", "#4f46e5"]),
  preset("ember", "evening", ["#ffedb5", "#ff7b54", "#c81d4f"]),
  preset("solar-flare", "evening", ["#ffd166", "#f97316", "#b91c1c"]),
  preset("coral-dusk", "evening", ["#ffe0d2", "#fb7185", "#9f1239"]),
  preset("midnight", "night", ["#172554", "#0f172a", "#020617"]),
  preset("aurora", "night", ["#164e63", "#134e4a", "#312e81"]),
  preset("deep-violet", "night", ["#312e81", "#4c1d95", "#0f172a"]),
] as const;

export const defaultPresetByDaypart: Record<Daypart, string> = {
  morning: "arctic-mint",
  day: "clear-sky",
  evening: "ember",
  night: "midnight",
};

export function presetsForDaypart(daypart: Daypart): DaypartPreset[] {
  return daypartPresets.filter((candidate) => candidate.daypart === daypart);
}

export function resolveDaypartPreset(
  daypart: Daypart,
  id?: string,
): DaypartPreset {
  return (
    daypartPresets.find(
      (candidate) => candidate.daypart === daypart && candidate.id === id,
    ) ??
    daypartPresets.find(
      (candidate) =>
        candidate.daypart === daypart &&
        candidate.id === defaultPresetByDaypart[daypart],
    )!
  );
}
