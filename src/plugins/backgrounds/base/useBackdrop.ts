import { db } from "../../../db/state";
import { useIsNight } from "../../../hooks";
import { useValue } from "../../../lib/db/react";
import {
  computeBackdropPresentation,
  type ComputedBackdropPresentation,
} from "./backdropModel";

type BackdropPresentation = ComputedBackdropPresentation & {
  owner: string;
};

export function useBackdropPresentation(
  sourceLuminance = 0.5,
): BackdropPresentation {
  const focus = useValue(db, "focus");
  const background = useValue(db, "background");
  const isNight = useIsNight();
  return {
    ...computeBackdropPresentation(
      background.display,
      focus,
      isNight,
      sourceLuminance,
    ),
    owner: background.id,
  };
}
