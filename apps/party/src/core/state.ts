import type { ActState, Role, Schedule } from "@lsp/protocol";

/**
 * Room state (SLICE_HANDOFF.md §5 "State"): one JSON-serialisable object, persisted by the host
 * after every mutation so the room survives reconnects and hibernation.
 *
 * All times are ROOM TIME: ms since the room's persisted wall-clock anchor (see clarification 6).
 */

export interface PlayerRecord {
  cid: string;
  role: Role;
  /** anonymous, stable per room: "p1", "p2", … */
  label: string;
  connected: boolean;
  /** host connection id while connected */
  connId: string | null;
  joinedAt: number;
  taps: number;
  hits: number;
  /** |deltaMs| of the most recent taps, newest last, for the live median */
  recentAbsDeltas: number[];
  /** |auditDeltaMs| of the most recent audited taps, newest last */
  recentAbsAuditDeltas: number[];
  /**
   * (receivedAt − cServerEst) of the most recent taps, newest last. Equals one-way transit
   * minus the client's sync error; with the current median rtt this yields the sync-bias estimate.
   */
  recentTransit: number[];
  /** server-measured round trips for this player's current connection, newest last */
  rttSamples: number[];
}

export interface TapRecord {
  cid: string;
  role: Role;
  cLocal: number;
  /** what was scored */
  cServerEst: number;
  /** room time the server received the tap, for audit (clarification 9) */
  receivedAt: number;
  beatIndex: number;
  deltaMs: number;
  hit: boolean;
  /**
   * Amendment 4: independent audit estimate of the tap instant, `receivedAt − medianRtt/2`
   * using round trips the server measured itself. Null until the connection has an rtt sample.
   * Scoring never uses it; the real-device criterion is read from it.
   */
  auditServerTime: number | null;
  auditDeltaMs: number | null;
}

export interface RoomState {
  version: 1;
  players: Record<string, PlayerRecord>;
  schedule: Schedule | null;
  /** room time the current schedule was last (re)broadcast */
  scheduleIssuedAt: number | null;
  activeAct: ActState | null;
  tapLog: TapRecord[];
  nextLabel: number;
}

export function initialRoomState(): RoomState {
  return {
    version: 1,
    players: {},
    schedule: null,
    scheduleIssuedAt: null,
    activeAct: null,
    tapLog: [],
    nextLabel: 1,
  };
}
