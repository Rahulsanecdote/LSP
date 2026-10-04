import type { Rng } from "./rng.js";

/** One-way latency model: normal(mean, sd), clamped to at least 1 ms. */
export interface LinkModel {
  meanMs: number;
  sdMs: number;
}

export function drawLatency(rng: Rng, link: LinkModel): number {
  return Math.max(1, rng.normal(link.meanMs, link.sdMs));
}

/** The three profiles named in the Task 1 done-criteria. */
export const DEFAULT_LINKS: readonly LinkModel[] = [
  { meanMs: 40, sdMs: 15 },
  { meanMs: 120, sdMs: 40 },
  { meanMs: 250, sdMs: 80 },
];
