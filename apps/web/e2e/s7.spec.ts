import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Task 3 done-criterion (SLICE_HANDOFF.md §7): three browser contexts complete S7 with a scripted
 * clean beat. The run walks the whole slice at SCENE_PACE (set in playwright.config.ts): the
 * lobby, S2 (tighten remotely, the one line that does not reveal, say nothing), the interlude,
 * S5 (three trials with scripted commits and marks), then S7 with the clean phrasing and taps
 * scheduled in-page at the act's beat times. Every step is an intent the server may refuse;
 * the assertions read the server's view back from each role's page.
 */
// Every context a test opens is closed after it: three software-rendered WebGL pages left running
// would starve the next spec in the same worker (that is how the S7 spec first failed on CI).
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function openRole(browser: Browser, baseURL: string, room: string, role: string): Promise<Page> {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto(`${baseURL}/r/${room}?role=${role}`);
  await expect(page.getByTestId("offset")).toHaveText(/offset -?\d+ ms/, { timeout: 10_000 });
  return page;
}

const touch = { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" };

/**
 * Dispatch pointerdown on `selector` at local time `atLocal` (performance.now ms) from inside the
 * page. A plain setTimeout fires late when the main thread is busy with a software-rendered WebGL
 * frame (over 150 ms on a two-core CI runner), so the timer wakes 120 ms early and spins to the
 * exact moment: the scripted player is on time, as the test intends.
 */
async function tapAtLocal(page: Page, selector: string, atLocal: number): Promise<void> {
  await page.evaluate(
    ({ selector, atLocal }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`no ${selector}`);
      const fire = () => {
        while (performance.now() < atLocal) {
          /* spin to the exact moment */
        }
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" }));
      };
      const delay = atLocal - performance.now() - 120;
      if (delay <= 0) fire();
      else setTimeout(fire, delay);
    },
    { selector, atLocal },
  );
}

/**
 * Arm the Synaesthete's mark in-page: as soon as the MARK button shows a pending commit time, fire
 * at that local time. Reading the attribute through Playwright and scheduling back into the page
 * costs a round trip that, on a loaded runner, can exceed the whole one-second commit hold.
 */
async function armMark(page: Page): Promise<void> {
  await page.evaluate(() => {
    const id = window.setInterval(() => {
      const el = document.querySelector('[data-testid="tap"]');
      const at = Number(el?.getAttribute("data-commit-local") ?? "");
      if (!el || !at) return;
      window.clearInterval(id);
      const fire = () => {
        while (performance.now() < at) {
          /* spin to the exact moment */
        }
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" }));
      };
      const delay = at - performance.now() - 120;
      if (delay <= 0) fire();
      else window.setTimeout(fire, delay);
    }, 10);
  });
}

