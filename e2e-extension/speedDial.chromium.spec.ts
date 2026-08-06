import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

test("Speed Dial works in the installed Chromium extension", async () => {
  const extensionPath = path.resolve("dist/chromium");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1200, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/index.html`);

    await page.evaluate(async () => {
      const root = await chrome.bookmarks.create({ title: "E2E Speed Dial" });
      await chrome.bookmarks.create({
        parentId: root.id,
        title: "Alpha",
        url: "https://alpha.example/",
      });
      const folder = await chrome.bookmarks.create({
        parentId: root.id,
        title: "Folder",
      });
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: "Beta",
        url: "https://beta.example/",
      });
      await chrome.bookmarks.create({
        parentId: root.id,
        title: "Gamma",
        url: "https://gamma.example/",
      });

      await chrome.storage.sync.set({
        "tabliss/config/data/default-speed-dial": {
          rootBookmarkId: root.id,
          tileSize: 64,
          density: "comfortable",
          showLabels: true,
          maxLabelLength: 24,
          layout: { orderByFolder: {}, parentByItem: {} },
        },
      });
    });
    await page.reload();

    const labels = page.locator(".SpeedDial__label");
    await expect(labels).toHaveText(["Alpha", "Folder", "Gamma"]);
    await expect(page.locator(".SpeedDial__icon").first()).toHaveCSS(
      "width",
      "64px",
    );

    const tile = (name: string) =>
      page.locator(".SpeedDial__tile", { hasText: name });

    await tile("Gamma").dragTo(tile("Alpha"));
    await expect(labels).toHaveText(["Gamma", "Alpha", "Folder"]);

    await tile("Alpha").dragTo(tile("Folder"));
    await expect(labels).toHaveText(["Gamma", "Folder"]);
    await tile("Folder").getByRole("button").click();
    await expect(labels).toHaveText(["Beta", "Alpha"]);

    await page.setViewportSize({ width: 320, height: 720 });
    const overflow = await page.locator(".SpeedDial").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
