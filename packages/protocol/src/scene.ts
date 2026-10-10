import { z } from "zod";
import { BEAT_WINDOW_MS, S2_APPROACH_MS, S2_DEPTH_M, S2_DESCENT_MS, S2_DOCK_MS, S2_FAIL_DEPTH_M, S2_PROMPT_DEPTH_M, S5_CONCLUSIVE_MIN } from "./constants";
import { RoleSchema, type Role } from "./role";

/**
 * Scene state for the slice (SLICE_HANDOFF.md §7): the three Episode 1 scenes S2, S5, S7 from
 * `docs/design/ep1-descent.md` §2, as a server-owned state machine. This module holds the
 * TYPES, the option ids that carry rules (which Navigator line reveals, which phrasing is
 * clean), the pure rules (depth from time, whether a trial is conclusive) and the per-role VIEW
 * the server projects. Content (the words) lives with the host; the host also owns the clock and
 * the transitions, because they need `now`, the act and the Navigator's reads.
 *
 * The view is what a client may know. The Navigator's wheel never reaches the others; the
 * Synaesthete never receives stream content; the Theorist sees telemetry and the lines the
 * others chose to send her. DEBT is visible to everyone (design §0); TRUST is not.
 */

export type SceneId = "lobby" | "s2" | "interlude" | "s5" | "s7" | "end";

// ---------------------------------------------------------------------------
// Option ids that carry rules. Texts are host content (apps/party/src/core/ep1.ts).

/** S2, the Navigator's wheel: only `humor-me` asks for the fix without revealing the read. */
export const S2_NAV_LINES = ["humor-me", "i-read-it", "seal-four", "abort"] as const;
export type S2NavLine = (typeof S2_NAV_LINES)[number];
export const S2_NAV_LINE_REVEALS: Record<S2NavLine, boolean> = { "humor-me": false, "i-read-it": true, "seal-four": true, abort: true };

export const S2_SYN_CHOICES = ["silent", "ask-elena", "vouch"] as const;
export type S2SynChoice = (typeof S2_SYN_CHOICES)[number];

export const S2_TOOLS = ["diagnostic", "tighten", "hold-course"] as const;
export type S2Tool = (typeof S2_TOOLS)[number];

/** S5 question ids, five per trial; `kind` shapes the console reply. */
export const S5_QUESTION_KINDS = ["ancient", "self"] as const;
export type S5QuestionKind = (typeof S5_QUESTION_KINDS)[number];

export const S5_CLASSIFICATIONS = ["anomaly", "artifact"] as const;
export type S5Classification = (typeof S5_CLASSIFICATIONS)[number] | "noise";

/** S7, the Theorist's phrasing: only `clean` is "I am here. I am willing." */
export const S7_PHRASINGS = ["clean", "cond-safe", "cond-once"] as const;
export type S7Phrasing = (typeof S7_PHRASINGS)[number];

// ---------------------------------------------------------------------------
// Pure rules

/** The three descent phases, in ms (paced by the host; the view carries the paced values). */
export interface DescentProfile {
  descentMs: number;
  approachMs: number;
  dockMs: number;
}
export const DESCENT_PROFILE: DescentProfile = { descentMs: S2_DESCENT_MS, approachMs: S2_APPROACH_MS, dockMs: S2_DOCK_MS };

interface DescentClock {
  startedAt: number;
  pausedAt: number | null;
  pausedTotal: number;
}

function descentElapsed(now: number, s2: DescentClock): number {
  const paused = s2.pausedTotal + (s2.pausedAt !== null ? Math.max(0, now - s2.pausedAt) : 0);
  return Math.max(0, now - s2.startedAt - paused);
}

/** Depth in metres at room time `now`: piecewise linear through the prompt and fail depths, clamped at the bottom. */
export function descentDepthM(now: number, s2: DescentClock, profile: DescentProfile = DESCENT_PROFILE): number {
  const e = descentElapsed(now, s2);
  const a = profile.descentMs;
  const b = a + profile.approachMs;
  const c = b + profile.dockMs;
  if (e <= a) return (e / a) * S2_PROMPT_DEPTH_M;
  if (e <= b) return S2_PROMPT_DEPTH_M + ((e - a) / profile.approachMs) * (S2_FAIL_DEPTH_M - S2_PROMPT_DEPTH_M);
  if (e <= c) return S2_FAIL_DEPTH_M + ((e - b) / profile.dockMs) * (S2_DEPTH_M - S2_FAIL_DEPTH_M);
  return S2_DEPTH_M;
}

