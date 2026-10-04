import type { RoomState, TapRecord } from "@lsp/party";
import { BEAT_INTERVAL_MS, BEAT_WINDOW_MS, ROLES, beatTime, median, type Role } from "@lsp/protocol";
import { SimClient } from "./client.js";
import { DEFAULT_LINKS, type LinkModel } from "./net.js";
import { Rng } from "./rng.js";
import { SimServer } from "./server.js";
import { Sim } from "./sim.js";

export interface ClientProfile {
  link: LinkModel;
  /** client clock offset from room time; defaults to a random value in ±1 h */
  trueOffset?: number;
  role?: Role;
}

export interface StallSpec {
  clientIndex: number;
  /** sim time the stall begins */
  atMs: number;
  durationMs: number;
}

export interface SpreadConfig {
  seed: number;
  clients: ClientProfile[];
  /** number of beats to measure (beats on which every client tapped) */
  beats: number;
  humanSdMs: number;
  stall?: StallSpec;
  /** spread threshold, defaults to BEAT_WINDOW_MS (150) */
  thresholdMs?: number;
  /** required fraction of measured beats under the threshold, default 0.9 */
  requiredFraction?: number;
}

export interface HistogramBucket {
  from: number;
  /** exclusive, Infinity for the last bucket */
  to: number;
  count: number;
}

export interface ClientReport {
  cid: string;
  role: Role;
  link: LinkModel;
  trueOffset: number;
  /** estimated − true offset at the end of the run */
  syncErrorMs: number;
  taps: number;
  hits: number;
  meanDeltaMs: number;
  medianAbsDeltaMs: number;
  reconnects: number;
}

export interface BeatRow {
  beatIndex: number;
  /** server-measured deltaMs per client (from cServerEst), in client order */
  deltas: number[];
  spread: number;
  /** ground-truth delta per client: true room time of the tap minus the beat */
  trueDeltas: number[];
  trueSpread: number;
}

export interface SpreadReport {
  config: SpreadConfig;
  thresholdMs: number;
  requiredFraction: number;
  firstMeasuredBeat: number;
  rows: BeatRow[];
  spreads: number[];
  fractionUnder: number;
  p50: number;
  p90: number;
  max: number;
  histogram: HistogramBucket[];
  /**
   * Ground truth. Scoring trusts cServerEst, and a client renders the beat and stamps its tap
   * from the same offset estimate, so its sync error cancels out of deltaMs. The server-measured
   * spread above is therefore blind to clock-sync error; this one is not.
   */
  trueSpreads: number[];
  trueFractionUnder: number;
  trueP50: number;
  trueP90: number;
  trueMax: number;
  trueHistogram: HistogramBucket[];
  clients: ClientReport[];
  pass: boolean;
  /** virtual ms simulated */
  simulatedMs: number;
  /** full tap log for further analysis */
  tapLog: readonly TapRecord[];
  /** the simulated clients, for scenario-specific assertions */
  sims: readonly SimClient[];
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] as number;
}

export function histogram(values: readonly number[], bucketMs = 25, maxMs = 300): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  for (let from = 0; from < maxMs; from += bucketMs) buckets.push({ from, to: from + bucketMs, count: 0 });
  buckets.push({ from: maxMs, to: Number.POSITIVE_INFINITY, count: 0 });
  for (const v of values) {
    const i = Math.min(buckets.length - 1, Math.floor(v / bucketMs));
    (buckets[i] as HistogramBucket).count++;
  }
  return buckets;
}

/**
 * Run N simulated clients against one RoomCore for M measured beats and report the
 * cross-client spread (max − min of server-measured deltaMs) per beat.
 */
