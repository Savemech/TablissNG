import { toZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useState } from "react";

import { db } from "../db/state";
import { useValue } from "../lib/db/react";

const MINUTE_MS = 60_000;

export function millisecondsUntilNextMinute(timestamp: number): number {
  return MINUTE_MS - (timestamp % MINUTE_MS);
}

export function useMinuteTime(type: "absolute" | "zoned" = "zoned"): Date {
  const timeZone = useValue(db, "timeZone");
  const [timestamp, setTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setTimestamp(Date.now());
        interval = setInterval(() => setTimestamp(Date.now()), MINUTE_MS);
      },
      millisecondsUntilNextMinute(Date.now()) + 10,
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return useMemo(() => {
    const absolute = new Date(timestamp);
    return type === "zoned" && timeZone
      ? toZonedTime(absolute, timeZone)
      : absolute;
  }, [timeZone, timestamp, type]);
}
