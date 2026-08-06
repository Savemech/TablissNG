import {
  fontMimeType,
  fontNameFromFileName,
  localFontFamily,
  MAX_LOCAL_FONT_BYTES,
  validateLocalFont,
} from "./model";

describe("local font model", () => {
  test("accepts modern font formats even when the browser omits MIME type", () => {
    expect(fontMimeType("Example.woff2", "")).toBe("font/woff2");
    expect(
      validateLocalFont({ name: "Example.otf", type: "", size: 1024 }),
    ).toBeUndefined();
  });

  test("rejects unrelated and oversized files", () => {
    expect(
      validateLocalFont({ name: "payload.html", type: "text/html", size: 12 }),
    ).toBe("invalid-type");
    expect(
      validateLocalFont({
        name: "huge.woff2",
        type: "font/woff2",
        size: MAX_LOCAL_FONT_BYTES + 1,
      }),
    ).toBe("too-large");
  });

  test("creates safe CSS family and readable display names", () => {
    expect(localFontFamily("abc/><123")).toBe("fdial-local-abc123");
    expect(fontNameFromFileName("JetBrains_Mono-Bold.woff2")).toBe(
      "JetBrains Mono Bold",
    );
  });
});
