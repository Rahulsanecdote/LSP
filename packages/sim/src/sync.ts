import { SyncEstimator, type SyncEstimatorOptions } from "@lsp/protocol";
import { drawLatency, type LinkModel } from "./net";
import { Rng } from "./rng";

/**
 * Clock-sync convergence trial (amendment 2, v0.2.1). Feeds the real SyncEstimator with
 * sequential ping/pong exchanges over a link with independent up/down latency draws and
 * returns |estimated − true offset| after each round trip (NaN while not ready).
 */
export function syncTrial(
  seed: number,
  link: LinkModel,
  roundTrips: number,
  trueOffset = 123_456.789,
  estimator: SyncEstimatorOptions = {},
): number[] {
  const rng = new Rng(seed);
  const est = new SyncEstimator(estimator);
  const errors: number[] = [];
  let local = 0;
  for (let i = 0; i < roundTrips; i++) {
    const c0 = local;
    const up = drawLatency(rng, link);
    const s1 = c0 + trueOffset + up;
    const down = drawLatency(rng, link);
    const c1 = c0 + up + down;
    est.pushExchange(c0, s1, c1);
    const e = est.estimate();
    errors.push(e ? Math.abs(e.offset - trueOffset) : Number.NaN);
    local = c1 + 100; // next ping 100 ms later
  }
  return errors;
}

export interface SyncDistribution {
  roundTrips: number;
  seeds: number;
  median: number;
  p95: number;
  max: number;
  /** bucket counts for 0–2, 2–4, … ms */
  histogram: { from: number; to: number; count: number }[];
}

export function summarise(errors: readonly number[], roundTrips: number, bucketMs = 2, maxMs = 40): SyncDistribution {
  const sorted = [...errors].sort((a, b) => a - b);
  const pick = (p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] as number;
  const histogram: SyncDistribution["histogram"] = [];
  for (let from = 0; from < maxMs; from += bucketMs) histogram.push({ from, to: from + bucketMs, count: 0 });
  histogram.push({ from: maxMs, to: Number.POSITIVE_INFINITY, count: 0 });
  for (const e of errors) {
    const i = Math.min(histogram.length - 1, Math.floor(e / bucketMs));
    (histogram[i] as { count: number }).count++;
  }
  return { roundTrips, seeds: errors.length, median: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] ?? Number.NaN, histogram };
}

export function formatSyncDistribution(d: SyncDistribution): string {
  const lines = [`sync error after ${d.roundTrips} round trips over ${d.seeds} seeds: median ${d.median.toFixed(2)} ms, p95 ${d.p95.toFixed(2)} ms, max ${d.max.toFixed(2)} ms`];
  const maxCount = Math.max(1, ...d.histogram.map((b) => b.count));
  for (const b of d.histogram) {
    const label = Number.isFinite(b.to) ? `${String(b.from).padStart(2)}–${String(b.to).padStart(2)}` : `${String(b.from).padStart(2)}+  `;
    lines.push(`  ${label} ms | ${String(b.count).padStart(4)} ${"#".repeat(Math.round((b.count / maxCount) * 40))}`);
  }
  return lines.join("\n");
}
