import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:6006",
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 120,
    },
  },
  webServer: {
    command: "npm run storybook -- --host 127.0.0.1",
    url: "http://127.0.0.1:6006/iframe.html?id=tasks-edittaskmodal--default&viewMode=story",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
