import { expect, test } from "@playwright/test";

const NUMERIC = /^-?\d+(\.\d+)?\s*ms/;

test("diagnostic page connects to the party server and shows a numeric offset within 5 s", async ({ page }) => {
  const room = `E2E${Date.now().toString(36).toUpperCase().slice(-4)}`;
  await page.goto(`/diag/${room}`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(room);
  await expect(page.locator("h1").getByText("connected", { exact: false })).toBeVisible({ timeout: 5_000 });

  // the §5 numbers: offset and rtt become numeric once the sync burst has 4 samples
  const offset = page.getByTestId("offset");
  await expect(offset).toHaveText(NUMERIC, { timeout: 5_000 });
  await expect(page.getByTestId("rtt")).toHaveText(NUMERIC);
  await expect(page.getByTestId("countdown")).toHaveText(NUMERIC);

  // the tap button is enabled, at least 44 px, and a tap gets scored
  const tap = page.getByTestId("tap");
  await expect(tap).toBeEnabled();
  const box = await tap.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await tap.dispatchEvent("pointerdown");
  await expect(page.getByTestId("recent")).toContainText(/#\d+ [+-]?\d+ (hit|miss)/, { timeout: 3_000 });
  await expect(page.getByTestId("crew")).toContainText("(you)");

  await page.screenshot({ path: "test-results/diag.png", fullPage: true });
});
