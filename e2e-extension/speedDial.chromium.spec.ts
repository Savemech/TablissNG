import { createServer } from "node:http";
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

    await expect
      .poll(() =>
        page.evaluate(() =>
          chrome.runtime.sendMessage({ type: "fdial/background/health" }),
        ),
      )
      .toEqual({ ok: true, status: "healthy" });

    let iconRequests = 0;
    const icon = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlS8AAAAASUVORK5CYII=",
      "base64",
    );
    const iconServer = createServer((request, response) => {
      if (request.url === "/favicon.ico") {
        iconRequests += 1;
        response.writeHead(200, { "content-type": "image/png" });
        response.end(icon);
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Local service</title>");
    });
    await new Promise<void>((resolve) =>
      iconServer.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = iconServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Could not start the favicon fixture server");
      }
      const faviconRequest = {
        type: "fdial/favicon/fetch",
        bookmarkId: "e2e-favicon",
        pageUrl: `http://127.0.0.1:${address.port}/dashboard`,
        source: "direct",
        ttlDays: 30,
      };
      await expect
        .poll(() =>
          page.evaluate(
            (message) => chrome.runtime.sendMessage(message),
            faviconRequest,
          ),
        )
        .toEqual({ ok: true, status: "ready" });
      expect(iconRequests).toBe(1);

      await expect(
        page.evaluate(
          (message) => chrome.runtime.sendMessage(message),
          faviconRequest,
        ),
      ).resolves.toEqual({ ok: true, status: "cached" });
      expect(iconRequests).toBe(1);

      const cachedIcon = await page.evaluate(
        (bookmarkId) =>
          new Promise<{ size: number; status: string }>((resolve, reject) => {
            const open = indexedDB.open("fdial/assets", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const request = open.result
                .transaction("favicons", "readonly")
                .objectStore("favicons")
                .get(bookmarkId);
              request.onerror = () => reject(request.error);
              request.onsuccess = () =>
                resolve({
                  size: request.result.blob.size,
                  status: request.result.status,
                });
            };
          }),
        faviconRequest.bookmarkId,
      );
      expect(cachedIcon).toEqual({ size: icon.length, status: "ready" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        iconServer.close((error) => (error ? reject(error) : resolve())),
      );
    }

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
