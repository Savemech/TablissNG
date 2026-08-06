import { defineMessages } from "react-intl";

import type { Config } from "../../types";
import Daypart from "./Daypart";
import DaypartSettings from "./DaypartSettings";
import { defaultData } from "./types";

const messages = defineMessages({
  name: {
    id: "backgrounds.daypart.name",
    defaultMessage: "Daypart Gallery",
    description: "Name of the time-aware daypart background",
  },
  description: {
    id: "backgrounds.daypart.description",
    defaultMessage: "Offline palettes that change with the time of day.",
    description: "Description of the time-aware daypart background",
  },
});

const config: Config = {
  key: "background/daypart",
  name: messages.name,
  description: messages.description,
  dashboardComponent: Daypart,
  settingsComponent: DaypartSettings,
  defaultData,
};

export default config;
