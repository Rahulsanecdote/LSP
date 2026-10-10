import {
  ACT_BEATS_REQUIRED,
  BEAT_CLOSE_GRACE_MS,
  READ_DEBT,
  READ_DEBT_PAST_HORIZON,
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
  type BranchSet,
  type CallAgain,
  type Choose,
  type ClientMessage,
  type Continue,
  type Focus,
  type ClientStats,
  type Hello,
  type Ping,
  type ReadEnd,
  type ReadEvent,
  type ReadStart,
  type Role,
  type ServerMessage,
  type Snapshot,
  type Tap,
} from "@lsp/protocol";
import { issueSchedule, nextScheduleAt, scheduleDue } from "./beat";
import { S2_SEAL_BRANCHSET } from "./fixtures";
import { SceneHost, type SceneCore } from "./scenes";
import { initialRoomState, migrateRoomState, type PlayerRecord, type ReadRecord, type RoomState, type TapRecord } from "./state";

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
  /** reads kept in the log (default 200) */
  readLogCap?: number;
  /** the BranchSet a fresh room starts with (default: the S2 seal fixture) */
  branchSet?: BranchSet;
  /** Task 3: paced scene durations are divided by this (SCENE_PACE); default 1 */
  pace?: number;
}

export class RoomCore implements SceneCore {
  readonly now: () => number;
  readonly pace: number;
  private readonly scenes: SceneHost;
  private readonly tapLogCap: number;
  private readonly recentDeltaCap: number;
  private readonly rttCap: number;
  private readonly recentBeatsCap: number;
  private readonly readLogCap: number;
  private _state: RoomState;
  private _dirty = false;
  private _lastError: string | null = null;

