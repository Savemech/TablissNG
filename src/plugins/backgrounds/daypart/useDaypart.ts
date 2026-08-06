import { useMemo } from "react";

import { db } from "../../../db/state";
import { useMinuteTime } from "../../../hooks";
import { useValue } from "../../../lib/db/react";
import { type DaypartRuntime, resolveDaypartRuntime } from "./runtime";
import type { Data } from "./types";

export function useDaypart(data: Data): DaypartRuntime {
  const time = useMinuteTime("absolute");
  const timeZone = useValue(db, "timeZone");
  return useMemo(
    () => resolveDaypartRuntime(time, data, timeZone),
    [data, time, timeZone],
  );
}
