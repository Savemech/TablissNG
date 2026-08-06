export type FontPreset = {
  id: "system" | "humanist" | "serif" | "mono" | "rounded" | "display";
  family: string;
};

export const fontPresets: readonly FontPreset[] = [
  {
    id: "system",
    family:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  { id: "humanist", family: 'Verdana, Geneva, "DejaVu Sans", sans-serif' },
  { id: "serif", family: 'Georgia, "Times New Roman", serif' },
  {
    id: "mono",
    family:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "rounded",
    family: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
  },
  { id: "display", family: "Impact, Haettenschweiler, sans-serif" },
] as const;
