import {
  compositeLuminance,
  contrastForLuminance,
  relativeLuminance,
} from "./backgroundAppearance";

describe("background appearance", () => {
  test("computes WCAG luminance for hex colours", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(relativeLuminance("invalid")).toBe(0);
  });

  test("composites a translucent surface over its backing colour", () => {
    expect(compositeLuminance(0.6, 0, 0.5)).toBeCloseTo(0.3);
    expect(compositeLuminance(0.2, 1, 0.25)).toBeCloseTo(0.8);
  });

  test("uses black-on-white for bright backgrounds and white-on-black for dark ones", () => {
    expect(contrastForLuminance(0.8)).toMatchObject({ text: "#101827" });
    expect(contrastForLuminance(0.1)).toMatchObject({ text: "#f8fafc" });
  });
});
