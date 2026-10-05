import PartySocket from "partysocket";
import {
  SYNC_BURST,
  SYNC_INTERVAL_MS,
  SyncEstimator,
  beatTime,
  nearestBeatIndex,
  parseServerMessage,
  type ActResult,
  type BranchSet,
  type ClientMessage,
  type ReadEvent,
  type Role,
  type Schedule,
  type Stats,
  type TapScore,
} from "@lsp/protocol";

/**
 * The browser side of the beat engine. Mirrors the sim client: hello, an 8-round-trip sync
 * burst on connect and every 10 s (each follow-up ping names the pong it answers so the server
 * can measure the round trip itself), beats rendered LOCALLY from the Schedule, taps stamped
 * with the estimated room time.
 *
 * Local clock is performance.now(): monotonic, immune to the OS adjusting the wall clock.
 * Nothing scored ever uses Date.now() on the client.
 */

export interface BeatClientSnapshot {
  connected: boolean;
  label: string | null;
  /** estimator output */
  offset: number | null;
  rtt: number | null;
  samples: number;
  schedule: Schedule | null;
  /** index of the next local beat, or null while not scheduling */
  nextBeat: number | null;
  /** local ms until the next beat, or null */
  nextBeatIn: number | null;
  /** scores for this client's own taps, newest last, capped at 10 */
  recent: TapScore[];
  taps: number;
  hits: number;
  stats: Stats | null;
  lastActResult: ActResult | null;
  /** count of frames the client could not parse */
  badFrames: number;
  // ---- Task 2 ----
  /** stream content; only ever non-null on the navigator's connection */
  branchSet: BranchSet | null;
  debt: number;
  /** the server's view of an in-progress read, from snapshot or readEvent */
  activeRead: { readId: string; label: string; startedAt: number } | null;
  lastReadEvent: ReadEvent | null;
  /** local → room-time delay between the server stamping lastReadEvent and us receiving it, ms */
  lastReadLatencyMs: number | null;
  /** true between our own pointerdown and the server's end event */
  holding: boolean;
  /** local time our hold began (performance.now()), or null */
  holdStartedLocal: number | null;
}

export interface BeatClientOptions {
  host: string;
  room: string;
  cid: string;
  role: Role;
  /** fired on every locally rendered beat, for the pulse and the haptic */
  onBeat: (beatIndex: number) => void;
  onChange: (snapshot: BeatClientSnapshot) => void;
}

export class BeatClient {
  private readonly socket: PartySocket;
  private readonly estimator = new SyncEstimator();
  private readonly opts: BeatClientOptions;
  private schedule: Schedule | null = null;
  private label: string | null = null;
  private connected = false;
  private burstRemaining = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setTimeout> | null = null;
  private nextBeat: number | null = null;
  private lastBeatFired = Number.NEGATIVE_INFINITY;
  private recent: TapScore[] = [];
  private taps = 0;
  private hits = 0;
  private stats: Stats | null = null;
  private lastActResult: ActResult | null = null;
  private badFrames = 0;
  private closed = false;
  private branchSet: BranchSet | null = null;
  private debt = 0;
  private activeRead: BeatClientSnapshot["activeRead"] = null;
  private lastReadEvent: ReadEvent | null = null;
  private lastReadLatencyMs: number | null = null;
  private holding = false;
  private holdStartedLocal: number | null = null;

  constructor(opts: BeatClientOptions) {
    this.opts = opts;
    this.socket = new PartySocket({ host: opts.host, room: opts.room });
    this.socket.addEventListener("open", () => this.onOpen());
    this.socket.addEventListener("close", () => this.onClose());
    this.socket.addEventListener("message", (ev: MessageEvent<string>) => this.onFrame(ev.data));
  }

  /** Client-local monotonic time. */
  now(): number {
    return performance.now();
  }

  snapshot(): BeatClientSnapshot {
    const est = this.estimator.estimate();
    const nextBeatIn =
      this.nextBeat !== null && est && this.schedule
        ? this.estimator.toLocal(beatTime(this.schedule, this.nextBeat)) - this.now()
        : null;
    return {
      connected: this.connected,
      label: this.label,
      offset: est?.offset ?? null,
      rtt: est?.rtt ?? null,
      samples: est?.samples ?? 0,
      schedule: this.schedule,
      nextBeat: this.nextBeat,
      nextBeatIn,
      recent: this.recent,
      taps: this.taps,
      hits: this.hits,
      stats: this.stats,
      lastActResult: this.lastActResult,
      badFrames: this.badFrames,
      branchSet: this.branchSet,
      debt: this.debt,
      activeRead: this.activeRead,
      lastReadEvent: this.lastReadEvent,
      lastReadLatencyMs: this.lastReadLatencyMs,
      holding: this.holding,
      holdStartedLocal: this.holdStartedLocal,
    };
  }

  /** Navigator: the hand went down. Sends readStart with the current room-time estimate. */
  readStart(): boolean {
    if (!this.connected || !this.estimator.ready || this.holding) return false;
    const cLocal = this.now();
    this.holding = true;
    this.holdStartedLocal = cLocal;
    this.send({ t: "readStart", cid: this.opts.cid, cLocal, cServerEst: this.estimator.toServer(cLocal) });
    this.emit();
    return true;
  }

