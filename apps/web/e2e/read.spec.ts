import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Task 2 done-criterion (SLICE_HANDOFF.md §6): the Navigator holds on one phone, the
 * Synaesthete's phone flares within 200 ms, and the DEBT counter on the Theorist's phone
 * increments, all server-mediated. Three browser contexts, three roles, one room.
 */
async function openRole(browser: Browser, baseURL: string, room: string, role: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${baseURL}/r/${room}?role=${role}`);
  await expect(page.getByTestId("offset")).toHaveText(/offset -?\d+ ms/, { timeout: 10_000 });
  return page;
}

test("hold → flare within 200 ms → DEBT increments, server-mediated", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const room = `RD${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const base = baseURL ?? "http://localhost:3100";
  const nav = await openRole(browser, base, room, "navigator");
  const syn = await openRole(browser, base, room, "synaesthete");
  const theo = await openRole(browser, base, room, "theorist");

  // The overlay knows the crew but never the streams: no BranchSet ever reached this client,
  // and nothing it shows names a terminus. (The raw HTML is not the invariant; dev-mode
  // payloads can contain any word. We log a hit there for curiosity only.)
  await expect(syn.getByTestId("flare")).toHaveAttribute("data-branchset", "0");
  expect((await syn.locator("body").innerText()).toLowerCase()).not.toContain("seal");
  const html = (await syn.content()).toLowerCase();
  const hit = html.indexOf("seal");
  if (hit >= 0) console.log(`note: "seal" in raw synaesthete HTML near: …${html.slice(Math.max(0, hit - 90), hit + 60).replace(/\s+/g, " ")}…`);
  // the navigator, by contrast, has the streams
  await expect(nav.getByTestId("hold")).toHaveAttribute("data-branchset", "1", { timeout: 5_000 });
  await expect(theo.getByTestId("debt")).toHaveText("0");

  // let the synaesthete learn who the navigator is (stats arrive with hello)
  await expect(syn.getByTestId("flare")).toHaveAttribute("data-reading", "0", { timeout: 5_000 });

  // the navigator's hand goes down
  const hold = nav.getByTestId("hold");
  await expect(hold).toHaveAttribute("data-holding", "0");
  const t0 = Date.now();
  await hold.dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" });
  await expect(hold).toHaveAttribute("data-holding", "1");

  // the synaesthete's blob flares
  await expect.poll(async () => Number(await syn.getByTestId("flare").getAttribute("data-flare")), { timeout: 3_000 }).toBeGreaterThan(0.5);
  const flareAt = Date.now() - t0;
  const latency = Number(await syn.getByTestId("flare").getAttribute("data-latency"));
  console.log(`flare visible ${flareAt} ms after pointerdown (includes 100 ms polling); server→synaesthete event latency ${latency} ms`);
  expect(latency).toBeLessThan(200);
  await expect(syn.getByTestId("flare")).toHaveAttribute("data-reading", "1");
  await expect(theo.getByTestId("reading")).toContainText("is reading");

  // mid-hold evidence: streams formed, labels up, overlay lit
  await nav.waitForTimeout(700);
  await expect(nav.getByTestId("stream-label").first()).toBeVisible();
  // Every shown label must be legible: no two label boxes may overlap (seen on real phones, where
  // the narrow fan put the safe stream's label under the first failure stream's).
  const labelBoxes = () =>
    nav.getByTestId("stream-label").evaluateAll((els) =>
      els
        .filter((el) => Number(getComputedStyle(el).opacity) > 0.3)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, text: el.textContent ?? "" };
        }),
    );
  // labels fade in as their streams grow; under a software renderer that takes a few seconds
  await expect.poll(async () => (await labelBoxes()).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const boxes = await labelBoxes();
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `labels overlap: "${a.text}" and "${b.text}"`).toBe(false);
    }
  await nav.screenshot({ path: "test-results/navigator-holding.png" });
  await syn.screenshot({ path: "test-results/synaesthete-flare.png" });
  console.log(`synaesthete sim: ${await syn.getByTestId("flare").getAttribute("data-sim")}`);

  // Release. Under a software renderer the screenshots above can take seconds, so the hold may
  // or may not have crossed the 6 s horizon: the SERVER decides (+1 or +2) and every phone must
  // agree with its verdict.
  const heldMs = Date.now() - t0;
  await hold.dispatchEvent("pointerup", { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" });
  await expect(hold).toHaveAttribute("data-holding", "0");
  await expect(theo.getByTestId("debt")).not.toHaveText("0", { timeout: 3_000 });
  const debt = Number(await theo.getByTestId("debt").textContent());
  if (heldMs > 6_500) expect(debt).toBe(2);
  if (heldMs < 5_500) expect(debt).toBe(1);
  await expect(theo.getByTestId("reading")).toContainText(debt === 2 ? "+2" : "+1");
  await expect(syn.getByTestId("flare")).toHaveAttribute("data-reading", "0", { timeout: 3_000 });
  console.log(`held ~${heldMs} ms; server charged +${debt}`);

  // the navigator's own view agrees with the server's verdict
  await expect(nav.getByTestId("diag")).toContainText(`DEBT ${debt}`);

  await nav.screenshot({ path: "test-results/navigator.png" });
  await syn.screenshot({ path: "test-results/synaesthete.png" });
  await theo.screenshot({ path: "test-results/theorist.png" });
});
