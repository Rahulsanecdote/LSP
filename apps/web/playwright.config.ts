import { defineConfig, devices } from "@playwright/test";

/**
 * One smoke test for the Task 1 diagnostic page (amendment list, "Playwright in Task 1"):
 * the page loads, connects to a dev party server, and shows a numeric offset within 5 s.
 * Both dev servers are started by Playwright. Chromium comes from PLAYWRIGHT_BROWSERS_PATH or
 * the default install; `pnpm exec playwright install chromium` fetches it in CI.
 */
const PARTY_PORT = 1999;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        // PW_CHROMIUM points at a system Chromium when the managed download is unavailable
        ...(process.env.PW_CHROMIUM
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--no-proxy-server"] } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @lsp/party exec partykit dev --port ${PARTY_PORT}`,
      url: `http://127.0.0.1:${PARTY_PORT}/parties/main/E2E-PROBE`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      command: `pnpm --filter @lsp/web exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: "../..",
      env: { NEXT_PUBLIC_PARTYKIT_HOST: `127.0.0.1:${PARTY_PORT}` },
    },
  ],
});
