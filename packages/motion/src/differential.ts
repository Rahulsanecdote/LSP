import { Rng } from "./rng";

/**
 * Differential growth (the differential line), implemented from its published description:
 *
 *   A line is an ordered chain of nodes. Each step every node moves by the sum of
 *     1. attraction toward each chain neighbour,
 *     2. repulsion from every other node within a radius (chain neighbours excluded),
 *     3. alignment toward the midpoint of its two neighbours;
 *   then, wherever two neighbours have separated past a maximum edge length a node is inserted
 *   between them, and wherever they have closed below a minimum one is removed.
 *
 * Here the lines are open and two nodes of each are not simulated: the head is pinned (the
 * present) and the tip is driven by the caller (`setTip`), so advancing the tip stretches the
 * edge behind it and the insertion rule is what makes the stream *grow* node by node. Retreating
 * the tip compresses the chain and the removal rule prunes it. Everything is a pure function of
 * (seed, call sequence): a fixed timestep, forces computed from the previous positions, a fixed
 * iteration order, and the only randomness a seeded perpendicular jitter on insertion.
 */

export interface Point {
  x: number;
  y: number;
}

export interface GrowthParams {
  /** pull toward each chain neighbour, per second, as a fraction of the gap */
  attraction: number;
  /** push from non-neighbour nodes inside `repulsionRadius`, per second, in units of the radius */
  repulsion: number;
  /** pull toward the midpoint of the two neighbours, per second, as a fraction of the offset */
  alignment: number;
  repulsionRadius: number;
  /** an edge longer than this gets a node inserted at its midpoint */
  maxEdge: number;
  /** an edge shorter than this loses its later node; keep it under maxEdge / 2 or it oscillates */
  minEdge: number;
  /** perpendicular offset applied on insertion, uniform in ±jitter, capped at 15% of the edge */
  jitter: number;
  /**
   * Within this distance of a line's head, nodes get attraction and alignment only: no jitter and
   * no repulsion from other lines. Lines that share a head are coincident there, so their fan
   * angles, not sideways pushes, must be what separates them; past the zone they are far enough
   * apart for repulsion to act in the separating direction.
   */
  baseRadius: number;
  maxNodesPerLine: number;
}

/**
 * Tuned for a readable fan in the streams' uv space (x aspect-corrected, a stream ≈ 0.9 long):
 * alignment dominant so a stream deviates from its chord by a few percent; the repulsion radius
 * is about one stream width so neighbouring streams keep apart and never cross.
 */
export const DEFAULT_GROWTH: GrowthParams = {
  attraction: 18,
  repulsion: 1.2,
  alignment: 30,
  repulsionRadius: 0.03,
  maxEdge: 0.02,
  minEdge: 0.007,
  jitter: 0.004,
  baseRadius: 0.08,
  maxNodesPerLine: 96,
};

export class DifferentialField {
  readonly params: GrowthParams;
  private readonly rng: Rng;
  private readonly lines: Point[][] = [];
  private readonly targets: Point[] = [];

  constructor(seed: number, params: Partial<GrowthParams> = {}) {
    this.params = { ...DEFAULT_GROWTH, ...params };
    this.rng = new Rng(seed);
  }

  /** Add a line: head pinned at `origin`, tip at `origin` until `setTip` moves it. Returns its index. */
  addLine(origin: Point): number {
    this.lines.push([{ ...origin }, { ...origin }]);
    this.targets.push({ ...origin });
    return this.lines.length - 1;
  }

  /**
   * Where the tip of line `i` is: set directly (driven, not simulated). A tip that retreats
   * trims the nodes it passes (those farther along the head→tip direction than the tip itself),
   * so a released stream prunes back node by node; a uniform chain would otherwise resist
   * compression because its neighbour pulls cancel.
   */
  setTip(i: number, p: Point): void {
    const line = this.lines[i];
    if (!line) throw new RangeError(`no line ${i}`);
    const head = line[0] as Point;
    const dx = p.x - head.x;
    const dy = p.y - head.y;
    const reach = dx * dx + dy * dy;
    for (let k = line.length - 2; k >= 1; k--) {
      const q = line[k] as Point;
      if ((q.x - head.x) * dx + (q.y - head.y) * dy > reach) line.splice(k, 1);
    }
    const tip = line[line.length - 1] as Point;
    tip.x = p.x;
    tip.y = p.y;
    this.targets[i] = { x: p.x, y: p.y };
  }

  get lineCount(): number {
    return this.lines.length;
  }

  line(i: number): readonly Point[] {
    const line = this.lines[i];
    if (!line) throw new RangeError(`no line ${i}`);
    return line;
  }

  tip(i: number): Point {
    const line = this.line(i);
    return { ...(line[line.length - 1] as Point) };
  }

  get nodeCount(): number {
    let n = 0;
    for (const l of this.lines) n += l.length;
    return n;
  }

