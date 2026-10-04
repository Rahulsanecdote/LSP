import {
  ACT_BEATS_REQUIRED,
  BEAT_CLOSE_GRACE_MS,
  actResult,
  applyTap,
  beatTime,
  closeBeat,
  evaluate,
  median,
  nearestBeatIndex,
  parseClientMessage,
  scoreTap,
  startAct,
  type ActStart,
  type BeatSpread,
  type ClientMessage,
  type ClientStats,
  type Hello,
  type Ping,
  type Role,
  type ServerMessage,
  type Snapshot,
  type Tap,
} from "@lsp/protocol";
import { issueSchedule, nextScheduleAt, scheduleDue } from "./beat";
import { initialRoomState, type PlayerRecord, type RoomState, type TapRecord } from "./state";

/**
 * RoomCore: the whole room, as a host-independent state machine.
 *
 * The PartyKit server, the sim and the unit tests all drive the same class. It never reads a
 * clock or touches a socket: the host injects `now()` (room time) and delivers the `Outbound`
 * messages it returns. Every mutation is applied to `state`, which the host persists.
 */

export type Target =
  | { kind: "conn"; connId: string }
  | { kind: "room" }
  | { kind: "others"; connId: string };

export interface Outbound {
  to: Target;
  msg: ServerMessage;
}

export interface RoomCoreOptions {
  /** room time, ms */
  now: () => number;
  /** keep at most this many taps in the log (default 500) */
  tapLogCap?: number;
  /** |delta| samples per player kept for the live median (default 50) */
  recentDeltaCap?: number;
  /** server-measured rtt samples kept per connection (default 24) */
  rttCap?: number;
  /** beats carried in `stats.recentBeats` (default 20) */
  recentBeatsCap?: number;
}

export class RoomCore {
  private readonly now: () => number;
  private readonly tapLogCap: number;
  private readonly recentDeltaCap: number;
  private readonly rttCap: number;
  private readonly recentBeatsCap: number;
  private _state: RoomState;
  private _dirty = false;
  private _lastError: string | null = null;

  constructor(opts: RoomCoreOptions, state: RoomState = initialRoomState()) {
    this.now = opts.now;
    this.tapLogCap = opts.tapLogCap ?? 500;
    this.recentDeltaCap = opts.recentDeltaCap ?? 50;
    this.rttCap = opts.rttCap ?? 24;
    this.recentBeatsCap = opts.recentBeatsCap ?? 20;
    this._state = state;
  }

  get state(): RoomState {
    return this._state;
  }

  /** True when state changed since the host last called `markPersisted()`. */
  get dirty(): boolean {
    return this._dirty;
  }

  markPersisted(): void {
    this._dirty = false;
  }

  /** Last rejected inbound frame, for host logging. */
  get lastError(): string | null {
    return this._lastError;
  }

  private touch(): void {
    this._dirty = true;
  }

  // -------------------------------------------------------------------------
  // Host events

  /** A socket opened. The client has not identified itself yet; send it the schedule. */
  onConnect(connId: string): Outbound[] {
    const out: Outbound[] = [];
    out.push(...this.ensureSchedule({ kind: "conn", connId }));
    return out;
  }

  /** A socket closed. */
  onClose(connId: string): Outbound[] {
    const player = this.playerByConn(connId);
    if (!player) return [];
    player.connected = false;
    player.connId = null;
    this.touch();
    return [this.statsMessage()];
  }

