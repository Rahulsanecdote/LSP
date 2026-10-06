/**
 * Timing literals from SLICE_HANDOFF.md §5. These are design law for the slice.
 * Do not widen BEAT_INTERVAL_MS or BEAT_WINDOW_MS to make a test pass; report instead.
 */

/** Beat period. The consent beat is a shared 520 ms rhythm. */
export const BEAT_INTERVAL_MS = 520 as const;

/** ± tolerance around a beat within which a tap counts as a hit. */
export const BEAT_WINDOW_MS = 150 as const;

/** Beats a consent act needs every listed role to hit consecutively. */
export const ACT_BEATS_REQUIRED = 3 as const;

/** Maximum beats an act stays open before it fails (clarification 3, v0.2.1). */
export const ACT_MAX_BEATS = 12;

/**
 * A beat closes for act evaluation this long after its nominal time, so taps delayed by
 * network latency still count. The hit window itself is unchanged (clarification 7).
 */
export const BEAT_CLOSE_GRACE_MS = 600;

/** A Schedule covers this far into the future from the moment it is issued. */
export const SCHEDULE_HORIZON_MS = 30_000;

/** The server re-broadcasts the Schedule this often. */
export const SCHEDULE_REBROADCAST_MS = 20_000;

/** Clients re-run a clock sync burst this often. */
export const SYNC_INTERVAL_MS = 10_000;

/** Accepted samples the estimator needs before it reports an offset. */
export const SYNC_MIN_SAMPLES = 4;

/**
 * Round trips per sync burst. Eight rather than the minimum four so each burst also yields
 * seven server-measured round trips for the audit column (amendment 4); the first burst alone
 * would otherwise leave the audit on a three-sample rtt for ten seconds.
 */
export const SYNC_BURST = 8;

/** Sliding window of accepted sync samples (amendment 5). */
export const SYNC_WINDOW = 24;

/** Samples whose rtt exceeds this multiple of the running median rtt are rejected. */
export const SYNC_RTT_REJECT_FACTOR = 2;

// ---------------------------------------------------------------------------
// Task 2 — the Navigator's read (SLICE_HANDOFF.md §6, amendment 6)

/** Projected dive time beyond which streams run into black. Literal. */
export const HORIZON_MS = 90_000;

/** Projected ms per held ms when a BranchSet does not say otherwise: the horizon at 6 s of hold. */
export const PROJECTION_RATE_DEFAULT = 15;

/** DEBT for a read released inside the horizon. */
export const READ_DEBT = 1;

/** DEBT for a read released past the horizon ("double debt"). */
export const READ_DEBT_PAST_HORIZON = 2;

/** Streams grow over this long on a hold. */
export const STREAM_GROW_MS = 600;
