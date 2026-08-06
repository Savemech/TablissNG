import type { API } from "../../types";
import { emptyLayout, type LayoutOverlay } from "./layout";

export type Density = "compact" | "comfortable" | "spacious";

export type Data = {
  rootBookmarkId: string | null;
  tileSize: number;
  density: Density;
  showLabels: boolean;
  maxLabelLength: number;
  layout: LayoutOverlay;
};

export type Props = API<Data>;

export const defaultData: Data = {
  rootBookmarkId: null,
  tileSize: 64,
  density: "comfortable",
  showLabels: true,
  maxLabelLength: 24,
  layout: emptyLayout(),
};
