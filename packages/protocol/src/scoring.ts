import type { Schedule } from "./messages.js";

/**
 * Tap scoring (SLICE_HANDOFF.md §5 "Scoring").
 *
 *     beatIndex = floor((serverTime − epoch) / interval + 0.5)
 *     deltaMs   = serverTime − (epoch + beatIndex · interval)
 *     hit       = |deltaMs| ≤ windowMs
 *
 * Tie-break (clarification 4, v0.2.1): a tap exactly halfway between two beats
 * (|delta| = interval / 2 = 260 ms) belongs to the LATER beat, on both sides. `floor(x + 0.5)`
 * gives that consistently; `Math.round` would too in JS, but the formula is written out so the
 * rule is visible rather than inherited from a library's rounding mode.
 */

export interface BeatScore {
  beatIndex: number;
  deltaMs: number;
  hit: boolean;
}

/** Room time of beat `index` under `schedule`. */
export function beatTime(schedule: Pick<Schedule, "epoch" | "interval">, index: number): number {
  return schedule.epoch + index * schedule.interval;
}

/** Index of the beat nearest to `serverTime`; ties go to the later beat. May be negative. */
export function nearestBeatIndex(
  schedule: Pick<Schedule, "epoch" | "interval">,
  serverTime: number,
): number {
  return Math.floor((serverTime - schedule.epoch) / schedule.interval + 0.5);
}

/**
 * Score a tap at `serverTime` (room time) against `schedule`.
 * Returns null when the tap falls outside the schedule: nearest beat before beat 0, or
 * serverTime past `until`. Such taps are not scored at all.
 */
export function scoreTap(schedule: Schedule, serverTime: number): BeatScore | null {
  if (!Number.isFinite(serverTime)) return null;
  if (serverTime > schedule.until) return null;
  const beatIndex = nearestBeatIndex(schedule, serverTime);
  if (beatIndex < 0) return null;
  const deltaMs = serverTime - beatTime(schedule, beatIndex);
  return { beatIndex, deltaMs, hit: Math.abs(deltaMs) <= schedule.windowMs };
}
