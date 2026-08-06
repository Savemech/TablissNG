import { exportStore, importStore, validateStoreDump } from "../db/action";
import {
  announceFaviconLibraryChange,
  clearManualFavicons,
  clearPortableFavicons,
  listPortableFavicons,
  putPortableFavicon,
} from "../extension/favicon/store";
import type { PortableFaviconAsset } from "../extension/favicon/types";
import { localFontFamily, validateLocalFont } from "../fonts/model";
import {
  clearLocalFonts,
  importLocalFont,
  listLocalFonts,
} from "../fonts/store";
import type { LocalFontRecord } from "../fonts/types";
import { base64ToBlob, blobToBase64 } from "../lib/blob";

const BACKUP_FORMAT = "fdial-portable-backup";
const BACKUP_VERSION = 1 as const;
const MAX_FAVICON_BYTES = 512 * 1024;
const MAX_FAVICONS = 256;
const MAX_FONTS = 20;
export const MAX_BACKUP_FILE_BYTES = 192 * 1024 * 1024;

type SerialisedBlob = {
  mimeType: string;
  data: string;
};

type SerialisedFavicon = Omit<PortableFaviconAsset, "blob"> & {
  blob: SerialisedBlob;
};

type SerialisedFont = Omit<LocalFontRecord, "blob"> & {
  blob: SerialisedBlob;
};

type PortableBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  settings: unknown;
  assets: {
    favicons: SerialisedFavicon[];
    fonts: SerialisedFont[];
  };
};

export type BackupImportResult = {
  kind: "portable" | "settings";
  favicons: number;
  fonts: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new TypeError(`Invalid backup field: ${key}`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new TypeError(`Invalid backup field: ${key}`);
  }
  return value;
}

function finiteNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid backup field: ${key}`);
  }
  return value;
}

function decodeBlob(
  value: unknown,
  maxBytes: number,
  acceptedMime: (mimeType: string) => boolean,
): Blob {
  if (!isRecord(value)) throw new TypeError("Invalid backup blob");
  const mimeType = requiredString(value, "mimeType", 100);
  const data = requiredString(value, "data", Math.ceil((maxBytes * 4) / 3) + 8);
  if (!acceptedMime(mimeType)) throw new TypeError("Invalid backup MIME type");
  let blob: Blob;
  try {
    blob = base64ToBlob(data, mimeType);
  } catch {
    throw new TypeError("Invalid backup base64 data");
  }
  if (!blob.size || blob.size > maxBytes) {
    throw new TypeError("Backup asset is too large");
  }
  return blob;
}

function decodeFavicon(
  value: unknown,
  restoredAt: number,
): PortableFaviconAsset {
  if (!isRecord(value)) throw new TypeError("Invalid favicon backup record");
  const portableKey = requiredString(value, "portableKey", 80);
  if (!/^(?:root|p[0-9a-z]+\.[0-9a-z]+)$/.test(portableKey)) {
    throw new TypeError("Invalid portable favicon key");
  }
  const source = requiredString(value, "source", 20);
  if (source !== "manual-url" && source !== "manual-upload") {
    throw new TypeError("Invalid favicon source");
  }
  return {
    portableKey,
    pageUrl: requiredString(value, "pageUrl", 8_192),
    source,
    sourceUrl: optionalString(value, "sourceUrl", 8_192),
    blob: decodeBlob(
      value.blob,
      MAX_FAVICON_BYTES,
      (mimeType) =>
        mimeType.startsWith("image/") ||
        mimeType === "application/octet-stream",
    ),
    // An explicit restore wins over stale sync state and is republished by
    // the Speed Dial reconciliation layer.
    updatedAt: restoredAt,
  };
}

function decodeFont(value: unknown): LocalFontRecord {
  if (!isRecord(value)) throw new TypeError("Invalid font backup record");
  const id = requiredString(value, "id", 32);
  const family = requiredString(value, "family", 64);
  const fileName = requiredString(value, "fileName", 160);
  const mimeType = requiredString(value, "mimeType", 100);
  if (!/^[a-z0-9]{3,32}$/.test(id) || family !== localFontFamily(id)) {
    throw new TypeError("Invalid local font id");
  }
  const blob = decodeBlob(
    value.blob,
    6 * 1024 * 1024,
    (type) => type.startsWith("font/") || type.startsWith("application/"),
  );
  if (validateLocalFont({ name: fileName, type: mimeType, size: blob.size })) {
    throw new TypeError("Invalid local font file");
  }
  return {
    id,
    family,
    name: requiredString(value, "name", 100),
    fileName,
    mimeType,
    blob,
    createdAt: finiteNumber(value, "createdAt"),
  };
}

function decodeBackup(value: unknown): {
  settings: unknown;
  favicons: PortableFaviconAsset[];
  fonts: LocalFontRecord[];
} {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new TypeError("Not a portable backup");
  }
  if (value.version !== BACKUP_VERSION) {
    throw new TypeError("Backup was created by a newer extension version");
  }
  if (!isRecord(value.assets)) throw new TypeError("Invalid backup assets");
  const favicons = value.assets.favicons;
  const fonts = value.assets.fonts;
  if (!Array.isArray(favicons) || favicons.length > MAX_FAVICONS) {
    throw new TypeError("Too many favicon assets");
  }
  if (!Array.isArray(fonts) || fonts.length > MAX_FONTS) {
    throw new TypeError("Too many font assets");
  }
  validateStoreDump(value.settings);
  const restoredAt = Date.now();
  const decodedFavicons = favicons.map((asset, index) =>
    decodeFavicon(asset, restoredAt + index),
  );
  if (
    new Set(decodedFavicons.map(({ portableKey }) => portableKey)).size !==
    decodedFavicons.length
  ) {
    throw new TypeError("Duplicate favicon assets");
  }
  const decodedFonts = fonts.map(decodeFont);
  if (new Set(decodedFonts.map(({ id }) => id)).size !== decodedFonts.length) {
    throw new TypeError("Duplicate font assets");
  }
  return {
    settings: value.settings,
    favicons: decodedFavicons,
    fonts: decodedFonts,
  };
}

async function serialiseBlob(blob: Blob): Promise<SerialisedBlob> {
  return {
    mimeType: blob.type || "application/octet-stream",
    data: await blobToBase64(blob),
  };
}

export async function exportPortableBackup(): Promise<string> {
  const [favicons, fonts] = await Promise.all([
    listPortableFavicons(),
    listLocalFonts(),
  ]);
  const backup: PortableBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    settings: JSON.parse(exportStore()) as unknown,
    assets: {
      favicons: await Promise.all(
        favicons.map(async ({ blob, ...asset }) => ({
          ...asset,
          blob: await serialiseBlob(blob),
        })),
      ),
      fonts: await Promise.all(
        fonts.map(async ({ blob, ...font }) => ({
          ...font,
          blob: await serialiseBlob(blob),
        })),
      ),
    },
  };
  return JSON.stringify(backup);
}

export async function importPortableBackup(
  value: unknown,
): Promise<BackupImportResult> {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    importStore(value);
    return { kind: "settings", favicons: 0, fonts: 0 };
  }

  // Decode and validate every byte before clearing any live data.
  const decoded = decodeBackup(value);
  await Promise.all([
    clearManualFavicons(),
    clearPortableFavicons(),
    clearLocalFonts(),
  ]);
  for (const asset of decoded.favicons) await putPortableFavicon(asset);
  for (const font of decoded.fonts) await importLocalFont(font);
  importStore(decoded.settings);
  announceFaviconLibraryChange();
  return {
    kind: "portable",
    favicons: decoded.favicons.length,
    fonts: decoded.fonts.length,
  };
}
