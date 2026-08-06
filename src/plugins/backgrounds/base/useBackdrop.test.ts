import { computeBackdropPresentation } from "./backdropModel";

describe("background backdrop presentation", () => {
  test("composites a darkened image over black", () => {
    const result = computeBackdropPresentation(
      { luminosity: -0.2, scale: true },
      false,
      false,
      0.5,
    );
    expect(result.baseColor).toBe("black");
    expect(result.backdropStyle.opacity).toBeCloseTo(0.8);
    expect(result.effectiveLuminance).toBeCloseTo(0.4);
  });

  test("composites a brightened image over white", () => {
    const result = computeBackdropPresentation(
      { luminosity: 0.4 },
      false,
      false,
      0.2,
    );
    expect(result.baseColor).toBe("white");
    expect(result.effectiveLuminance).toBeCloseTo(0.52);
  });

  test("keeps the source appearance while focus mode is active", () => {
    const result = computeBackdropPresentation(
      { luminosity: -0.8, blur: 20 },
      true,
      true,
      0.63,
    );
    expect(result.backdropStyle.opacity).toBe(1);
    expect(result.backdropStyle.filter).toBeUndefined();
    expect(result.effectiveLuminance).toBeCloseTo(0.63);
  });
});
