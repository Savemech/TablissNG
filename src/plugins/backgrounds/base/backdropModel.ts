import type { CSSProperties } from "react";

import { compositeLuminance } from "../../../backgroundAppearance";
import type { BackgroundDisplay } from "../../../db/state";

export type ComputedBackdropPresentation = {
  backdropStyle: CSSProperties;
  baseColor: "black" | "white";
  effectiveLuminance: number;
};

function clampLuminosity(value: number): number {
  return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
}

export function computeBackdropPresentation(
  display: BackgroundDisplay,
  focus: boolean,
  isNight: boolean,
  sourceLuminance = 0.5,
): ComputedBackdropPresentation {
  const { blur, nightDim, scale = true, position } = display;
  const luminosity = clampLuminosity(display.luminosity ?? 0);
  const baseLuminance = luminosity > 0 ? 1 : 0;
  const opacity = focus
    ? 1
    : nightDim && isNight
      ? (luminosity + 1) / 2
      : 1 - Math.abs(luminosity);
  const backdropStyle: CSSProperties = { opacity };

  if (blur && !focus) {
    backdropStyle.filter = `blur(${blur}px)`;
    backdropStyle.transform = `scale(${blur / 500 + 1})`;
  }
  if (scale) {
    backdropStyle.backgroundSize = "cover";
  } else {
    backdropStyle.backgroundSize = "contain";
    backdropStyle.backgroundRepeat = "no-repeat";
  }
  if (position) backdropStyle.backgroundPosition = position;

  return {
    backdropStyle,
    baseColor: luminosity > 0 ? "white" : "black",
    effectiveLuminance: compositeLuminance(
      sourceLuminance,
      baseLuminance,
      opacity,
    ),
  };
}
