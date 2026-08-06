export type AutomaticFaviconSource = "direct" | "google" | "duckduckgo";
export type FaviconSource =
  AutomaticFaviconSource | "manual-url" | "manual-upload";

export type FaviconRecord = {
  bookmarkId: string;
  pageUrl: string;
  source: FaviconSource;
  sourceUrl?: string;
  status: "ready" | "missing";
  blob?: Blob;
  fetchedAt: number;
  expiresAt?: number;
  error?: string;
};

export type FaviconStoreStats = {
  entries: number;
  ready: number;
  bytes: number;
};
