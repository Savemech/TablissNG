import type { API } from "../../types";
import {
  type Daypart,
  type DaypartSchedule,
  defaultDaypartSchedule,
} from "./model";
import { defaultPresetByDaypart } from "./presets";

export type Data = {
  schedule: DaypartSchedule;
  presetByDaypart: Record<Daypart, string>;
};

export type Props = API<Data>;

export const defaultData: Data = {
  schedule: defaultDaypartSchedule,
  presetByDaypart: defaultPresetByDaypart,
};
