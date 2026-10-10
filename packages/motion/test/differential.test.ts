import { describe, expect, it } from "vitest";
import { DEFAULT_GROWTH, DifferentialField, Spring, chordDeviation, countIntersections, hashString, type Point } from "../src/index";

/** The S2 seal fixture's fan, laid out as Streams.tsx does: one safe stream and three failures. */
const PRESENT_Y = -0.08;
const HORIZON_Y = 0.78;
const S2 = [
  { p: 0.94, terminalMs: 660_000 },
  { p: 0.02, terminalMs: 89_000 },
  { p: 0.02, terminalMs: 89_000 },
  { p: 0.02, terminalMs: 89_000 },
];

function fan(aspect: number): { origin: Point; target: Point }[] {
  const n = S2.length;
  const spread = 0.62 * Math.min(1, Math.max(aspect, 0.3) / 0.75);
  return S2.map((s, i) => {
    const angle = ((n === 1 ? 0.5 : i / (n - 1)) - 0.5) * spread;
    const endY = Math.min(PRESENT_Y + (s.terminalMs / 90_000) * (HORIZON_Y - PRESENT_Y), 1.05);
    const len = (endY - PRESENT_Y) / Math.max(Math.cos(angle), 0.2);
    return { origin: { x: 0, y: 0 }, target: { x: len * Math.sin(angle), y: len * Math.cos(angle) } };
  });
}

const DT = 1 / 120;

/** Grow the fan with the Task 2 spring ease (600 ms), then settle. Returns the field. */
function grow(seed: number, aspect: number, growMs = 600, settleSteps = 240): DifferentialField {
  const field = new DifferentialField(seed);
  const lines = fan(aspect);
  lines.forEach((l) => field.addLine(l.origin));
  const springs = lines.map((_, i) => new Spring(0, 180 + i * 25));
  const steps = Math.round(growMs / (DT * 1000));
  for (let s = 0; s < steps + settleSteps; s++) {
    lines.forEach((l, i) => {
      const g = (springs[i] as Spring).to(1, DT * 1000);
      field.setTip(i, { x: l.target.x * g, y: l.target.y * g });
    });
    field.step(DT);
  }
  return field;
}

function snapshot(field: DifferentialField): number[] {
  const out: number[] = [];
  for (let i = 0; i < field.lineCount; i++) for (const p of field.line(i)) out.push(p.x, p.y);
  return out;
}

describe("differential growth", () => {
  it("is reproducible: same seed and step sequence, identical nodes", () => {
    const a = grow(hashString("s2-seal"), 0.46);
    const b = grow(hashString("s2-seal"), 0.46);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.nodeCount).toBeGreaterThan(8);
  });

  it("a different seed grows a different shape", () => {
    const a = grow(1, 0.46);
    const b = grow(2, 0.46);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  for (const aspect of [0.46, 1.78]) {
    it(`S2 fixture at aspect ${aspect}: four streams grow without crossing, tips on target, edges bounded`, () => {
      const field = grow(hashString("s2-seal"), aspect);
      const lines = fan(aspect);
      expect(countIntersections(field)).toBe(0);
      for (let i = 0; i < lines.length; i++) {
        const line = field.line(i);
        const tip = field.tip(i);
        const target = (lines[i] as { target: Point }).target;
        expect(Math.hypot(tip.x - target.x, tip.y - target.y)).toBeLessThan(1e-3);
        expect(line.length).toBeGreaterThan(2); // nodes were inserted where neighbours separated
        expect(line.length).toBeLessThanOrEqual(DEFAULT_GROWTH.maxNodesPerLine);
        for (let k = 1; k < line.length; k++) {
          const p = line[k - 1] as Point;
          const q = line[k] as Point;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          expect(d).toBeGreaterThanOrEqual(DEFAULT_GROWTH.minEdge / 2);
          expect(d).toBeLessThanOrEqual(DEFAULT_GROWTH.maxEdge * 1.5);
        }
        // subtle: a stream wavers but reads as its chord
        expect(chordDeviation(line)).toBeLessThan(0.08);
        expect(chordDeviation(line)).toBeGreaterThan(0); // and it is not a straight line
      }
    });
  }

  it("never crosses at any point during growth", () => {
    const field = new DifferentialField(hashString("s2-seal"));
    const lines = fan(0.46);
    lines.forEach((l) => field.addLine(l.origin));
    const springs = lines.map((_, i) => new Spring(0, 180 + i * 25));
    for (let s = 0; s < 90; s++) {
      lines.forEach((l, i) => {
        const g = (springs[i] as Spring).to(1, DT * 1000);
        field.setTip(i, { x: l.target.x * g, y: l.target.y * g });
      });
      field.step(DT);
      expect(countIntersections(field)).toBe(0);
    }
  });

  it("release prunes the line back toward the head", () => {
    const field = grow(7, 0.46);
    const grown = field.nodeCount;
    const lines = fan(0.46);
    const springs = lines.map(() => new Spring(1, 120));
    for (let s = 0; s < 120; s++) {
      lines.forEach((l, i) => {
        const g = (springs[i] as Spring).to(0, DT * 1000);
        field.setTip(i, { x: l.target.x * g, y: l.target.y * g });
      });
      field.step(DT);
    }
    expect(field.nodeCount).toBeLessThan(grown / 4);
    for (let i = 0; i < lines.length; i++) expect(field.line(i).length).toBeGreaterThanOrEqual(2);
  });

  it("hashString is stable", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("seal")).toBe(hashString("seal"));
    expect(hashString("seal")).not.toBe(hashString("seam"));
  });
});
