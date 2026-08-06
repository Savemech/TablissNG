import { useMinuteTime } from "../../../hooks";
import { type Daypart, daypartAtMinutes, type DaypartSchedule } from "./model";

export function useDaypart(schedule?: Partial<DaypartSchedule>): Daypart {
  const time = useMinuteTime();
  return daypartAtMinutes(time.getHours() * 60 + time.getMinutes(), schedule);
}
