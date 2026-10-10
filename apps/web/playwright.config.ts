import { defineConfig, devices } from "@playwright/test";

/**
 * One smoke test for the Task 1 diagnostic page (amendment list, "Playwright in Task 1"):
 * the page loads, connects to a dev party server, and shows a numeric offset within 5 s.
 * Both dev servers (wrangler dev for the room server, next dev for the page) are started by Playwright. Chromium comes from PLAYWRIGHT_BROWSERS_PATH or
 * the default install; `pnpm exec playwright install chromium` fetches it in CI.
 */
const PARTY_PORT = 1999;
const WEB_PORT = 3100;
const SCENE_PACE = 10;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // The read and S7 specs each drive three software-rendered WebGL pages and measure timing
  // (event latency, taps on the beat). Two at once on a two-core CI runner starves both: event
  // latency over 1 s and taps landing off the beat. One worker keeps the measurements honest.
  workers: 1,
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
        // Pixel 7's viewport and touch, rendered at scale 1: software WebGL at 2.6× is about seven
        // times the pixels, which starves the main thread the timing assertions depend on
        deviceScaleFactor: 1,
        launchOptions: {
          // PW_CHROMIUM points at a system Chromium when the managed download is unavailable
          ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
          // Software WebGL through SwiftShader on every run, CI included. Without these flags a
          // GPU-less runner falls back to a far slower path: the navigator and synaesthete pages
          // freeze for whole beats and the S7 act misses them (Task 3 report, CI hardening 8).
          args: ["--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        },
      },
    },
  ],
  webServer: [
    {
      // SCENE_PACE divides the paced scene durations so the episode plays in about a minute (Task 3)
      command: `pnpm --filter @lsp/party exec wrangler dev --port ${PARTY_PORT} --var SCENE_PACE:${SCENE_PACE}`,
      url: `http://127.0.0.1:${PARTY_PORT}/parties/main/E2E-PROBE`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      // A production build, not `next dev`: development React and the dev overlay cost several
      // times the main-thread time, and the S5 marks and S7 beat taps are timed on that thread.
      // It is also what players get.
      command: `pnpm --filter @lsp/web exec next build && pnpm --filter @lsp/web exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      cwd: "../..",
      env: { NEXT_PUBLIC_PARTY_HOST: `127.0.0.1:${PARTY_PORT}` },
    },
  ],
});