test("three contexts play S2, S5 and S7, and the clean beat lands", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const room = `S7${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const base = baseURL ?? "http://localhost:3100";
  const nav = await openRole(browser, base, room, "navigator");
  const syn = await openRole(browser, base, room, "synaesthete");
  const theo = await openRole(browser, base, room, "theorist");
  const scene = (p: Page) => p.getByTestId("scene");

  // ---- lobby → S2: only the Theorist can begin, once all three seats are filled
  await expect(theo.getByTestId("begin")).toBeEnabled({ timeout: 10_000 });
  await theo.getByTestId("begin").click();
  for (const p of [nav, syn, theo]) await expect(scene(p)).toHaveAttribute("data-scene", "s2", { timeout: 10_000 });

  // ---- S2: Sarah tightens the seal at once; Chen says nothing; Elena, once prompted, asks without revealing
  await theo.getByTestId("tool-tighten").click();
  await expect(theo.getByTestId("fixed")).toBeVisible();
  await syn.getByTestId("syn-silent").click();
  await expect(syn.getByTestId("syn-chosen")).toBeVisible();
  await expect(nav.getByTestId("line-humor-me")).toBeVisible({ timeout: 30_000 }); // the reflex prompt at −1,380 m
  await nav.getByTestId("line-humor-me").click();
  await expect(theo.getByTestId("comms")).toContainText("humor me");
  await nav.screenshot({ path: "test-results/s2-navigator.png" });
  await theo.screenshot({ path: "test-results/s2-theorist.png" });

  // ---- the interlude cards, then S5
  await expect(scene(theo)).toHaveAttribute("data-scene", "s5", { timeout: 40_000 });
  await theo.getByTestId("advance").click(); // trial 1
  for (const [i, q] of [
    [0, "q1-what"],
    [1, "q2-where"],
  ] as const) {
    await expect(nav.getByTestId(`q-${q}`)).toBeVisible({ timeout: 10_000 });
    // Chen watches her mind-shape build and marks the commit
    await armMark(syn);
    await nav.getByTestId(`q-${q}`).dispatchEvent("pointerdown", touch);
    await nav.waitForTimeout(1300);
    // release after the commit: ignored by the server, not a cancel. The wheel may already be gone,
    // because a conclusive mark closes the trial at once.
    const held = nav.getByTestId(`q-${q}`);
    if (await held.count()) await held.dispatchEvent("pointerup", touch);
    await expect(theo.getByTestId(`trial-${i}`)).toHaveAttribute("data-done", "1", { timeout: 10_000 });
    // the verdict itself: "inconclusive" also contains the word "conclusive"
    await expect(theo.getByTestId(`trial-${i}`)).toHaveAttribute("data-conclusive", "1");
    await theo.getByTestId("advance").click(); // next trial
  }
  // trial 3 is the control: the server picks the moment; Chen marks what he sees
  {
    await armMark(syn);
    await expect(theo.getByTestId("trial-2")).toHaveAttribute("data-done", "1", { timeout: 15_000 });
    await expect(theo.getByTestId("trial-2")).toHaveAttribute("data-conclusive", "1");
  }
  await theo.getByTestId("classify-anomaly").click();
  await theo.screenshot({ path: "test-results/s5-theorist.png" });
  await syn.screenshot({ path: "test-results/s5-synaesthete.png" });
  await expect(theo.getByTestId("advance")).toBeEnabled();
  await theo.getByTestId("advance").click();

  // ---- S7: the demonstration, Sarah's words, then everyone on the beat
  for (const p of [nav, syn, theo]) await expect(scene(p)).toHaveAttribute("data-scene", "s7", { timeout: 10_000 });
  await expect(scene(theo)).toHaveAttribute("data-phase", "phrasing", { timeout: 15_000 });
  await theo.getByTestId("phrasing-clean").click();
  const targets: [Page, string][] = [
    [nav, '[data-testid="hold"]'],
    [syn, '[data-testid="tap"]'],
    [theo, '[data-testid="tap"]'],
  ];
  for (const [p] of targets) await expect(scene(p)).toHaveAttribute("data-act-start-local", /\d+/, { timeout: 10_000 });
  // each client schedules its own taps on the first six beats of the window, from its own clock sync
  for (const [p, selector] of targets) {
    const start = Number(await scene(p).getAttribute("data-act-start-local"));
    const interval = Number(await scene(p).getAttribute("data-interval"));
    for (let k = 0; k < 6; k++) await tapAtLocal(p, selector, start + k * interval);
  }
  // mid-act, all three at once: a software-rendered screenshot can outlast the 2 s act
  const firstBeat = Number(await scene(theo).getAttribute("data-act-start-local"));
  await theo.evaluate((at) => new Promise((r) => setTimeout(r, Math.max(0, at + 700 - performance.now()))), firstBeat);
  await Promise.all([
    theo.screenshot({ path: "test-results/s7-theorist.png" }),
    syn.screenshot({ path: "test-results/s7-synaesthete.png" }),
    nav.screenshot({ path: "test-results/s7-navigator.png" }),
  ]);
  // no stream content in S7: the field is the collapse, not a read
  expect(await nav.getByTestId("stream-label").count()).toBe(0);

  // the act fires server-side: the lights dim on every screen, Chen says his line, the end card reads "answered"
  for (const p of [nav, syn, theo]) await expect(scene(p)).toHaveAttribute("data-scene", "end", { timeout: 20_000 });
  for (const p of [nav, syn, theo]) {
    await expect(p.getByTestId("end")).toHaveAttribute("data-ending", "answered");
    await expect(p.getByTestId("end")).toHaveAttribute("data-consent", "clean");
    expect(Number(await scene(p).getAttribute("data-dim"))).toBeGreaterThan(0);
  }
  await expect(nav.getByTestId("end")).toContainText("lights dimmed");
  await theo.screenshot({ path: "test-results/end-theorist.png" });
});
