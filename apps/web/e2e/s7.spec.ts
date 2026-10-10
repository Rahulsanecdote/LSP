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
let roomCode: string | null = null;
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
  // Print what the server measured, pass or fail: on a slow CI runner this is the only way to see
  // whether a missed beat was the scripted tap, the page's clock sync, or the act logic.
  if (!roomCode) return;
  try {
    const res = await fetch(`http://127.0.0.1:1999/parties/main/${roomCode}`);
    const s = (await res.json()) as {
      players: { label: string; role: string }[];
      tapLog: { role: string; beatIndex: number; deltaMs: number; auditDeltaMs: number | null; hit: boolean }[];
      scene: { id: string; consent: string | null; log: { at: number; text: string }[] };
    };
    console.log(`room ${roomCode}: scene ${s.scene.id}, consent ${s.scene.consent}`);
    for (const l of s.scene.log.filter((e) => /Trial|tap|Consent|window/i.test(e.text))) console.log(`  ledger ${(l.at / 1000).toFixed(1)} s  ${l.text}`);
    for (const t of s.tapLog.slice(-24)) console.log(`  tap ${t.role.padEnd(11)} beat ${t.beatIndex}  scored ${t.deltaMs.toFixed(0)} ms  audit ${t.auditDeltaMs === null ? "—" : t.auditDeltaMs.toFixed(0)} ms  ${t.hit ? "hit" : "miss"}`);
  } catch (e) {
    console.log(`room summary unavailable: ${String(e)}`);
  }
  roomCode = null;
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
 * Arm the Synaesthete's mark in-page: as soon as the MARK button shows a pending commit time, fire
 * at that local time. Reading the attribute through Playwright and scheduling back into the page
 * costs a round trip that, on a loaded runner, can exceed the whole one-second commit hold.
 */
async function armMark(page: Page): Promise<void> {
  await page.evaluate(() => {
    const read = (): number => Number(document.querySelector('[data-testid="tap"]')?.getAttribute("data-commit-local") ?? "") || 0;
    const id = window.setInterval(() => {
      const first = read();
      if (!first) return;
      window.clearInterval(id);
      const fire = () => {
        // the page re-renders the commit time from its current clock estimate; use the latest
        const at = read() || first;
        while (performance.now() < at) {
          /* spin to the exact moment */
        }
        document.querySelector('[data-testid="tap"]')?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" }));
      };
      const delay = first - performance.now() - 120;
      if (delay <= 0) fire();
      else window.setTimeout(fire, delay);
    }, 10);
  });
}

/**
 * Arm one seat's consent taps in-page, before the act opens: when the scene shows the act's first
 * beat, tap on that beat and the ones after it, the way a player follows the cue the page renders.
 * Each tap re-reads the beat time the page currently renders (it moves with the clock estimate)
 * and spins to it. A beat the page could not reach in time (frozen past it) is skipped, not fired
 * late: late taps bunch onto one beat. Scheduling the taps from Playwright after the act opened
 * took longer than the act's lead on a loaded CI runner (seen: six taps on one beat).
 */
async function armBeats(page: Page, selector: string, beats = 9): Promise<void> {
  await page.evaluate(
    ({ selector, beats }) => {
      const read = (): { start: number; interval: number } | null => {
        const el = document.querySelector('[data-testid="scene"]');
        const start = Number(el?.getAttribute("data-act-start-local") ?? "");
        const interval = Number(el?.getAttribute("data-interval") ?? "");
        return start && interval ? { start, interval } : null;
      };
      let k = 0;
      let opened = false;
      const step = (): void => {
        const r = read();
        if (!r) {
          if (!opened) window.setTimeout(step, 10); // waiting for the act; once it has closed, stop
          return;
        }
        opened = true;
        if (k >= beats) return;
        const lead = r.start + k * r.interval - performance.now();
        if (lead > 120) {
          window.setTimeout(step, lead - 120);
          return;
        }
        const at = r.start + k * r.interval;
        k++;
        if (at < performance.now() - 60) {
          window.setTimeout(step, 0); // missed it; take the next beat instead of firing late
          return;
        }
        while (performance.now() < at) {
          /* spin to the exact moment */
        }
        document.querySelector(selector)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, pointerType: "touch" }));
        window.setTimeout(step, 0);
      };
      step();
    },
    { selector, beats },
  );
}

test("three contexts play S2, S5 and S7, and the clean beat lands", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const room = `S7${Date.now().toString(36).toUpperCase().slice(-4)}`;
  roomCode = room;
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
  // every seat is armed before the words are chosen: the act opens less than a second before its first beat
  const targets: [Page, string][] = [
    [nav, '[data-testid="hold"]'],
    [syn, '[data-testid="tap"]'],
    [theo, '[data-testid="tap"]'],
  ];
  await Promise.all(targets.map(([p, selector]) => armBeats(p, selector)));
  await theo.getByTestId("phrasing-clean").click();
  // Screenshot the act in progress: once the run shows two clean beats, or, on a runner too slow
  // to look in time, whatever S7 state follows (the reply). Never earlier: the taps come first.
  await expect(scene(theo)).toHaveAttribute("data-phase", /^(act|between|reply|done)$/, { timeout: 10_000 });
  await expect
    .poll(
      async () => {
        if ((await scene(theo).getAttribute("data-phase")) !== "act") return true;
        return /run [23]\/3/.test((await theo.getByTestId("run").textContent().catch(() => "")) ?? "");
      },
      { timeout: 20_000, intervals: [50] },
    )
    .toBe(true);
  await Promise.all([
    theo.screenshot({ path: "test-results/s7-theorist.png" }),
    syn.screenshot({ path: "test-results/s7-synaesthete.png" }),
    nav.screenshot({ path: "test-results/s7-navigator.png" }),
  ]);
  // no stream content in S7: the field is the collapse, not a read
  expect(await nav.getByTestId("stream-label").count()).toBe(0);

  // the act fires server-side: the reply holds on every screen (the lights dim, Chen's line), then the end card
  await expect(scene(syn)).toHaveAttribute("data-phase", "reply", { timeout: 20_000 });
  await expect(syn.getByTestId("chen-line")).toContainText("It's conserving something.");
  await expect(syn.getByTestId("tap-colours")).toHaveAttribute("data-in-rhythm", "1");
  await syn.screenshot({ path: "test-results/s7-synaesthete-reply.png" });
  for (const p of [nav, syn, theo]) await expect(scene(p)).toHaveAttribute("data-scene", "end", { timeout: 20_000 });
  for (const p of [nav, syn, theo]) {
    await expect(p.getByTestId("end")).toHaveAttribute("data-ending", "answered");
    await expect(p.getByTestId("end")).toHaveAttribute("data-consent", "clean");
    expect(Number(await scene(p).getAttribute("data-dim"))).toBeGreaterThan(0);
  }
  await expect(nav.getByTestId("end")).toContainText("lights dimmed");
  await theo.screenshot({ path: "test-results/end-theorist.png" });
});
