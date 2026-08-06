import { useLayoutEffect, useSyncExternalStore } from "react";

export type BackgroundAppearance = {
  luminance: number;
};

export type BackgroundContrast = {
  text: string;
  outline: string;
  shadow: string;
};

const DEFAULT_APPEARANCE: BackgroundAppearance = Object.freeze({
  luminance: 0.25,
});

let appearance = DEFAULT_APPEARANCE;
let activeOwner: string | undefined;
const listeners = new Set<() => void>();

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function emit(next: BackgroundAppearance): void {
  if (appearance.luminance === next.luminance) return;
  appearance = next;
  for (const listener of listeners) listener();
}

function publish(owner: string, luminance: number): () => void {
  activeOwner = owner;
  emit({ luminance: clamp(luminance) });
  return () => {
    if (activeOwner !== owner) return;
    activeOwner = undefined;
    emit(DEFAULT_APPEARANCE);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): BackgroundAppearance {
  return appearance;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function compositeLuminance(
  foreground: number,
  background: number,
  opacity: number,
): number {
  const alpha = clamp(opacity);
  return clamp(foreground) * alpha + clamp(background) * (1 - alpha);
}

export function contrastForLuminance(luminance: number): BackgroundContrast {
  if (clamp(luminance) > 0.42) {
    const outline = "rgba(255, 255, 255, 0.92)";
    return {
      text: "#101827",
      outline,
      shadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}, 0 2px 7px rgba(255, 255, 255, 0.55)`,
    };
  }
  const outline = "rgba(0, 0, 0, 0.9)";
  return {
    text: "#f8fafc",
    outline,
    shadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}, 0 2px 7px rgba(0, 0, 0, 0.65)`,
  };
}

export function usePublishBackgroundAppearance(
  owner: string,
  luminance: number,
): void {
  useLayoutEffect(() => publish(owner, luminance), [luminance, owner]);
}

export function useBackgroundAppearance(): BackgroundAppearance {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
