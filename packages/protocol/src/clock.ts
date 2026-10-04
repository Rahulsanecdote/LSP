import { SYNC_MIN_SAMPLES, SYNC_RTT_REJECT_FACTOR } from "./constants.js";

/**
 * NTP-style clock sync (SLICE_HANDOFF.md §5 "Sync").
 *
 * The client sends `ping { c0 }`, the server answers `pong { c0, s1 }` immediately, and the
 * client notes its receive time `c1`. One round trip yields one sample:
 *
 *     rtt    = c1 − c0
 *     offset = s1 − (c0 + rtt / 2)        // room time ≈ local time + offset
 *
 * The estimator keeps a sliding window of accepted samples, rejects samples whose rtt is
 * more than SYNC_RTT_REJECT_FACTOR × the running median rtt, and reports the median offset
 * once it holds at least SYNC_MIN_SAMPLES. It never reads a clock itself; the caller passes
 * every timestamp in, so the same code runs in the browser, under Vitest and in the sim.
 */

export interface SyncSample {
  /** room time minus client local time, ms */
  offset: number;
  /** round-trip time, ms */
  rtt: number;
}

/** Build one sample from a ping/pong exchange. */
export function offsetSample(c0: number, s1: number, c1: number): SyncSample {
  const rtt = c1 - c0;
  return { rtt, offset: s1 - (c0 + rtt / 2) };
}

/** Median of a non-empty list. Throws on an empty list. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("median of empty list");
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid] as number;
  return ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export interface SyncEstimatorOptions {
  /** samples required before an estimate is reported (default SYNC_MIN_SAMPLES) */
  minSamples?: number;
  /** sliding window length over accepted samples (default 32) */
  maxSamples?: number;
  /** rtt rejection multiple over the running median (default SYNC_RTT_REJECT_FACTOR) */
  rttRejectFactor?: number;
}

export interface SyncEstimate {
  offset: number;
  rtt: number;
  samples: number;
}

export class SyncEstimator {
  private readonly minSamples: number;
  private readonly maxSamples: number;
  private readonly rttRejectFactor: number;
  private readonly accepted: SyncSample[] = [];
  private rejectedCount = 0;

  constructor(opts: SyncEstimatorOptions = {}) {
    this.minSamples = opts.minSamples ?? SYNC_MIN_SAMPLES;
    this.maxSamples = opts.maxSamples ?? 32;
    this.rttRejectFactor = opts.rttRejectFactor ?? SYNC_RTT_REJECT_FACTOR;
    if (this.minSamples < 1 || this.maxSamples < this.minSamples) {
      throw new Error("invalid SyncEstimator options");
    }
  }

  /**
   * Offer a sample. Returns whether it was accepted. Rejection needs a running median, so
   * the first `minSamples` samples are always accepted.
   */
  push(sample: SyncSample): boolean {
    if (!Number.isFinite(sample.offset) || !Number.isFinite(sample.rtt) || sample.rtt < 0) {
      this.rejectedCount++;
      return false;
    }
    if (this.accepted.length >= this.minSamples) {
      const medRtt = median(this.accepted.map((s) => s.rtt));
      if (sample.rtt > this.rttRejectFactor * medRtt) {
        this.rejectedCount++;
        return false;
      }
    }
    this.accepted.push(sample);
    if (this.accepted.length > this.maxSamples) this.accepted.shift();
    return true;
  }

  /** Convenience: push a sample built from a ping/pong exchange. */
  pushExchange(c0: number, s1: number, c1: number): boolean {
    return this.push(offsetSample(c0, s1, c1));
  }

  get ready(): boolean {
    return this.accepted.length >= this.minSamples;
  }

  get rejected(): number {
    return this.rejectedCount;
  }

  /** Current estimate, or undefined until `minSamples` have been accepted. */
  estimate(): SyncEstimate | undefined {
    if (!this.ready) return undefined;
    return {
      offset: median(this.accepted.map((s) => s.offset)),
      rtt: median(this.accepted.map((s) => s.rtt)),
      samples: this.accepted.length,
    };
  }

  /** Convert a client-local timestamp to estimated room time. Throws if not ready. */
  toServer(cLocal: number): number {
    const e = this.estimate();
    if (!e) throw new Error("SyncEstimator not ready");
    return cLocal + e.offset;
  }

  /** Convert a room-time timestamp to estimated client-local time. Throws if not ready. */
  toLocal(sServer: number): number {
    const e = this.estimate();
    if (!e) throw new Error("SyncEstimator not ready");
    return sServer - e.offset;
  }
}
