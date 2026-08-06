import { permissionRequestWithDataConsent } from "./dataConsent";

describe("Firefox data collection consent", () => {
  test("combines data and host permissions into one Firefox request", () => {
    expect(
      permissionRequestWithDataConsent(
        "firefox",
        { origins: ["https://example.com/*"] },
        ["authenticationInfo", "authenticationInfo", "bookmarksInfo"],
      ),
    ).toEqual({
      origins: ["https://example.com/*"],
      data_collection: ["authenticationInfo", "bookmarksInfo"],
    });
  });

  test("does not leak Firefox-only fields into Chromium", () => {
    const request = { origins: ["https://example.com/*"] };
    expect(
      permissionRequestWithDataConsent("chromium", request, [
        "authenticationInfo",
      ]),
    ).toBe(request);
  });
});