export function runSpread(config: SpreadConfig): SpreadReport {
  const thresholdMs = config.thresholdMs ?? BEAT_WINDOW_MS;
  const requiredFraction = config.requiredFraction ?? 0.9;
  const rng = new Rng(config.seed);
  const sim = new Sim();
  const server = new SimServer(sim);

  const sims = config.clients.map((profile, i) => {
    const trueOffset = profile.trueOffset ?? Math.round((rng.next() - 0.5) * 7_200_000);
    return new SimClient(sim, server, {
      cid: `c${i + 1}`,
      role: profile.role ?? (ROLES[i % ROLES.length] as Role),
      link: profile.link,
      trueOffset,
      humanSdMs: config.humanSdMs,
      rng: rng.fork(),
    });
  });

  // stagger connects a little, like people opening the page one after another
  sims.forEach((c, i) => sim.schedule(i * 300, () => c.connect()));
  if (config.stall) {
    const target = sims[config.stall.clientIndex];
    if (!target) throw new Error("stall.clientIndex out of range");
    const { durationMs } = config.stall;
    sim.schedule(config.stall.atMs, () => target.stall(durationMs));
  }

  // Run until enough full beats exist. Generous bound so a broken sim fails rather than hangs.
  const n = sims.length;
  const maxMs = 10_000 + (config.beats + 40) * BEAT_INTERVAL_MS + (config.stall?.durationMs ?? 0) * 4;
  let rows: BeatRow[] = [];
  let firstMeasuredBeat = -1;
  let t = 0;
  while (t < maxMs) {
    t += BEAT_INTERVAL_MS * 5;
    sim.run(t);
    ({ rows, firstMeasuredBeat } = collectRows(server.core.state, sims, config.beats));
    if (rows.length >= config.beats) break;
  }
  // let the last taps land
  sim.run(t + 2000);
  ({ rows, firstMeasuredBeat } = collectRows(server.core.state, sims, config.beats));

  const spreads = rows.map((r) => r.spread);
  const sorted = [...spreads].sort((a, b) => a - b);
  const under = spreads.filter((s) => s < thresholdMs).length;
  const fractionUnder = spreads.length ? under / spreads.length : 0;
  const trueSpreads = rows.map((r) => r.trueSpread);
  const trueSorted = [...trueSpreads].sort((a, b) => a - b);
  const trueUnder = trueSpreads.filter((s) => s < thresholdMs).length;
  const trueFractionUnder = trueSpreads.length ? trueUnder / trueSpreads.length : 0;

  const clients: ClientReport[] = sims.map((c, i) => {
    const taps = server.core.state.tapLog.filter((r) => r.cid === c.cid);
    const deltas = taps.map((r) => r.deltaMs);
    const est = c.estimator.estimate();
    const profile = config.clients[i] as ClientProfile;
    return {
      cid: c.cid,
      role: c.role,
      link: profile.link,
      trueOffset: -c.localNow() + sim.now, // = -trueOffset; shown as offset to add to local
      syncErrorMs: est ? est.offset - (sim.now - c.localNow()) : Number.NaN,
      taps: taps.length,
      hits: taps.filter((r) => r.hit).length,
      meanDeltaMs: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : Number.NaN,
      medianAbsDeltaMs: deltas.length ? median(deltas.map(Math.abs)) : Number.NaN,
      reconnects: c.reconnects,
    };
  });

  return {
    config,
    thresholdMs,
    requiredFraction,
    firstMeasuredBeat,
    rows,
    spreads,
    fractionUnder,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted.length ? (sorted[sorted.length - 1] as number) : Number.NaN,
    histogram: histogram(spreads),
    trueSpreads,
    trueFractionUnder,
    trueP50: percentile(trueSorted, 0.5),
    trueP90: percentile(trueSorted, 0.9),
    trueMax: trueSorted.length ? (trueSorted[trueSorted.length - 1] as number) : Number.NaN,
    trueHistogram: histogram(trueSpreads),
    clients,
    pass: rows.length >= config.beats && fractionUnder >= requiredFraction && n > 0,
    simulatedMs: sim.now,
    tapLog: server.core.state.tapLog,
    sims,
  };
}

