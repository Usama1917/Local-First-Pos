import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/mobile",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:18881", channel: process.env.MOBILE_CHROMIUM_CHANNEL, actionTimeout: 10_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "small-phone", use: { browserName: "chromium", viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "landscape", use: { browserName: "chromium", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: "node tests/mobile/server.mjs",
    url: "http://127.0.0.1:18881/api/healthz",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