/** Room time at which the descent reaches `depthM`, given no further pauses (the active pause excluded). */
export function descentTimeAt(depthM: number, s2: DescentClock, profile: DescentProfile = DESCENT_PROFILE): number {
  let e: number;
  if (depthM <= S2_PROMPT_DEPTH_M) e = (depthM / S2_PROMPT_DEPTH_M) * profile.descentMs;
  else if (depthM <= S2_FAIL_DEPTH_M) e = profile.descentMs + ((depthM - S2_PROMPT_DEPTH_M) / (S2_FAIL_DEPTH_M - S2_PROMPT_DEPTH_M)) * profile.approachMs;
  else e = profile.descentMs + profile.approachMs + ((Math.min(depthM, S2_DEPTH_M) - S2_FAIL_DEPTH_M) / (S2_DEPTH_M - S2_FAIL_DEPTH_M)) * profile.dockMs;
  return s2.startedAt + s2.pausedTotal + e;
}

/** A trial is conclusive when the Synaesthete's tap landed within the beat tolerance of the commit. */
export function trialConclusive(commitAt: number, synTapAt: number, windowMs: number = BEAT_WINDOW_MS): boolean {
  return Math.abs(synTapAt - commitAt) <= windowMs;
}

/** The S5 verdict the Theorist may enter, or "noise" when too few trials were conclusive. */
export function s5CanClassify(conclusive: number, min: number = S5_CONCLUSIVE_MIN): boolean {
  return conclusive >= min;
}

// ---------------------------------------------------------------------------
// The per-role view (server → client), zod-validated like every other message.

const ms = z.number().finite();