  /** Navigator: the hand lifted. */
  readEnd(): boolean {
    if (!this.holding) return false;
    this.holding = false;
    this.holdStartedLocal = null;
    if (this.connected && this.estimator.ready) {
      const cLocal = this.now();
      this.send({ t: "readEnd", cid: this.opts.cid, cLocal, cServerEst: this.estimator.toServer(cLocal) });
    }
    this.emit();
    return true;
  }

  /** The player tapped. Sends immediately with the current room-time estimate. */
  tap(): boolean {
    if (!this.connected || !this.estimator.ready) return false;
    const cLocal = this.now();
    this.send({ t: "tap", cid: this.opts.cid, role: this.opts.role, cLocal, cServerEst: this.estimator.toServer(cLocal) });
    return true;
  }

  /** Ask the server to open a consent act for the given roles (diagnostic convenience). */
  startAct(roles: Role[]): void {
    this.send({ t: "actStart", actId: `diag-${Date.now().toString(36)}`, beatsRequired: 3, roles });
  }

  close(): void {
    this.closed = true;
    this.clearTimers();
    this.socket.close();
  }

  // -------------------------------------------------------------------------

  private emit(): void {
    if (!this.closed) this.opts.onChange(this.snapshot());
  }

  private send(msg: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  private onOpen(): void {
    this.connected = true;
    this.send({ t: "hello", cid: this.opts.cid, role: this.opts.role });
    this.startSyncBurst();
    this.emit();
  }

  private onClose(): void {
    this.connected = false;
    // the server releases a read whose socket dropped; mirror that locally
    this.holding = false;
    this.holdStartedLocal = null;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.burstRemaining = 0;
    // keep rendering beats locally from the last schedule; PartySocket reconnects on its own
    this.emit();
  }

  private clearTimers(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    if (this.beatTimer) clearTimeout(this.beatTimer);
    this.syncTimer = null;
    this.beatTimer = null;
  }

  private startSyncBurst(): void {
    if (!this.connected) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.burstRemaining = SYNC_BURST;
    this.sendPing();
  }

  private sendPing(prev?: number): void {
    const base = { t: "ping" as const, cid: this.opts.cid, c0: this.now() };
    this.send(prev === undefined ? base : { ...base, prev });
  }

  private onFrame(raw: string): void {
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) {
      this.badFrames++;
      this.emit();
      return;
    }
    const msg = parsed.msg;
    switch (msg.t) {
      case "pong": {
        this.estimator.pushExchange(msg.c0, msg.s1, this.now());
        this.burstRemaining--;
        if (this.burstRemaining > 0) {
          this.sendPing(msg.s1);
        } else {
          this.syncTimer = setTimeout(() => this.startSyncBurst(), SYNC_INTERVAL_MS);
        }
        this.ensureBeatLoop();
        break;
      }
      case "schedule":
        this.schedule = msg;
        this.ensureBeatLoop();
        break;
      case "snapshot":
        this.label = msg.you;
        if (msg.schedule) this.schedule = msg.schedule;
        this.debt = msg.debt;
        this.activeRead = msg.activeRead;
        this.ensureBeatLoop();
        break;
      case "branchSet":
        this.branchSet = msg;
        break;
      case "readEvent": {
        this.lastReadEvent = msg;
        this.debt = msg.debt;
        this.lastReadLatencyMs = this.estimator.ready ? this.estimator.toServer(this.now()) - msg.serverTime : null;
        if (msg.phase === "start") this.activeRead = { readId: msg.readId, label: msg.label, startedAt: msg.serverTime };
        else {
          this.activeRead = null;
          // the server released our read (e.g. after a reconnect): stop claiming to hold
          if (msg.label === this.label) {
            this.holding = false;
            this.holdStartedLocal = null;
          }
        }
        break;
      }
      case "tapScore":
        if (msg.cid === this.opts.cid) {
          this.taps++;
          if (msg.hit) this.hits++;
          this.recent = [...this.recent, msg].slice(-10);
        }
        break;
      case "stats":
        this.stats = msg;
        break;
      case "actResult":
        this.lastActResult = msg;
        break;
      case "actStart":
        break;
    }
    this.emit();
  }

  /**
   * Schedule, don't tick: the next beat's local time is computed from the schedule and the
   * current offset estimate every time, so sync corrections apply immediately and a dropped
   * socket changes nothing about when beats are rendered.
   */
  private ensureBeatLoop(): void {
    if (this.beatTimer !== null || this.closed) return;
    this.scheduleNextBeat();
  }

  private scheduleNextBeat(): void {
    const schedule = this.schedule;
    if (!schedule || !this.estimator.ready) {
      this.beatTimer = null;
      this.nextBeat = null;
      return;
    }
    const roomNow = this.estimator.toServer(this.now());
    if (roomNow > schedule.until) {
      // schedule ran out without a re-broadcast; wait for the next one
      this.beatTimer = null;
      this.nextBeat = null;
      this.emit();
      return;
    }
    const next = Math.max(nearestBeatIndex(schedule, roomNow) + 1, this.lastBeatFired + 1);
    this.nextBeat = next;
    const localAt = this.estimator.toLocal(beatTime(schedule, next));
    const delay = Math.max(0, localAt - this.now());
    this.beatTimer = setTimeout(() => {
      this.beatTimer = null;
      this.lastBeatFired = next;
      this.opts.onBeat(next);
      this.scheduleNextBeat();
    }, delay);
  }
}
