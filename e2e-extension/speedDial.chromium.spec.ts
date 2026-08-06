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
          favicons: {
            consent: "disabled",
            source: "direct",
            includeLocal: true,
            concurrency: 4,
            ttlDays: 30,
          },
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

    // Speed Dial persistence is intentionally batched for one second. Let the
    // drag-and-drop overlay flush before replacing this fixture's plugin data.
    await page.waitForTimeout(1_100);

    let uiIconRequests = 0;
    let manualIconRequests = 0;
    let calendarRequests = 0;
    const calendarDateParts = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const calendarPart = (type: Intl.DateTimeFormatPartTypes) =>
      calendarDateParts.find((part) => part.type === type)?.value ?? "";
    const calendarDay = `${calendarPart("year")}${calendarPart("month")}${calendarPart("day")}`;
    const calendarDate = new Date(
      Date.UTC(
        Number(calendarPart("year")),
        Number(calendarPart("month")) - 1,
        Number(calendarPart("day")) + 1,
      ),
    );
    const nextCalendarDay = `${calendarDate.getUTCFullYear()}${String(
      calendarDate.getUTCMonth() + 1,
    ).padStart(2, "0")}${String(calendarDate.getUTCDate()).padStart(2, "0")}`;
    const calendarBody = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "X-WR-CALNAME:E2E Calendar",
      "BEGIN:VEVENT",
      "UID:e2e-planning",
      `DTSTART;VALUE=DATE:${calendarDay}`,
      `DTEND;VALUE=DATE:${nextCalendarDay}`,
      "SUMMARY:E2E Planning",
      "LOCATION:Test Room",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const uiIconServer = createServer((request, response) => {
      if (request.url === "/favicon.ico") {
        uiIconRequests += 1;
        response.writeHead(200, { "content-type": "image/png" });
        response.end(icon);
        return;
      }
      if (request.url === "/manual.png") {
        manualIconRequests += 1;
        response.writeHead(200, { "content-type": "image/png" });
        response.end(icon);
        return;
      }
      if (request.url === "/calendar.ics") {
        calendarRequests += 1;
        response.writeHead(200, {
          "content-type": "text/calendar",
          etag: '"e2e-calendar-v1"',
        });
        response.end(calendarBody);
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Speed Dial icon fixture</title>");
    });
    await new Promise<void>((resolve) =>
      uiIconServer.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = uiIconServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Could not start the UI favicon fixture server");
      }
      const localUrl = `http://127.0.0.1:${address.port}/dashboard`;
      const localBookmarkId = await page.evaluate(async (url) => {
        const root = await chrome.bookmarks.create({
          title: "E2E Favicon Consent",
        });
        const bookmark = await chrome.bookmarks.create({
          parentId: root.id,
          title: "Local Dashboard",
          url,
        });
        await chrome.storage.sync.set({
          "tabliss/config/data/default-speed-dial": {
            rootBookmarkId: root.id,
            tileSize: 64,
            density: "comfortable",
            showLabels: true,
            maxLabelLength: 24,
            layout: { orderByFolder: {}, parentByItem: {} },
            favicons: {
              consent: "ask",
              source: "direct",
              includeLocal: true,
              concurrency: 2,
              ttlDays: 30,
            },
          },
        });
        return bookmark.id;
      }, localUrl);
      await page.setViewportSize({ width: 800, height: 720 });
      await page.reload();

      await expect(page.getByRole("dialog")).toContainText(
        "Fetch icons for 1 bookmark?",
      );
      await page.getByRole("button", { name: "Allow and fetch icons" }).click();
      await expect(page.locator(".SpeedDial__favicon")).toHaveCount(1);
      expect(uiIconRequests).toBe(1);

      const storedSource = () =>
        page.evaluate(
          (bookmarkId) =>
            new Promise<string | undefined>((resolve, reject) => {
              const open = indexedDB.open("fdial/assets", 1);
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const request = open.result
                  .transaction("favicons", "readonly")
                  .objectStore("favicons")
                  .get(bookmarkId);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result?.source);
              };
            }),
          localBookmarkId,
        );

      const editIcon = page.getByRole("button", {
        name: "Change icon for Local Dashboard",
      });
      await editIcon.click();
      await page.locator('input[type="file"]').setInputFiles({
        name: "custom.png",
        mimeType: "image/png",
        buffer: icon,
      });
      await expect.poll(storedSource).toBe("manual-upload");

      await editIcon.click();
      await page
        .getByRole("textbox", { name: "Image URL" })
        .fill(`http://127.0.0.1:${address.port}/manual.png`);
      await page.getByRole("button", { name: "Fetch this image" }).click();
      await expect.poll(storedSource).toBe("manual-url");
      expect(manualIconRequests).toBe(1);

      await editIcon.click();
      await page.getByRole("button", { name: "Reset icon" }).click();
      await expect.poll(storedSource).toBe("direct");
      expect(uiIconRequests).toBe(2);

      const calendarUrl = `http://127.0.0.1:${address.port}/calendar.ics`;
      await page.evaluate(async (feedUrl) => {
        await chrome.storage.local.set({
          "fdial/calendar/feeds": [
            {
              id: "e2e-calendar",
              kind: "ical",
              name: "E2E Calendar",
              url: feedUrl,
              colour: "#4f8cff",
              enabled: true,
              refreshMinutes: 30,
              timeZone: "Europe/Madrid",
            },
          ],
        });
      }, calendarUrl);
      await expect
        .poll(() =>
          page.evaluate(() =>
            chrome.runtime.sendMessage({
              type: "fdial/calendar/refresh-feed",
              feedId: "e2e-calendar",
              force: true,
            }),
          ),
        )
        .toEqual({
          ok: true,
          status: "calendar-ready",
          feedId: "e2e-calendar",
          eventCount: 1,
        });
      await expect(page.locator(".Agenda__event-title")).toHaveText(
        "E2E Planning",
      );
      expect(calendarRequests).toBe(1);

      await expect(
        page.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "fdial/calendar/refresh-feed",
            feedId: "e2e-calendar",
          }),
        ),
      ).resolves.toEqual({
        ok: true,
        status: "calendar-cached",
        feedId: "e2e-calendar",
        eventCount: 1,
      });
      expect(calendarRequests).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        uiIconServer.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
