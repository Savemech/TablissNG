import path from "node:path";

import { expect, test } from "@playwright/test";

import { closeSettings, selectBackground } from "./helpers";

test.describe("Background", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("selects a solid colour background", async ({ page }) => {
    await selectBackground(page, "background/colour");
    await closeSettings(page);

    const colour = page.locator(".Background .Colour");
    await expect(colour).toBeVisible();
    // Each test gets a fresh context, so the widget is always at its default
    // colour (#3498db) — assert the exact value.
    await expect(colour).toHaveCSS("background-color", "rgb(52, 152, 219)");
  });

  test("selects a gradient background", async ({ page }) => {
    await selectBackground(page, "background/gradient");
    await closeSettings(page);

    const gradient = page.locator(".Background .Gradient");
    await expect(gradient).toBeVisible();
    await expect(gradient).toHaveCSS("background-image", /gradient/);
  });

  test("uses a custom image URL", async ({ page }) => {
    await selectBackground(page, "background/online");
    // A 1x1 PNG as a data URL needs no network.
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    await page.locator('label:has-text("Image URL") input').fill(dataUrl);
    // The URL input is debounced (1s) before it updates the background.
    await page.waitForTimeout(1200);
    await closeSettings(page);

    // CrossFade keeps two copies of the image during transitions — use .first().
    const image = page.locator(".Background .Online .image").first();
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("background-image", /data:image/);
  });

  test("uploads media from a file", async ({ page }) => {
    // Key is background/image for backwards compatibility.
    await selectBackground(page, "background/image");
    await page
      .locator(".MediaSettings input[type='file']")
      .setInputFiles(path.join(__dirname, "fixtures", "pixel.png"));
    await expect(page.locator(".media-count")).toContainText(
      "1 media uploaded",
    );
    await closeSettings(page);

    await expect(page.locator(".Background .Image")).toBeVisible();
  });

  test("keeps the Daypart timeline, controls and config in sync", async ({
    page,
  }) => {
    await selectBackground(page, "background/daypart");
    const settings = page.locator(".DaypartSettings");
    const morning = settings.locator("fieldset", { hasText: "Morning" });
    const morningInput = morning.locator('input[type="time"]');
    const morningHandle = settings.getByRole("slider", {
      name: /Morning.*Starts at/,
    });

    await expect(morningInput).toHaveValue("06:00");
    await morningInput.fill("08:15");
    await expect(morningHandle).toHaveAttribute("aria-valuetext", "08:15");

    const trackBounds = await settings
      .locator(".DaypartTimeline__track")
      .boundingBox();
    const handleBounds = await morningHandle.boundingBox();
    expect(trackBounds).not.toBeNull();
    expect(handleBounds).not.toBeNull();
    await page.mouse.move(
      handleBounds!.x + handleBounds!.width / 2,
      handleBounds!.y + handleBounds!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      trackBounds!.x + trackBounds!.width * (7.5 / 24),
      trackBounds!.y + trackBounds!.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();

    const draggedTime = await morningInput.inputValue();
    // Firefox rounds the fractional target x to a device pixel, which can
    // select the adjacent five-minute step on this narrow timeline.
    expect(draggedTime).toMatch(/^07:(25|30)$/);
    await expect(morningHandle).toHaveAttribute("aria-valuetext", draggedTime);
    await settings.locator("details").evaluate((details) => {
      (details as HTMLDetailsElement).open = true;
    });
    await expect(settings.locator("textarea[readonly]")).toHaveValue(
      new RegExp(`"morning": "${draggedTime}"`),
    );
  });

  test("builds a solar Daypart schedule from a selected city", async ({
    page,
  }) => {
    await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              id: 2988507,
              name: "Paris",
              country: "France",
              latitude: 48.8566,
              longitude: 2.3522,
              timezone: "Europe/Paris",
            },
          ],
        }),
      }),
    );
    await selectBackground(page, "background/daypart");
    const settings = page.locator(".DaypartSettings");

    await settings.getByText("Follow the sun", { exact: true }).click();
    await settings.locator("#DaypartSettings__city").fill("Paris");
    await settings.locator("#DaypartSettings__city").press("Enter");
    await settings
      .locator(".DaypartSettings__location-results button", {
        hasText: "Paris, France",
      })
      .click();

    await expect(
      settings.locator(".DaypartSettings__solar-state--ready"),
    ).toContainText("Paris, France");
    await expect(
      settings.locator(".DaypartTimeline__solar-legend", {
        hasText: "Sunset",
      }),
    ).toBeVisible();
    const evening = settings.locator("fieldset", { hasText: "Evening" });
    await expect(evening.locator('input[type="number"]')).toHaveValue("-60");
    await expect(evening.locator("output strong")).toHaveText(/^\d{2}:\d{2}$/);

    await settings.locator("details").evaluate((details) => {
      (details as HTMLDetailsElement).open = true;
    });
    const config = settings.locator("textarea[readonly]");
    await expect(config).toHaveValue(/"scheduleMode": "solar"/);
    await expect(config).toHaveValue(/"event": "sunset"/);
    await expect(config).toHaveValue(/"offsetMinutes": -60/);
    await expect(config).toHaveValue(/"timeZone": "Europe\/Paris"/);
  });
});