/** Group the tap log by beat; keep beats where every client tapped (first tap per client). */
function collectRows(
  state: RoomState,
  sims: readonly SimClient[],
  beats: number,
): { rows: BeatRow[]; firstMeasuredBeat: number } {
  const schedule = state.schedule;
  if (!schedule) return { rows: [], firstMeasuredBeat: -1 };
  const truthOf = new Map(sims.map((c) => [c.cid, c.truth]));
  const byBeat = new Map<number, Map<string, { delta: number; trueDelta: number }>>();
  for (const r of state.tapLog) {
    let m = byBeat.get(r.beatIndex);
    if (!m) byBeat.set(r.beatIndex, (m = new Map()));
    if (!m.has(r.cid)) {
      const trueTime = truthOf.get(r.cid)?.get(r.cServerEst);
      if (trueTime === undefined) throw new Error(`no ground truth for tap ${r.cid}@${r.cServerEst}`);
      m.set(r.cid, { delta: r.deltaMs, trueDelta: trueTime - beatTime(schedule, r.beatIndex) });
    }
  }
  const indices = [...byBeat.keys()].sort((a, b) => a - b);
  const rows: BeatRow[] = [];
  let first = -1;
  for (const b of indices) {
    const m = byBeat.get(b) as Map<string, { delta: number; trueDelta: number }>;
    if (m.size < sims.length) {
      if (first === -1) continue; // still warming up
      continue; // a beat someone skipped (e.g. during a stall) is not measured
    }
    if (first === -1) first = b;
    const cells = sims.map((c) => m.get(c.cid) as { delta: number; trueDelta: number });
    const deltas = cells.map((x) => x.delta);
    const trueDeltas = cells.map((x) => x.trueDelta);
    rows.push({
      beatIndex: b,
      deltas,
      spread: Math.max(...deltas) - Math.min(...deltas),
      trueDeltas,
      trueSpread: Math.max(...trueDeltas) - Math.min(...trueDeltas),
    });
    if (rows.length >= beats) break;
  }
  return { rows, firstMeasuredBeat: first };
}

/** The done-criterion configuration: 3 clients on the three default links, 60 beats, human sd 40 ms. */
export function criterionConfig(seed = 1, beats = 60, clients = 3): SpreadConfig {
  return {
    seed,
    beats,
    humanSdMs: 40,
    clients: Array.from({ length: clients }, (_, i) => ({ link: DEFAULT_LINKS[i % DEFAULT_LINKS.length] as LinkModel })),
  };
}

export function formatReport(r: SpreadReport): string {
  const lines: string[] = [];
  lines.push(
    `spread: ${r.rows.length} beats measured from beat ${r.firstMeasuredBeat}, ` +
      `${r.sims.length} clients, human sd ${r.config.humanSdMs} ms, seed ${r.config.seed}, ` +
      `${(r.simulatedMs / 1000).toFixed(1)} s simulated`,
  );
  for (const c of r.clients) {
    lines.push(
      `  ${c.cid} ${c.role.padEnd(11)} link ${String(c.link.meanMs).padStart(3)}±${String(c.link.sdMs).padEnd(3)} ms ` +
        `taps ${String(c.taps).padStart(3)} hits ${String(c.hits).padStart(3)} ` +
        `mean Δ ${c.meanDeltaMs.toFixed(1).padStart(6)} ms  median |Δ| ${c.medianAbsDeltaMs.toFixed(1).padStart(5)} ms  ` +
        `sync err ${c.syncErrorMs.toFixed(1).padStart(6)} ms` +
        (c.reconnects ? `  reconnects ${c.reconnects}` : ""),
    );
  }
  const hist = (title: string, buckets: readonly HistogramBucket[], p50: number, p90: number, max: number, frac: number): void => {
    lines.push(`  ${title}`);
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    for (const b of buckets) {
      const label = Number.isFinite(b.to) ? `${String(b.from).padStart(3)}–${String(b.to).padStart(3)}` : `${String(b.from).padStart(3)}+   `;
      const bar = "#".repeat(Math.round((b.count / maxCount) * 40));
      lines.push(`  ${label} ms | ${String(b.count).padStart(3)} ${bar}`);
    }
    lines.push(
      `  p50 ${p50.toFixed(0)} ms   p90 ${p90.toFixed(0)} ms   max ${max.toFixed(0)} ms   ` +
        `< ${r.thresholdMs} ms on ${(frac * 100).toFixed(1)}% of beats (need ≥ ${(r.requiredFraction * 100).toFixed(0)}%)`,
    );
  };
  hist("per-beat spread, server-measured (max − min of deltaMs from cServerEst) — the §5 criterion:", r.histogram, r.p50, r.p90, r.max, r.fractionUnder);
  hist("per-beat spread, ground truth (true tap instants; includes clock-sync error, which cancels out of the server view):", r.trueHistogram, r.trueP50, r.trueP90, r.trueMax, r.trueFractionUnder);
  lines.push(`  ${r.pass ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}
