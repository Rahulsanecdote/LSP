import { describe, expect, it } from "vitest";
import { Rng } from "../src/index.js";

describe("Rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("produces normals with roughly the requested moments", () => {
    const r = new Rng(7);
    const xs = Array.from({ length: 50_000 }, () => r.normal(100, 15));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(100, 0);
    expect(sd).toBeCloseTo(15, 0);
  });
});
