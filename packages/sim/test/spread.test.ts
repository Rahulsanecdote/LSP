import { describe, expect, it } from "vitest";
import { criterionConfig, formatReport, runSpread } from "../src/index.js";

/**
 * Done-criterion: 3 clients, latencies {40±15, 120±40, 250±80} ms one-way, human sd 40 ms,
 * 60 beats → cross-client spread (max − min of per-beat deltas) < 150 ms on ≥ 90% of beats.
 */
describe("sim spread", () => {
  const report = runSpread(criterionConfig(1, 60, 3));
  console.log(formatReport(report));

  it("measures 60 beats on which all three clients tapped", () => {
    expect(report.rows).toHaveLength(60);
    expect(report.rows.map((r) => r.beatIndex)).toEqual(
      Array.from({ length: 60 }, (_, i) => report.firstMeasuredBeat + i),
    );
  });

  it("keeps spread under 150 ms on at least 90% of beats", () => {
    expect(report.fractionUnder).toBeGreaterThanOrEqual(0.9);
    expect(report.pass).toBe(true);
  });

  it("ground-truth spread (which includes clock-sync error) also stays under 150 ms on ≥ 90% of beats", () => {
    expect(report.trueFractionUnder).toBeGreaterThanOrEqual(0.9);
  });

  it("every client synced to within the window, well under the beat interval", () => {
    for (const c of report.clients) {
      expect(Number.isFinite(c.syncErrorMs)).toBe(true);
      expect(Math.abs(c.syncErrorMs)).toBeLessThan(75);
    }
  });

  it("is deterministic: the same seed reproduces the same spreads", () => {
    const again = runSpread(criterionConfig(1, 60, 3));
    expect(again.spreads).toEqual(report.spreads);
  });

  it("holds across ten seeds", () => {
    let passes = 0;
    for (let seed = 1; seed <= 10; seed++) if (runSpread(criterionConfig(seed, 60, 3)).pass) passes++;
    console.log(`spread criterion passes on ${passes}/10 seeds`);
    expect(passes).toBe(10);
  });
});
