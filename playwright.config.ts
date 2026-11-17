import { defineConfig } from "@playwright/test";

/**
 * Browser smoke tests (`npm run e2e`). Locally they run in the installed
 * Microsoft Edge, so no browser download is needed; CI installs Chromium.
 */
const PORT = 5174;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  reporter: "list",
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(process.env["CI"] ? {} : { channel: "msedge" }),
  },
});
