export const MAX_LOCAL_FONTS = 20;
export const MAX_LOCAL_FONT_BYTES = 6 * 1024 * 1024;

const EXTENSION_MIME: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const ACCEPTED_MIME_TYPES = new Set([
  "font/woff2",
  "font/woff",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/x-font-ttf",
  "application/x-font-opentype",
]);

function extension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match?.[0] ?? "";
}

export function localFontFamily(id: string): string {
  return `fdial-local-${id.replaceAll(/[^a-z0-9_-]/gi, "")}`;
}

export function fontNameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return (normalized || "Local font").slice(0, 80);
}

export function fontMimeType(fileName: string, mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim();
  return ACCEPTED_MIME_TYPES.has(normalized)
    ? normalized
    : (EXTENSION_MIME[extension(fileName)] ?? "");
}

export function validateLocalFont(input: {
  name: string;
  type: string;
  size: number;
}): "invalid-type" | "too-large" | undefined {
  if (!fontMimeType(input.name, input.type)) return "invalid-type";
  if (!Number.isFinite(input.size) || input.size <= 0) return "invalid-type";
  if (input.size > MAX_LOCAL_FONT_BYTES) return "too-large";
  return undefined;
}
