import { ACT_BEATS_REQUIRED, ACT_MAX_BEATS } from "./constants";
import type { ActResult, PerRoleResult, Role } from "./messages";
import { ROLES } from "./messages";

/**
 * Consent act (SLICE_HANDOFF.md §5 "Consent act", clarified in v0.2.1 §3 and §7).
 *
 * - The run is SHARED: a miss by any listed role on a beat resets everyone's run.
 * - A listed role that does not tap on a beat has missed it (decided when the beat closes).
 * - The act is `ok` as soon as the last `beatsRequired` CLOSED beats were all-hit.
 * - The act fails once `maxBeats` beats have closed without that happening.
 * - Taps count only from the participants recorded at actStart (by cid) and only for listed
 *   roles. A participant who reconnects keeps its cid, so reconnect never resets anyone.
 * - A tap on a beat that has already closed is ignored: the miss stands and the tap is never
 *   reassigned to another beat.
 *
 * Pure reducer: every function returns a new state and never reads a clock. The host decides
 * WHEN a beat closes (beatTime + BEAT_CLOSE_GRACE_MS) and calls `closeBeat`.
 */

export type BeatOutcome = "hit" | "miss";

export interface ActBeat {
  /** per listed role: outcome once known */
  outcomes: Partial<Record<Role, BeatOutcome>>;
  /** deltas of counted taps on this beat, per role */
  deltas: Partial<Record<Role, number>>;
  closed: boolean;
}

export interface ActParticipant {
  cid: string;
  role: Role;
}

export interface ActState {
  actId: string;
  roles: readonly Role[];
  participants: readonly ActParticipant[];
  startBeat: number;
  beatsRequired: number;
  maxBeats: number;
  /** beats keyed by beatIndex (as string, for JSON round-tripping) */
  beats: Readonly<Record<string, ActBeat>>;
  /** next beat index the host must close; beats close strictly in order */
  nextToClose: number;
}

export interface ActTap {
  cid: string;
  role: Role;
  beatIndex: number;
  deltaMs: number;
  hit: boolean;
}

export type ActStatus = "open" | "ok" | "failed";

export interface StartActInput {
  actId: string;
  roles: readonly Role[];
  /** first beat that counts */
  startBeat: number;
  /** players present when the act opened; later joiners are ignored */
  participants: readonly ActParticipant[];
  beatsRequired?: number;
  maxBeats?: number;
}

export function startAct(input: StartActInput): ActState {
  const roles = [...new Set(input.roles)];
  if (roles.length === 0) throw new Error("act needs at least one role");
  const beatsRequired = input.beatsRequired ?? ACT_BEATS_REQUIRED;
  const maxBeats = input.maxBeats ?? ACT_MAX_BEATS;
  if (beatsRequired < 1 || maxBeats < beatsRequired) throw new Error("invalid act lengths");
  return {
    actId: input.actId,
    roles,
    participants: input.participants.filter((p) => roles.includes(p.role)),
    startBeat: input.startBeat,
    beatsRequired,
    maxBeats,
    beats: {},
    nextToClose: input.startBeat,
  };
}

function inRange(state: ActState, beatIndex: number): boolean {
  return beatIndex >= state.startBeat && beatIndex < state.startBeat + state.maxBeats;
}

function getBeat(state: ActState, beatIndex: number): ActBeat {
  return state.beats[String(beatIndex)] ?? { outcomes: {}, deltas: {}, closed: false };
}

function withBeat(state: ActState, beatIndex: number, beat: ActBeat): ActState {
  return { ...state, beats: { ...state.beats, [String(beatIndex)]: beat } };
}

export type TapDisposition =
  | "counted"
  | "notParticipant"
  | "roleNotListed"
  | "outOfRange"
  | "beatClosed"
  | "duplicate";

/** Apply a scored tap. Returns the new state and why the tap did or did not count. */
export function applyTap(
  state: ActState,
  tap: ActTap,
): { state: ActState; disposition: TapDisposition } {
  if (!state.roles.includes(tap.role)) return { state, disposition: "roleNotListed" };
  const isParticipant = state.participants.some((p) => p.cid === tap.cid && p.role === tap.role);
  if (!isParticipant) return { state, disposition: "notParticipant" };
  if (!inRange(state, tap.beatIndex)) return { state, disposition: "outOfRange" };
  const beat = getBeat(state, tap.beatIndex);
  if (beat.closed) return { state, disposition: "beatClosed" };
  if (beat.outcomes[tap.role] !== undefined) return { state, disposition: "duplicate" };
  const next: ActBeat = {
    closed: false,
    outcomes: { ...beat.outcomes, [tap.role]: tap.hit ? "hit" : "miss" },
    deltas: { ...beat.deltas, [tap.role]: tap.deltaMs },
  };
  return { state: withBeat(state, tap.beatIndex, next), disposition: "counted" };
}

/**
 * Close `beatIndex`: every listed role without an outcome has missed it. Beats must close in
 * order; closing a beat other than `nextToClose` is a host bug and throws.
 */
export function closeBeat(state: ActState, beatIndex: number): ActState {
  if (beatIndex !== state.nextToClose) {
    throw new Error(`act ${state.actId}: expected to close beat ${state.nextToClose}, got ${beatIndex}`);
  }
  if (!inRange(state, beatIndex)) return state;
  const beat = getBeat(state, beatIndex);
  const outcomes: Partial<Record<Role, BeatOutcome>> = { ...beat.outcomes };
  for (const role of state.roles) outcomes[role] ??= "miss";
  const closed = withBeat(state, beatIndex, { ...beat, outcomes, closed: true });
  return { ...closed, nextToClose: beatIndex + 1 };
}

function beatAllHit(state: ActState, beat: ActBeat): boolean {
  return state.roles.every((r) => beat.outcomes[r] === "hit");
}

/** Length of the current shared run: consecutive all-hit closed beats ending at the last closed beat. */
export function currentRun(state: ActState): number {
  let run = 0;
  for (let i = state.nextToClose - 1; i >= state.startBeat; i--) {
    const beat = state.beats[String(i)];
    if (!beat || !beat.closed || !beatAllHit(state, beat)) break;
    run++;
  }
  return run;
}

export function closedBeats(state: ActState): number {
  return state.nextToClose - state.startBeat;
}

export function evaluate(state: ActState): ActStatus {
  if (currentRun(state) >= state.beatsRequired) return "ok";
  if (closedBeats(state) >= state.maxBeats) return "failed";
  return "open";
}

/** Build the ActResult for the act's current state. `perRole` is filled for every role. */
export function actResult(state: ActState, ok: boolean): ActResult {
  const perRole = {} as Record<Role, PerRoleResult>;
  for (const role of ROLES) perRole[role] = { hits: 0, deltas: [] };
  for (let i = state.startBeat; i < state.nextToClose; i++) {
    const beat = state.beats[String(i)];
    if (!beat) continue;
    for (const role of state.roles) {
      if (beat.outcomes[role] === "hit") perRole[role].hits++;
      const d = beat.deltas[role];
      if (d !== undefined) perRole[role].deltas.push(d);
    }
  }
  return { t: "actResult", actId: state.actId, ok, perRole };
}