export const LedgerEntrySchema = z.object({
  at: ms,
  kind: z.enum(["system", "window", "act", "cost", "comms", "private"]),
  text: z.string().min(1),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

const option = z.object({ id: z.string().min(1), text: z.string().min(1) });
export type Option = z.infer<typeof option>;

export const S2ViewSchema = z.object({
  attempt: z.number().int().positive(),
  descentStartedAt: ms,
  pausedAt: ms.nullable(),
  pausedTotal: ms,
  descentMs: ms,
  approachMs: ms,
  dockMs: ms,
  prompted: z.boolean(),
  reads: z.number().int().nonnegative(),
  fixed: z.boolean(),
  /** the Theorist's view only: what was said to her, the telemetry and the tools */
  comms: z.array(z.string()).optional(),
  telemetry: z.object({ seal: z.number().int(), differentialKPa: ms, tolerance: z.string() }).optional(),
  tools: z.array(option).optional(),
  tool: z.string().nullable().optional(),
  diagnosticEndsAt: ms.nullable().optional(),
  /** the Navigator's view only */
  lines: z.array(option).optional(),
  line: z.string().nullable().optional(),
  privateQuestion: z.string().nullable().optional(),
  /** the Synaesthete's view only */
  choices: z.array(option).optional(),
  choice: z.string().nullable().optional(),
  /** after the fix: the flare does not fully fade (Synaesthete), the viewport doubles (Navigator) */
  afterFix: z.boolean(),
});

export const S5TrialViewSchema = z.object({
  index: z.number().int(),
  kind: z.enum(["question", "control"]),
  startedAt: ms,
  endsAt: ms,
  /** the moment her mind commits; set in advance (it is a hold), null until she starts one */
  commitAt: ms.nullable(),
  committed: z.boolean(),
  replyAt: ms.nullable(),
  replyKind: z.enum(S5_QUESTION_KINDS).nullable(),
  synTapAt: ms.nullable(),
  synDeltaMs: ms.nullable(),
  conclusive: z.boolean().nullable(),
  navRead: z.boolean(),
  synFocused: z.boolean(),
  done: z.boolean(),
});
export type S5TrialView = z.infer<typeof S5TrialViewSchema>;

export const S5ViewSchema = z.object({
  started: z.boolean(),
  trials: z.array(S5TrialViewSchema),
  current: z.number().int(),
  conclusiveCount: z.number().int().nonnegative(),
  classification: z.enum(["anomaly", "artifact", "noise"]).nullable(),
  /** the Navigator's view only: the wheel for the current trial */
  questions: z.array(option.extend({ kind: z.enum(S5_QUESTION_KINDS) })).optional(),
  holdingQuestion: z.string().nullable().optional(),
  /** the Synaesthete's view only */
  focusing: z.boolean().optional(),
  /** the Theorist's view only */
  canClassify: z.boolean().optional(),
  canAdvance: z.boolean().optional(),
});

export const S7ViewSchema = z.object({
  phase: z.enum(["demo", "phrasing", "act", "between", "reply", "done"]),
  demoStartBeat: z.number().int(),
  demoBeats: z.number().int().positive(),
  window: z.number().int().positive(),
  /** the Theorist's view only */
  phrasings: z.array(option).optional(),
  phrasing: z.string().nullable(),
  /** the current shared run inside the act, 0..beatsRequired */
  run: z.number().int().nonnegative(),
  missed: z.number().int().nonnegative(),
  startBeat: z.number().int().nullable(),
  againAvailable: z.boolean(),
  againUntil: ms.nullable(),
  outcome: z.enum(["clean", "silent", "failed"]).nullable(),
  /** the reply: how far the lights dimmed / the mind-shape brightened */
  dim: ms,
});

export const SceneViewSchema = z.object({
  t: z.literal("scene"),
  id: z.enum(["lobby", "s2", "interlude", "s5", "s7", "end"]),
  enteredAt: ms,
  /** per-human DEBT, visible to all (design §0) */
  debts: z.record(RoleSchema, z.number().int().nonnegative()),
  /** connected roles (lobby and reconnects) */
  present: z.array(RoleSchema),
  /** the Theorist's Ledger: read-only in the slice (§8) */
  log: z.array(LedgerEntrySchema),
  s2: S2ViewSchema.optional(),
  interlude: z.object({ index: z.number().int(), title: z.string(), text: z.string(), until: ms }).optional(),
  s5: S5ViewSchema.optional(),
  s7: S7ViewSchema.optional(),
  end: z.object({ ending: z.enum(["answered", "unanswered"]), classification: z.enum(["anomaly", "artifact", "noise"]).nullable(), consent: z.enum(["clean", "retried", "failed"]) }).optional(),
});
export type SceneView = z.infer<typeof SceneViewSchema>;

/** Timed things that happen to the room, beyond a view change. */
export const SceneEventSchema = z.object({
  t: z.literal("sceneEvent"),
  kind: z.enum(["sealFailed", "sealFixed", "mindCommit", "consoleReply", "lightsReply", "silence", "blackout"]),
  /** room time of the event */
  at: ms,
  /** consoleReply: the reply's shape; lightsReply: the dim amount */
  replyKind: z.enum(S5_QUESTION_KINDS).optional(),
  amount: ms.optional(),
});
export type SceneEvent = z.infer<typeof SceneEventSchema>;

// ---------------------------------------------------------------------------
// Intents (client → server)

const id = z.string().min(1).max(64);

/** A wheel choice. `phase` is for hold-to-commit options (S5): start, then release early = cancel. */
export const ChooseSchema = z.object({
  t: z.literal("choose"),
  cid: id,
  sceneId: z.enum(["lobby", "s2", "interlude", "s5", "s7", "end"]),
  promptId: z.string().min(1).max(32),
  optionId: z.string().min(1).max(32),
  phase: z.enum(["start", "cancel"]).optional(),
});
export type Choose = z.infer<typeof ChooseSchema>;

/** "Go on": begin the dive (lobby), begin the test / next trial (S5), call again (S7). */
export const ContinueSchema = z.object({
  t: z.literal("continue"),
  cid: id,
  sceneId: z.enum(["lobby", "s2", "interlude", "s5", "s7", "end"]),
});
export type Continue = z.infer<typeof ContinueSchema>;

/** Synaesthete overlay focus (S5): a press-and-hold on his screen. */
export const FocusSchema = z.object({
  t: z.literal("focus"),
  cid: id,
  on: z.boolean(),
});
export type Focus = z.infer<typeof FocusSchema>;

export const CallAgainSchema = z.object({
  t: z.literal("callAgain"),
  cid: id,
});
export type CallAgain = z.infer<typeof CallAgainSchema>;

export type RoleRecord<T> = Record<Role, T>;
