import { describe, expect, it } from "vitest";
import { SyncEstimator, median, offsetSample } from "../src/index.js";

describe("offsetSample", () => {
  it("computes rtt and offset from a symmetric exchange", () => {
    // client clock is 1000 ms behind room time; 40 ms each way
    const c0 = 5000;
    const s1 = 6040;
    const c1 = 5080;
    expect(offsetSample(c0, s1, c1)).toEqual({ rtt: 80, offset: 1000 });
  });

  it("is exact when latency is symmetric, whatever its size", () => {
    for (const d of [1, 50, 400]) {
      expect(offsetSample(100, 100 + d + 777, 100 + 2 * d).offset).toBe(777);
    }
  });
});

describe("median", () => {
  it("handles odd and even lengths and ignores input order", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([9])).toBe(9);
  });
  it("throws on empty input", () => {
    expect(() => median([])).toThrow();
  });
});

describe("SyncEstimator", () => {
  it("is not ready before four samples, then reports the median offset", () => {
    const e = new SyncEstimator();
    e.push({ offset: 100, rtt: 80 });
    e.push({ offset: 110, rtt: 80 });
    e.push({ offset: 90, rtt: 80 });
    expect(e.ready).toBe(false);
    expect(e.estimate()).toBeUndefined();
    expect(() => e.toServer(0)).toThrow();
    e.push({ offset: 400, rtt: 80 }); // an outlier offset: the median shrugs it off
    expect(e.ready).toBe(true);
    expect(e.estimate()).toEqual({ offset: 105, rtt: 80, samples: 4 });
  });

  it("rejects samples with rtt above twice the running median once ready", () => {
    const e = new SyncEstimator();
    for (let i = 0; i < 4; i++) e.push({ offset: 100, rtt: 80 });
    expect(e.push({ offset: 5000, rtt: 161 })).toBe(false);
    expect(e.push({ offset: 100, rtt: 160 })).toBe(true);
    expect(e.rejected).toBe(1);
    expect(e.estimate()?.offset).toBe(100);
  });

  it("accepts the first samples unconditionally (no median to compare against yet)", () => {
    const e = new SyncEstimator();
    expect(e.push({ offset: 0, rtt: 10 })).toBe(true);
    expect(e.push({ offset: 0, rtt: 900 })).toBe(true);
  });

  it("rejects non-finite or negative-rtt samples", () => {
    const e = new SyncEstimator();
    expect(e.push({ offset: Number.NaN, rtt: 10 })).toBe(false);
    expect(e.push({ offset: 0, rtt: -1 })).toBe(false);
  });

  it("keeps a sliding window", () => {
    const e = new SyncEstimator({ maxSamples: 4 });
    for (let i = 0; i < 4; i++) e.push({ offset: 0, rtt: 50 });
    for (let i = 0; i < 4; i++) e.push({ offset: 200, rtt: 50 });
    expect(e.estimate()).toEqual({ offset: 200, rtt: 50, samples: 4 });
  });

  it("converts between local and room time", () => {
    const e = new SyncEstimator();
    for (let i = 0; i < 4; i++) e.pushExchange(1000 + i, 2040 + i, 1080 + i);
    expect(e.toServer(1500)).toBe(2500);
    expect(e.toLocal(2500)).toBe(1500);
  });
});
