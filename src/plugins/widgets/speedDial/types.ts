import type { AutomaticFaviconSource } from "../../../extension/favicon/types";
import type { API } from "../../types";
import { emptyLayout, type LayoutOverlay } from "./layout";
import {
  emptyPortableLayout,
  type PortableLayoutOverlay,
} from "./portableLayout";

export type Density = "compact" | "comfortable" | "spacious";

export type FaviconSettings = {
  consent: "ask" | "enabled" | "disabled";
  source: AutomaticFaviconSource;
  includeLocal: boolean;
  concurrency: number;
  ttlDays: number;
};

export type Data = {
  rootBookmarkId: string | null;
  tileSize: number;
  density: Density;
  showLabels: boolean;
  maxLabelLength: number;
  /** Legacy, profile-local bookmark ids. Migrated after the tree is loaded. */
  layout: LayoutOverlay;
  portableLayout?: PortableLayoutOverlay;
  favicons: FaviconSettings;
};

export type Props = API<Data>;

export const defaultData: Data = {
  rootBookmarkId: null,
  tileSize: 64,
  density: "comfortable",
  showLabels: true,
  maxLabelLength: 24,
  layout: emptyLayout(),
  portableLayout: emptyPortableLayout(),
  favicons: {
    consent: "ask",
    source: "direct",
    includeLocal: true,
    concurrency: 4,
    ttlDays: 30,
  },
};
