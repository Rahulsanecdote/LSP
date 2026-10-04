import { describe, expect, it } from "vitest";
import { formatSyncDistribution, summarise, syncTrial } from "../src/index.js";

/**
 * Done-criterion as amended (v0.2.1 amendment 2): over 1,000 seeds under 80 ± 30 ms one-way
 * latency, (a) median |error| ≤ 10 ms after 4 round trips, (b) median ≤ 5 ms after 12,
 * (c) p95 ≤ 20 ms after 12. Prints the distributions.
 */
describe("clock sync convergence (80 ± 30 ms one-way, 1,000 seeds)", () => {
  const link = { meanMs: 80, sdMs: 30 };
  const SEEDS = 1000;
  const after4: number[] = [];
  const after12: number[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const errs = syncTrial(seed, link, 12);
    after4.push(errs[3] as number);
    after12.push(errs[11] as number);
  }
  const d4 = summarise(after4, 4);
  const d12 = summarise(after12, 12);
  console.log(formatSyncDistribution(d4));
  console.log(formatSyncDistribution(d12));

  it("reports an estimate after exactly 4 round trips for every seed", () => {
    expect(after4.every(Number.isFinite)).toBe(true);
  });

  it("(a) median |error| ≤ 10 ms after 4 round trips", () => {
    expect(d4.median).toBeLessThanOrEqual(10);
  });

  it("(b) median |error| ≤ 5 ms after 12 round trips", () => {
    expect(d12.median).toBeLessThanOrEqual(5);
  });

  it("(c) p95 |error| ≤ 20 ms after 12 round trips", () => {
    expect(d12.p95).toBeLessThanOrEqual(20);
  });

  it("is exact when latency is symmetric and constant", () => {
    const errs = syncTrial(3, { meanMs: 80, sdMs: 0 }, 4);
    expect(errs[3]).toBeCloseTo(0, 6);
  });
});
