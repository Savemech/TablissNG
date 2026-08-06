import { defineMessages } from "react-intl";

import type { Config } from "../../types";
import Agenda from "./Agenda";
import AgendaSettings from "./AgendaSettings";
import { defaultData } from "./types";

const messages = defineMessages({
  name: {
    id: "plugins.agenda.name",
    defaultMessage: "Today's agenda",
    description: "Name of the calendar agenda widget",
  },
  description: {
    id: "plugins.agenda.description",
    defaultMessage:
      "Cached, timezone-aware events from iCal and Google Calendar.",
    description: "Description of the calendar agenda widget",
  },
});

const config: Config = {
  key: "widget/agenda",
  name: messages.name,
  description: messages.description,
  dashboardComponent: Agenda,
  settingsComponent: AgendaSettings,
  defaultData,
};

export default config;
