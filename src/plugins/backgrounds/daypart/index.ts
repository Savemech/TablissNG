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
    defaultMessage:
      "Offline palettes that follow the clock or your city's sun.",
    description: "Description of the time-aware daypart background",
  },
});

const config: Config = {
  key: "background/daypart",
  name: messages.name,
  description: messages.description,
  dashboardComponent: Daypart,
  settingsComponent: DaypartSettings,
  supportsBackdrop: true,
  defaultData,
};

export default config;
