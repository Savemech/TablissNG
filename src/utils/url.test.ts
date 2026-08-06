import { isSpecialUrl, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  test("preserves explicit schemes", () => {
    expect(normalizeUrl("  https://example.com/path  ")).toBe(
      "https://example.com/path",
    );
    expect(normalizeUrl("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
  });

  test("adds https to domains with a known TLD", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
  });

  test("leaves local hostnames unchanged", () => {
    expect(normalizeUrl("pve")).toBe("pve");
  });
});

describe("isSpecialUrl", () => {
  test("recognises browser and extension URLs", () => {
    expect(isSpecialUrl("about:config")).toBe(true);
    expect(isSpecialUrl("moz-extension://example/index.html")).toBe(true);
  });

  test("does not classify HTTP URLs as special", () => {
    expect(isSpecialUrl("https://example.com")).toBe(false);
  });
});
