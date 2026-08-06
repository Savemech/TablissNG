import type { API } from "../../types";

export type Data = {
  timeZone: string;
  maxEvents: number;
  showLocation: boolean;
  hidePast: boolean;
};

export type Props = API<Data>;

export const defaultData: Data = {
  timeZone: "Europe/Madrid",
  maxEvents: 8,
  showLocation: true,
  hidePast: false,
};
