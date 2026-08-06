import { defineMessages } from "react-intl";

import type { Config } from "../../types";
import SpeedDial from "./SpeedDial";
import SpeedDialSettings from "./SpeedDialSettings";
import { defaultData } from "./types";

const messages = defineMessages({
  name: {
    id: "plugins.speedDial.name",
    defaultMessage: "Speed Dial",
    description: "Name of the Speed Dial widget",
  },
  description: {
    id: "plugins.speedDial.description",
    defaultMessage: "A responsive, reorderable grid of browser bookmarks.",
    description: "Description of the Speed Dial widget",
  },
});

const config: Config = {
  key: "widget/speedDial",
  name: messages.name,
  description: messages.description,
  dashboardComponent: SpeedDial,
  settingsComponent: SpeedDialSettings,
  defaultData,
};

export default config;
