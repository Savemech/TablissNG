import type Browser from "webextension-polyfill";

export type DataCollectionPermission =
  Browser.Manifest.OptionalDataCollectionPermission;

type BuildTarget = "chromium" | "firefox" | "web" | "safari";

/**
 * Add Firefox's data-collection consent to an existing optional-permission
 * request. Other targets receive the original WebExtension request unchanged.
 */
export function permissionRequestWithDataConsent(
  target: BuildTarget,
  request: Browser.Permissions.Permissions,
  dataCollection: readonly DataCollectionPermission[],
): Browser.Permissions.Permissions {
  if (target !== "firefox" || dataCollection.length === 0) return request;
  return {
    ...request,
    data_collection: [...new Set(dataCollection)],
  };
}

/** Keep host/API and Firefox data consent in one atomic browser prompt. */
export function requestOptionalPermissions(
  request: Browser.Permissions.Permissions,
  dataCollection: readonly DataCollectionPermission[] = [],
): Promise<boolean> {
  return browser.permissions.request(
    permissionRequestWithDataConsent(BUILD_TARGET, request, dataCollection),
  );
}

/** Request only a Firefox data permission; other targets need no equivalent. */
export function requestDataCollectionPermissions(
  dataCollection: readonly DataCollectionPermission[],
): Promise<boolean> {
  if (BUILD_TARGET !== "firefox" || dataCollection.length === 0) {
    return Promise.resolve(true);
  }
  return requestOptionalPermissions({}, dataCollection);
}

/**
 * Network jobs use this fail-closed check so imported settings cannot bypass a
 * consent decision made in Firefox's extension manager.
 */
export async function hasDataCollectionPermissions(
  dataCollection: readonly DataCollectionPermission[],
): Promise<boolean> {
  if (BUILD_TARGET !== "firefox" || dataCollection.length === 0) return true;
  const granted = new Set((await browser.permissions.getAll()).data_collection);
  return dataCollection.every((permission) => granted.has(permission));
}
