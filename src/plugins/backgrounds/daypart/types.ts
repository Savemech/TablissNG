import type { API } from "../../types";
import {
  type Daypart,
  type DaypartSchedule,
  defaultDaypartSchedule,
} from "./model";
import { defaultPresetByDaypart } from "./presets";
import {
  defaultSolarSchedule,
  type ScheduleMode,
  type SolarScheduleConfig,
} from "./solarSchedule";

export type Data = {
  scheduleMode?: ScheduleMode;
  schedule: DaypartSchedule;
  solar?: SolarScheduleConfig;
  presetByDaypart: Record<Daypart, string>;
};

export type Props = API<Data>;

export const defaultData: Data = {
  scheduleMode: "clock",
  schedule: defaultDaypartSchedule,
  solar: defaultSolarSchedule,
  presetByDaypart: defaultPresetByDaypart,
};
