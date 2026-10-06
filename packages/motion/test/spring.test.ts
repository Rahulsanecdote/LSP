import { describe, expect, it } from "vitest";
import { HALFLIFE_ROOT, Spring, omegaFromHalflife, springTo } from "../src/index";

describe("springTo (critically damped)", () => {
  it("HALFLIFE_ROOT solves (1 + u) e^{-u} = 1/2", () => {
    expect((1 + HALFLIFE_ROOT) * Math.exp(-HALFLIFE_ROOT)).toBeCloseTo(0.5, 12);
  });

  it("from rest, the displacement halves after exactly one halflife", () => {
    const s = springTo(0, 100, 0, 200, 200);
    expect(s.value).toBeCloseTo(50, 9);
  });

  it("converges to the target and settles", () => {
    let v = 0,
      x = 0;
    for (let t = 0; t < 3000; t += 16) ({ value: x, velocity: v } = springTo(x, 100, v, 150, 16));
    expect(x).toBeCloseTo(100, 6);
    expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it("never overshoots from rest", () => {
    let v = 0,
      x = 0;
    for (let t = 0; t < 3000; t += 7) {
      ({ value: x, velocity: v } = springTo(x, 100, v, 120, 7));
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("is frame-rate independent: two half steps equal one full step", () => {
    const one = springTo(0, 100, 30, 180, 16);
    const a = springTo(0, 100, 30, 180, 8);
    const two = springTo(a.value, 100, a.velocity, 180, 8);
    expect(two.value).toBeCloseTo(one.value, 10);
    expect(two.velocity).toBeCloseTo(one.velocity, 10);
  });

  it("is monotone in halflife: a shorter halflife gets closer in the same time", () => {
    const fast = springTo(0, 100, 0, 100, 100).value;
    const slow = springTo(0, 100, 0, 400, 100).value;
    expect(fast).toBeGreaterThan(slow);
  });

  it("carries initial velocity: a push away from the target first moves away", () => {
    const s = springTo(0, 100, -2000, 300, 10);
    expect(s.value).toBeLessThan(0);
  });

  it("dt <= 0 is the identity; halflife <= 0 snaps", () => {
    expect(springTo(3, 9, 1, 100, 0)).toEqual({ value: 3, velocity: 1 });
    expect(springTo(3, 9, 1, 0, 16)).toEqual({ value: 9, velocity: 0 });
  });

  it("omegaFromHalflife is the root over the halflife", () => {
    expect(omegaFromHalflife(2)).toBeCloseTo(HALFLIFE_ROOT / 2, 12);
  });
});

describe("Spring", () => {
  it("steps, snaps and reports settled", () => {
    const s = new Spring(0, 100);
    s.to(1, 50);
    expect(s.value).toBeGreaterThan(0);
    expect(s.settled(1)).toBe(false);
    for (let i = 0; i < 200; i++) s.to(1, 16);
    expect(s.settled(1)).toBe(true);
    s.snap(0);
    expect(s.value).toBe(0);
    expect(s.velocity).toBe(0);
  });
});
