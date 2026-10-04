import { describe, expect, it } from "vitest";
import { formatSyncDistribution, summarise, syncTrial } from "../src/index.js";

/**
 * Done-criterion as amended (v0.2.1 amendment 2): over 1,000 seeds under 80 ± 30 ms one-way
 * latency, (a) median |error| ≤ 10 ms after 4 round trips, (b) median ≤ 5 ms after 12,
 * (c) p95 ≤ 20 ms after 12. Prints the distributions.
 */
function run(link: { meanMs: number; sdMs: number }, keepFraction: number): { d4: ReturnType<typeof summarise>; d12: ReturnType<typeof summarise>; after4: number[] } {
  const SEEDS = 1000;
  const after4: number[] = [];
  const after12: number[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const errs = syncTrial(seed, link, 12, undefined, { keepFraction });
    after4.push(errs[3] as number);
    after12.push(errs[11] as number);
  }
  return { d4: summarise(after4, 4), d12: summarise(after12, 12), after4 };
}

describe("clock sync convergence (80 ± 30 ms one-way, 1,000 seeds)", () => {
  const link = { meanMs: 80, sdMs: 30 };
  const { d4, d12, after4 } = run(link, 1);
  console.log("80 ± 30 ms, median over the whole window (shipping estimator)");
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

describe("clock sync convergence (250 ± 80 ms one-way, 1,000 seeds) — informational, amendment 5", () => {
  const link = { meanMs: 250, sdMs: 80 };
  const { d4, d12 } = run(link, 1);
  console.log("250 ± 80 ms, median over the whole window (shipping estimator)");
  console.log(formatSyncDistribution(d4));
  console.log(formatSyncDistribution(d12));

  it("still reports after 4 round trips and keeps the error well inside the hit window", () => {
    expect(d4.median).toBeLessThan(40);
    expect(d12.p95).toBeLessThan(75);
  });
});

describe("amendment 5 comparison: lowest-rtt-half median (not adopted)", () => {
  it("does not beat the plain median under independent per-direction jitter", () => {
    for (const link of [{ meanMs: 80, sdMs: 30 }, { meanMs: 250, sdMs: 80 }]) {
      const plain = run(link, 1);
      const filtered = run(link, 0.5);
      console.log(`${link.meanMs} ± ${link.sdMs} ms  plain median: 4 RTT ${plain.d4.median.toFixed(1)} / 12 RTT ${plain.d12.median.toFixed(1)} ms   lowest-rtt half: 4 RTT ${filtered.d4.median.toFixed(1)} / 12 RTT ${filtered.d12.median.toFixed(1)} ms`);
      expect(filtered.d4.median).toBeGreaterThanOrEqual(plain.d4.median);
      expect(filtered.d12.median).toBeGreaterThanOrEqual(plain.d12.median);
    }
  });
});