  /** A raw inbound frame (string or parsed JSON). Invalid frames are dropped. */
  onMessage(connId: string, raw: unknown): Outbound[] {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this._lastError = parsed.error;
      return [];
    }
    return this.dispatch(connId, parsed.msg);
  }

  /**
   * Timer event. The host calls this at `nextWakeAt()` (and may call it any time; it is
   * idempotent). Re-broadcasts the schedule when due and closes act beats that are past their
   * grace period.
   */
  tick(): Outbound[] {
    const out: Outbound[] = [];
    const now = this.now();
    if (this._state.schedule && scheduleDue(now, this._state.scheduleIssuedAt)) {
      out.push(...this.ensureSchedule({ kind: "room" }, true));
    }
    out.push(...this.closeDueBeats(now));
    return out;
  }

  /** Room time of the next event `tick()` needs to handle, or null if nothing is pending. */
  nextWakeAt(): number | null {
    const candidates: number[] = [];
    const s = nextScheduleAt(this._state.scheduleIssuedAt);
    if (s !== null && this._state.schedule) candidates.push(s);
    const act = this._state.activeAct;
    if (act && this._state.schedule) {
      candidates.push(beatTime(this._state.schedule, act.nextToClose) + BEAT_CLOSE_GRACE_MS);
    }
    return candidates.length ? Math.min(...candidates) : null;
  }

  // -------------------------------------------------------------------------
  // Scene / host API

  /**
   * Open a consent act for `roles`. Participants are the connected players holding those roles
   * right now (first-joined wins if a role is duplicated). Ignored while an act is active or
   * before any schedule exists.
   */
  startAct(actId: string, roles: readonly Role[]): Outbound[] {
    const schedule = this._state.schedule;
    if (!schedule || this._state.activeAct) return [];
    const now = this.now();
    // first beat whose hit window has not yet opened
    const startBeat = nearestBeatIndex(schedule, now + schedule.windowMs) + 1;
    const wanted = new Set(roles);
    const participants = Object.values(this._state.players)
      .filter((p) => p.connected && wanted.has(p.role))
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .filter((p, i, arr) => arr.findIndex((q) => q.role === p.role) === i)
      .map((p) => ({ cid: p.cid, role: p.role }));
    this._state.activeAct = startAct({ actId, roles, startBeat, participants });
    this.touch();
    const msg: ActStart = { t: "actStart", actId, beatsRequired: ACT_BEATS_REQUIRED, roles: [...new Set(roles)] };
    return [{ to: { kind: "room" }, msg }];
  }

  // -------------------------------------------------------------------------
  // Internals

  private dispatch(connId: string, msg: ClientMessage): Outbound[] {
    switch (msg.t) {
      case "hello":
        return this.onHello(connId, msg);
      case "ping":
        return this.onPing(connId, msg);
      case "tap":
        return this.onTap(connId, msg);
      case "actStart":
        return this.startAct(msg.actId, msg.roles);
    }
  }

  private onHello(connId: string, hello: Hello): Outbound[] {
    const now = this.now();
    let player = this._state.players[hello.cid];
    if (!player) {
      player = {
        cid: hello.cid,
        role: hello.role,
        label: `p${this._state.nextLabel++}`,
        connected: true,
        connId,
        joinedAt: now,
        taps: 0,
        hits: 0,
        recentAbsDeltas: [],
        recentAbsAuditDeltas: [],
        recentTransit: [],
        rttSamples: [],
      };
      this._state.players[hello.cid] = player;
    } else {
      // reconnect: same cid keeps its label, stats and any act participation; the round-trip
      // samples belong to the old socket and start over
      player.connected = true;
      player.connId = connId;
      player.role = hello.role;
      player.rttSamples = [];
    }
    this.touch();
    const out: Outbound[] = [];
    out.push(...this.ensureSchedule({ kind: "conn", connId }));
    out.push({ to: { kind: "conn", connId }, msg: this.snapshot(player) });
    out.push(this.statsMessage());
    return out;
  }

  private onPing(connId: string, ping: Ping): Outbound[] {
    // Answer immediately. s1 is both receive and send time: same tick.
    const now = this.now();
    // Amendment 4: a ping sent in immediate reply to our pong at `prev` closes a round trip the
    // server measured itself, free of any client clock.
    const player = this._state.players[ping.cid];
    if (player && player.connId === connId && ping.prev !== undefined) {
      const rtt = now - ping.prev;
      if (rtt >= 0 && rtt < 60_000) {
        player.rttSamples.push(rtt);
        if (player.rttSamples.length > this.rttCap) player.rttSamples.shift();
        this.touch();
      }
    }
    return [{ to: { kind: "conn", connId }, msg: { t: "pong", cid: ping.cid, c0: ping.c0, s1: now } }];
  }

  /**
   * Server's estimate of a player's clock-sync error, sign such that `deltaMs + bias` is the
   * sync-corrected delta: median(receivedAt − cServerEst) over recent taps minus half the CURRENT
   * median rtt. Using the current rtt for every tap keeps early, few-sample rtt readings from
   * being frozen into the estimate. Null until there is an rtt and a tap.
   */
  syncBiasOf(player: PlayerRecord): number | null {
    const rtt = this.rttOf(player);
    if (rtt === null || player.recentTransit.length === 0) return null;
    return median(player.recentTransit) - rtt / 2;
  }

  /** Server-measured median round trip for a player's current connection, or null. */
  private rttOf(player: PlayerRecord): number | null {
    return player.rttSamples.length ? median(player.rttSamples) : null;
  }

  private onTap(connId: string, tap: Tap): Outbound[] {
    const schedule = this._state.schedule;
    const player = this._state.players[tap.cid];
    if (!schedule || !player) return [];
    const receivedAt = this.now();
    // §5 "Scoring": trust the client's estimate, which was derived from our pongs; keep the
    // server receive time alongside it for audit.
    const score = scoreTap(schedule, tap.cServerEst);
    if (!score) return [];
    // Amendment 4: independent audit estimate of when the tap happened, from our own clock and
    // our own rtt measurements. Compared against the SAME beat the tap was scored to.
    const rtt = this.rttOf(player);
    const auditServerTime = rtt === null ? null : receivedAt - rtt / 2;
    const auditDeltaMs = auditServerTime === null ? null : auditServerTime - beatTime(schedule, score.beatIndex);

    const record: TapRecord = {
      cid: tap.cid,
      role: tap.role,
      cLocal: tap.cLocal,
      cServerEst: tap.cServerEst,
      receivedAt,
      beatIndex: score.beatIndex,
      deltaMs: score.deltaMs,
      hit: score.hit,
      auditServerTime,
      auditDeltaMs,
    };
    this._state.tapLog.push(record);
    if (this._state.tapLog.length > this.tapLogCap) {
      this._state.tapLog.splice(0, this._state.tapLog.length - this.tapLogCap);
    }
    player.taps++;
    if (score.hit) player.hits++;
    player.recentAbsDeltas.push(Math.abs(score.deltaMs));
    if (player.recentAbsDeltas.length > this.recentDeltaCap) player.recentAbsDeltas.shift();
    if (auditDeltaMs !== null) {
      player.recentAbsAuditDeltas.push(Math.abs(auditDeltaMs));
      if (player.recentAbsAuditDeltas.length > this.recentDeltaCap) player.recentAbsAuditDeltas.shift();
    }
    player.recentTransit.push(receivedAt - tap.cServerEst);
    if (player.recentTransit.length > this.recentDeltaCap) player.recentTransit.shift();

    const out: Outbound[] = [];
    out.push({
      to: { kind: "conn", connId },
      msg: { t: "tapScore", cid: tap.cid, beatIndex: score.beatIndex, deltaMs: score.deltaMs, hit: score.hit, auditDeltaMs },
    });
    out.push({
      to: { kind: "others", connId },
      msg: { t: "tapScore", cid: player.label, beatIndex: score.beatIndex, deltaMs: score.deltaMs, hit: score.hit, auditDeltaMs },
    });

    const act = this._state.activeAct;
    if (act) {
      const res = applyTap(act, { cid: tap.cid, role: tap.role, beatIndex: score.beatIndex, deltaMs: score.deltaMs, hit: score.hit });
      this._state.activeAct = res.state;
    }
    this.touch();
    out.push(this.statsMessage());
    return out;
  }

  private closeDueBeats(now: number): Outbound[] {
    const out: Outbound[] = [];
    const schedule = this._state.schedule;
    let act = this._state.activeAct;
    if (!schedule || !act) return out;
    while (act && now >= beatTime(schedule, act.nextToClose) + BEAT_CLOSE_GRACE_MS) {
      act = closeBeat(act, act.nextToClose);
      this._state.activeAct = act;
      this.touch();
      const status = evaluate(act);
      if (status !== "open") {
        out.push({ to: { kind: "room" }, msg: actResult(act, status === "ok") });
        this._state.activeAct = null;
        act = null;
      }
    }
    return out;
  }

  /**
   * Make sure a schedule exists; (re)issue it when due or when `force` is set. Returns the
   * schedule message addressed to `to` (a new connection) or to the room (a re-broadcast).
   */
  private ensureSchedule(to: Target, force = false): Outbound[] {
    const now = this.now();
    const existing = this._state.schedule;
    const reissue = existing !== null && (force || scheduleDue(now, this._state.scheduleIssuedAt));
    if (existing === null || reissue) {
      this._state.schedule = issueSchedule(now, existing);
      this._state.scheduleIssuedAt = now;
      this.touch();
      // a re-issue is news for everyone, not just the newcomer
      return [{ to: reissue ? { kind: "room" } : to, msg: this._state.schedule }];
    }
    return [{ to, msg: existing }];
  }

  private playerByConn(connId: string): PlayerRecord | undefined {
    return Object.values(this._state.players).find((p) => p.connId === connId);
  }

  private snapshot(you: PlayerRecord): Snapshot {
    const act = this._state.activeAct;
    return {
      t: "snapshot",
      serverNow: this.now(),
      you: you.label,
      schedule: this._state.schedule,
      players: Object.values(this._state.players).map((p) => ({ label: p.label, role: p.role, connected: p.connected })),
      activeAct: act ? { actId: act.actId, roles: [...act.roles], startBeat: act.startBeat, maxBeats: act.maxBeats } : null,
    };
  }

  private statsMessage(): Outbound {
    const clients: ClientStats[] = Object.values(this._state.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        label: p.label,
        role: p.role,
        connected: p.connected,
        n: p.taps,
        hitRate: p.taps === 0 ? 0 : p.hits / p.taps,
        medianAbsDelta: p.recentAbsDeltas.length === 0 ? 0 : median(p.recentAbsDeltas),
        medianAbsAuditDelta: p.recentAbsAuditDeltas.length === 0 ? null : median(p.recentAbsAuditDeltas),
        rttMs: this.rttOf(p),
        syncBiasMs: this.syncBiasOf(p),
      }));
    return { to: { kind: "room" }, msg: { t: "stats", clients, recentBeats: this.recentBeats() } };
  }

  /**
   * Cross-client spread for the most recent beats, from both columns. A beat's spread is only
   * defined when every currently connected player tapped it (first tap per player counts).
   */
  recentBeats(): BeatSpread[] {
    const connected = Object.values(this._state.players).filter((p) => p.connected).length;
    const byBeat = new Map<number, Map<string, TapRecord>>();
    for (const r of this._state.tapLog) {
      let m = byBeat.get(r.beatIndex);
      if (!m) byBeat.set(r.beatIndex, (m = new Map()));
      if (!m.has(r.cid)) m.set(r.cid, r);
    }
    const indices = [...byBeat.keys()].sort((a, b) => a - b).slice(-this.recentBeatsCap);
    return indices.map((beatIndex) => {
      const taps = [...(byBeat.get(beatIndex) as Map<string, TapRecord>).values()];
      const full = connected > 0 && taps.length >= connected;
      const deltas = taps.map((r) => r.deltaMs);
      const audits = taps.flatMap((r) => (r.auditDeltaMs === null ? [] : [r.auditDeltaMs]));
      const corrected = taps.flatMap((r) => {
        const p = this._state.players[r.cid];
        const bias = p ? this.syncBiasOf(p) : null;
        return bias === null ? [] : [r.deltaMs + bias];
      });
      const range = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
      return {
        beatIndex,
        n: taps.length,
        spread: full ? range(deltas) : null,
        auditSpread: full && audits.length === taps.length ? range(audits) : null,
        correctedSpread: full && corrected.length === taps.length ? range(corrected) : null,
      };
    });
  }
}