  constructor(opts: RoomCoreOptions, state: RoomState = initialRoomState()) {
    this.now = opts.now;
    this.tapLogCap = opts.tapLogCap ?? 500;
    this.recentDeltaCap = opts.recentDeltaCap ?? 50;
    this.rttCap = opts.rttCap ?? 24;
    this.recentBeatsCap = opts.recentBeatsCap ?? 20;
    this.readLogCap = opts.readLogCap ?? 200;
    this.pace = Math.max(1, opts.pace ?? 1);
    this.scenes = new SceneHost(this);
    this._state = migrateRoomState(state);
    if (this._state.branchSet === null) {
      this._state.branchSet = opts.branchSet ?? S2_SEAL_BRANCHSET;
      this._dirty = true;
    }
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

  touch(): void {
    this._dirty = true;
  }

  connectedPlayers(): PlayerRecord[] {
    return Object.values(this._state.players)
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  /** The scene as the given role may see it (Task 3). */
  sceneView(role: Role): ReturnType<SceneHost["view"]> {
    return this.scenes.view(role);
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
    const out: Outbound[] = [];
    // a dropped socket releases the read: the hand is no longer on the screen
    if (this._state.activeRead && this._state.activeRead.cid === player.cid) {
      out.push(...this.endRead(player, null, "disconnect"));
    }
    player.connected = false;
    player.connId = null;
    this.touch();
    out.push(this.statsMessage());
    out.push(...this.scenes.views());
    return out;
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
    out.push(...this.scenes.tick(now));
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
    const scene = this.scenes.nextWakeAt();
    if (scene !== null) candidates.push(scene);
    return candidates.length ? Math.min(...candidates) : null;
  }

  // -------------------------------------------------------------------------
  // Scene / host API

  /**
   * Open a consent act for `roles`. Participants are the connected players holding those roles
   * right now (first-joined wins if a role is duplicated). Ignored while an act is active or
   * before any schedule exists.
   */
  startAct(actId: string, roles: readonly Role[], maxMisses?: number): Outbound[] {
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
    this._state.activeAct = startAct({ actId, roles, startBeat, participants, ...(maxMisses !== undefined ? { maxMisses } : {}) });
    this.touch();
    const msg: ActStart = { t: "actStart", actId, beatsRequired: ACT_BEATS_REQUIRED, roles: [...new Set(roles)] };
    return [{ to: { kind: "room" }, msg }];
  }

  /** Replace the BranchSet (a scene change) and send it to every connected navigator. */
  setBranchSet(branchSet: BranchSet): Outbound[] {
    this._state.branchSet = branchSet;
    this.touch();
    return Object.values(this._state.players)
      .filter((p) => p.connected && p.connId !== null && p.role === "navigator")
      .map((p) => ({ to: { kind: "conn", connId: p.connId as string }, msg: branchSet }));
  }

  // -------------------------------------------------------------------------
  // Task 2 — the Navigator's read (§6, amendment 6)
  //
  // Only the connected navigator can read; one read at a time; the server times the hold from
  // its own receive times because DEBT is scored. Nothing inside a read touches anything but
  // debt, activeRead and readLog ("cannot steer", design doc §1); the tests assert that.

  private onReadStart(connId: string, msg: ReadStart): Outbound[] {
    const player = this._state.players[msg.cid];
    if (!player || player.connId !== connId || player.role !== "navigator") return [];
    if (this._state.activeRead) return []; // already reading (duplicate pointerdown, or a second navigator)
    const now = this.now();
    const readId = `r${this._state.nextReadId++}`;
    this._state.activeRead = { readId, cid: player.cid, startedAt: now, cServerEstStart: msg.cServerEst };
    this.touch();
    const ev: ReadEvent = { t: "readEvent", readId, label: player.label, phase: "start", serverTime: now, debt: this._state.debt };
    return [{ to: { kind: "room" }, msg: ev }];
  }

  private onReadEnd(connId: string, msg: ReadEnd): Outbound[] {
    const player = this._state.players[msg.cid];
    const active = this._state.activeRead;
    if (!player || player.connId !== connId || !active || active.cid !== player.cid) return [];
    return this.endRead(player, msg.cServerEst, "release");
  }

  private endRead(player: PlayerRecord, cServerEstEnd: number | null, endedBy: "release" | "disconnect"): Outbound[] {
    const active = this._state.activeRead;
    const branchSet = this._state.branchSet;
    if (!active || !branchSet) return [];
    const now = this.now();
    const durationMs = Math.max(0, now - active.startedAt);
    const projectedMs = durationMs * branchSet.projectionRate;
    const pastHorizon = projectedMs > branchSet.horizonMs;
    const debtDelta = pastHorizon ? READ_DEBT_PAST_HORIZON : READ_DEBT;
    this._state.debt += debtDelta;
    const record: ReadRecord = {
      readId: active.readId,
      cid: active.cid,
      startedAt: active.startedAt,
      endedAt: now,
      endedBy,
      durationMs,
      projectedMs,
      pastHorizon,
      debtDelta,
      cServerEstStart: active.cServerEstStart,
      cServerEstEnd,
    };
    this._state.readLog.push(record);
    if (this._state.readLog.length > this.readLogCap) this._state.readLog.splice(0, this._state.readLog.length - this.readLogCap);
    this._state.activeRead = null;
    this.touch();
    const sceneOut = this.scenes.onReadEnded(player, record);
    const ev: ReadEvent = {
      t: "readEvent",
      readId: active.readId,
      label: player.label,
      phase: "end",
      serverTime: now,
      debt: this._state.debt,
      durationMs,
      projectedMs,
      pastHorizon,
      debtDelta,
      endedBy,
    };
    return [{ to: { kind: "room" }, msg: ev }, ...sceneOut];
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
      case "readStart":
        return this.onReadStart(connId, msg);
      case "readEnd":
        return this.onReadEnd(connId, msg);
      case "choose":
        return this.withPlayer(connId, msg, (p) => this.scenes.onChoose(p, msg));
      case "continue":
        return this.withPlayer(connId, msg, (p) => this.scenes.onContinue(p, msg));
      case "focus":
        return this.withPlayer(connId, msg, (p) => this.scenes.onFocus(p, msg));
      case "callAgain":
        return this.withPlayer(connId, msg, (p) => this.scenes.onCallAgain(p, msg));
    }
  }

  /** Scene intents count only from a connection that said hello with that cid. */
  private withPlayer(connId: string, msg: Choose | Continue | Focus | CallAgain, f: (p: PlayerRecord) => Outbound[]): Outbound[] {
    const player = this._state.players[msg.cid];
    if (!player || player.connId !== connId) return [];
    return f(player);
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
    // Stream content goes to the Navigator's connection and nowhere else (§1 "Visible").
    if (player.role === "navigator" && this._state.branchSet) {
      out.push({ to: { kind: "conn", connId }, msg: this._state.branchSet });
    }
    out.push(this.statsMessage());
    // presence is part of every scene view (lobby, reconnects)
    out.push(...this.scenes.views());
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
   *
   * Sync-validation instrument ONLY (amendment 4). Averaging over a player's taps folds their
   * systematic human bias into this number: a player who always taps 60 ms early looks like a
   * clock that is 60 ms off. It must never feed scoring or act evaluation.
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
    out.push(...this.scenes.onTap(player, { t: "tapScore", cid: tap.cid, beatIndex: score.beatIndex, deltaMs: score.deltaMs, hit: score.hit, auditDeltaMs }, tap.cServerEst));
    if (act && this._state.scene.id === "s7") out.push(...this.scenes.views());
    return out;
  }

  private closeDueBeats(now: number): Outbound[] {
    const out: Outbound[] = [];
    const schedule = this._state.schedule;
    let act = this._state.activeAct;
    if (!schedule || !act) return out;
    let closedAny = false;
    while (act && now >= beatTime(schedule, act.nextToClose) + BEAT_CLOSE_GRACE_MS) {
      act = closeBeat(act, act.nextToClose);
      this._state.activeAct = act;
      this.touch();
      closedAny = true;
      const status = evaluate(act);
      if (status !== "open") {
        const result = actResult(act, status === "ok");
        out.push({ to: { kind: "room" }, msg: result });
        this._state.activeAct = null;
        act = null;
        out.push(...this.scenes.onActResult(result));
        closedAny = false;
      }
    }
    if (closedAny && this._state.scene.id === "s7") out.push(...this.scenes.views());
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
    const read = this._state.activeRead;
    return {
      t: "snapshot",
      serverNow: this.now(),
      you: you.label,
      schedule: this._state.schedule,
      players: Object.values(this._state.players).map((p) => ({ label: p.label, role: p.role, connected: p.connected })),
      activeAct: act ? { actId: act.actId, roles: [...act.roles], startBeat: act.startBeat, maxBeats: act.maxBeats } : null,
      debt: this._state.debt,
      activeRead: read ? { readId: read.readId, label: this._state.players[read.cid]?.label ?? "?", startedAt: read.startedAt } : null,
      scene: this.scenes.view(you.role),
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