  /** One fixed step of `dt` seconds: forces from the previous positions, then insert/remove. */
  step(dt: number): void {
    const { attraction, repulsion, alignment, repulsionRadius: R, maxEdge, minEdge, jitter, baseRadius, maxNodesPerLine } = this.params;
    const R2 = R * R;
    const base2 = baseRadius * baseRadius;
    const inBase = (line: Point[], p: Point): boolean => {
      const h = line[0] as Point;
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      return dx * dx + dy * dy < base2;
    };

    // 1–3: displacement for every free node, from a snapshot of positions
    const moves: Point[][] = this.lines.map((line) => line.map(() => ({ x: 0, y: 0 })));
    for (let a = 0; a < this.lines.length; a++) {
      const line = this.lines[a] as Point[];
      for (let i = 1; i < line.length - 1; i++) {
        const p = line[i] as Point;
        const prev = line[i - 1] as Point;
        const next = line[i + 1] as Point;
        const m = (moves[a] as Point[])[i] as Point;
        m.x += attraction * (prev.x - p.x + (next.x - p.x));
        m.y += attraction * (prev.y - p.y + (next.y - p.y));
        m.x += alignment * ((prev.x + next.x) * 0.5 - p.x);
        m.y += alignment * ((prev.y + next.y) * 0.5 - p.y);
      }
    }
    // repulsion: every unordered pair once, applied to whichever of the two is free
    for (let a = 0; a < this.lines.length; a++) {
      const la = this.lines[a] as Point[];
      for (let i = 0; i < la.length; i++) {
        const p = la[i] as Point;
        for (let b = a; b < this.lines.length; b++) {
          const lb = this.lines[b] as Point[];
          for (let j = b === a ? i + 2 : 0; j < lb.length; j++) {
            const q = lb[j] as Point;
            const dx = p.x - q.x;
            if (dx > R || dx < -R) continue;
            const dy = p.y - q.y;
            if (dy > R || dy < -R) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= R2 || d2 < 1e-12) continue;
            if (b !== a && (inBase(la, p) || inBase(lb, q))) continue;
            const d = Math.sqrt(d2);
            const f = (repulsion * (1 - d / R)) / d; // linear falloff, as a unit-vector multiplier
            const fx = dx * f * R;
            const fy = dy * f * R;
            if (i > 0 && i < la.length - 1) {
              const m = (moves[a] as Point[])[i] as Point;
              m.x += fx;
              m.y += fy;
            }
            if (j > 0 && j < lb.length - 1) {
              const m = (moves[b] as Point[])[j] as Point;
              m.x -= fx;
              m.y -= fy;
            }
          }
        }
      }
    }
    for (let a = 0; a < this.lines.length; a++) {
      const line = this.lines[a] as Point[];
      const mv = moves[a] as Point[];
      for (let i = 1; i < line.length - 1; i++) {
        const p = line[i] as Point;
        const m = mv[i] as Point;
        p.x += m.x * dt;
        p.y += m.y * dt;
      }
    }

    // 4: insertion where neighbours separated, removal where they closed
    for (let a = 0; a < this.lines.length; a++) {
      const line = this.lines[a] as Point[];
      for (let i = 0; i < line.length - 1 && line.length < maxNodesPerLine; i++) {
        const p = line[i] as Point;
        const q = line[i + 1] as Point;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > maxEdge) {
          // jitter is capped by the edge it lands on, so the first tiny edges near the shared
          // origin cannot be thrown across a neighbouring line
          const j = inBase(line, q) ? 0 : this.rng.signed() * Math.min(jitter, 0.15 * d);
          const nx = -dy / d;
          const ny = dx / d;
          line.splice(i + 1, 0, { x: (p.x + q.x) * 0.5 + nx * j, y: (p.y + q.y) * 0.5 + ny * j });
          i++; // the new edge p→mid is shorter; skip past it
        }
      }
      for (let i = 1; i < line.length - 1; i++) {
        const p = line[i] as Point;
        const prev = line[i - 1] as Point;
        if (Math.hypot(p.x - prev.x, p.y - prev.y) < minEdge) {
          line.splice(i, 1);
          i--;
        }
      }
    }
  }
}

/** Strict segment crossing (shared or touching endpoints and collinear overlap do not count). */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Number of crossing segment pairs within and across the field's lines. Zero is the invariant. */
export function countIntersections(field: DifferentialField): number {
  const segs: { a: Point; b: Point; line: number; k: number }[] = [];
  for (let i = 0; i < field.lineCount; i++) {
    const line = field.line(i);
    for (let k = 0; k < line.length - 1; k++) segs.push({ a: line[k] as Point, b: line[k + 1] as Point, line: i, k });
  }
  let n = 0;
  for (let s = 0; s < segs.length; s++) {
    const u = segs[s] as (typeof segs)[number];
    for (let t = s + 1; t < segs.length; t++) {
      const v = segs[t] as (typeof segs)[number];
      if (u.line === v.line && Math.abs(u.k - v.k) <= 1) continue;
      if (crosses(u.a, u.b, v.a, v.b)) n++;
    }
  }
  return n;
}

/** Largest perpendicular distance of any node from the line's chord, as a fraction of chord length. */
export function chordDeviation(line: readonly Point[]): number {
  const h = line[0];
  const t = line[line.length - 1];
  if (!h || !t) return 0;
  const dx = t.x - h.x;
  const dy = t.y - h.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return 0;
  let worst = 0;
  for (const p of line) worst = Math.max(worst, Math.abs((p.x - h.x) * dy - (p.y - h.y) * dx) / len);
  return worst / len;
}
