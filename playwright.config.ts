import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PWFLEET_E2E_BASE_URL;
const storageState = process.env.PWFLEET_E2E_STORAGE_STATE;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    ...(storageState ? { storageState } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: "pnpm dev",
    // Warm the first interactive page before parallel browser projects begin.
    url: "http://localhost:3000/vehicles",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stderr: "pipe",
  },
});
