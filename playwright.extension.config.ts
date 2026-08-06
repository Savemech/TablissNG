import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-extension",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? "line" : "list",
});
