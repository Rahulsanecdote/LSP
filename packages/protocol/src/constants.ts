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

// ---------------------------------------------------------------------------
// Task 3 — scenes S2, S5, S7 (SLICE_HANDOFF.md §7; content in docs/design/ep1-descent.md §2).
// Durations marked "paced" are divided by the host's SCENE_PACE (a wrangler var the Playwright
// run sets); nothing a client sends can change them.

/**
 * S2: the descent is three phases (all paced): fast to the reflex prompt depth, then a slow
 * approach to where the seal would fail (the crew's window to read, speak and decide), then
 * docking. The design doc's twelve-minute scene gives the approach about twenty seconds; the
 * slice keeps that window at forty with the rest compressed.
 */
export const S2_DESCENT_MS = 120_000;
export const S2_APPROACH_MS = 40_000;
export const S2_DOCK_MS = 60_000;
export const S2_DEPTH_M = 1500;
/** the Navigator's reflex prompt depth */
export const S2_PROMPT_DEPTH_M = 1380;
/** where the seal fails if nobody acted */
export const S2_FAIL_DEPTH_M = 1420;
/** the Theorist's diagnostic: descent paused this long, then fixed (paced) */
export const S2_DIAGNOSTIC_MS = 30_000;
/** each interlude card (S3, S4 are not played) stays up this long (paced) */
export const INTERLUDE_MS = 8_000;

/** S5: a trial times out this long after it opens */
export const S5_TRIAL_MS = 15_000;
/** the Navigator commits by holding a question this long; the server knows the commit in advance */
export const S5_COMMIT_HOLD_MS = 1_000;
/** the console reply precedes the commit by this much, per trial (the 0.3 second) */
export const S5_REPLY_LEAD_MS: readonly number[] = [300, 460, 300];
/** control trial: the moment she would have decided, after the trial opens */
export const S5_CONTROL_DECIDE_MS = 5_000;
export const S5_TRIALS = 3;
/** trials that must be conclusive for the Theorist to classify (else "noise") */
export const S5_CONCLUSIVE_MIN = 2;

/** S7: the Ancient's demonstration, in beats (pulse–pause–pulse, repeated) */
export const S7_DEMO_BEATS = 9;
/** a consent window closes on this many missed beats (design: "three misses") */
export const S7_MAX_MISSES = 3;
/** windows the crew gets: the first, then one "again" */
export const S7_WINDOWS = 2;
/** the Synaesthete has this long to call "again" after a failed window */
export const S7_AGAIN_MS = 20_000;
/** DEBT charged to every human when the act fires */
export const ACT_DEBT = 1;
/** TRUST on a clean beat with the clean phrasing */
export const S7_TRUST_CLEAN = 3;
/** how far the lights dim, and the Navigator's mind-shape brightens, on the reply (0..1) */
export const S7_REPLY_DIM = 0.35;
