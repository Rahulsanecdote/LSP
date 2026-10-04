import {
  SYNC_BURST,
  SYNC_INTERVAL_MS,
  SyncEstimator,
  beatTime,
  nearestBeatIndex,
  type ClientMessage,
  type Role,
  type Schedule,
  type ServerMessage,
} from "@lsp/protocol";
import { drawLatency, type LinkModel } from "./net";
import type { Rng } from "./rng";
import type { Endpoint, SimServer } from "./server";
import type { Handle, Sim } from "./sim";

export interface SimClientOptions {
  cid: string;
  role: Role;
  link: LinkModel;
  /** client local clock = room time + trueOffset (the thing sync has to discover) */
  trueOffset: number;
  /** sd of human tap error around the perceived beat, ms */
  humanSdMs: number;
  rng: Rng;
}

/**
 * A simulated phone. Behaves like the diagnostic page will: hello, an 8-round-trip sync burst
 * on connect and every 10 s, renders beats locally from the Schedule, taps each beat with
 * normal human error, and sends `tap { cLocal, cServerEst }`.
 *
 * Its "local clock" is `sim.now + trueOffset`; it never sees `sim.now` directly.
 */
export class SimClient implements Endpoint {
  readonly cid: string;
  readonly role: Role;
  readonly estimator = new SyncEstimator();
  schedule: Schedule | null = null;

  private connId: string | null = null;
  private burstRemaining = 0;
  private syncTimer: Handle | null = null;
  private tapTimer: Handle | null = null;
  private tapping = false;
  private lastTapBeat = Number.NEGATIVE_INFINITY;
  private readonly link: LinkModel;
  private readonly trueOffset: number;
  private readonly humanSdMs: number;
  private readonly rng: Rng;

  /** counters for reports */
  sent = 0;
  dropped = 0;
  reconnects = 0;
  /** sim time of the most recent (re)connect */
  connectedAt = Number.NaN;
  /** ground truth the server never sees: true room time of each tap, keyed by the cServerEst it carried */
  readonly truth = new Map<number, number>();

  constructor(
    private readonly sim: Sim,
    private readonly server: SimServer,
    opts: SimClientOptions,
  ) {
    this.cid = opts.cid;
    this.role = opts.role;
    this.link = opts.link;
    this.trueOffset = opts.trueOffset;
    this.humanSdMs = opts.humanSdMs;
    this.rng = opts.rng;
  }

  /** The client's own clock. */
  localNow(): number {
    return this.sim.now + this.trueOffset;
  }

  get connected(): boolean {
    return this.connId !== null;
  }

  connect(): void {
    if (this.connId !== null) return;
    if (!Number.isNaN(this.connectedAt)) this.reconnects++;
    this.connectedAt = this.sim.now;
    this.connId = this.server.connect(this);
    this.send({ t: "hello", cid: this.cid, role: this.role });
    this.startSyncBurst();
  }

  /** Drop the socket. In-flight frames in both directions are lost. Local beat rendering continues. */
  disconnect(): void {
    if (this.connId === null) return;
    const id = this.connId;
    this.connId = null;
    this.sim.cancel(this.syncTimer);
    this.syncTimer = null;
    this.burstRemaining = 0;
    this.server.close(id);
  }

  /** A network stall: offline for `durationMs`, then reconnect. */
  stall(durationMs: number): void {
    this.disconnect();
    this.sim.schedule(this.sim.now + durationMs, () => this.connect());
  }

  // -------------------------------------------------------------------------
  // transport

  private send(msg: ClientMessage): void {
    if (this.connId === null) {
      this.dropped++;
      return;
    }
    const connId = this.connId;
    this.sent++;
    const latency = drawLatency(this.rng, this.link);
    this.sim.schedule(this.sim.now + latency, () => {
      // a frame still in flight when the socket closed never arrives
      if (this.connId === connId) this.server.receive(connId, msg);
    });
  }

  receiveFromServer(msg: ServerMessage): void {
    const connId = this.connId;
    if (connId === null) return;
    const latency = drawLatency(this.rng, this.link);
    this.sim.schedule(this.sim.now + latency, () => {
      if (this.connId === connId) this.onMessage(msg);
    });
  }

  // -------------------------------------------------------------------------
  // behaviour

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "pong": {
        this.estimator.pushExchange(msg.c0, msg.s1, this.localNow());
        this.burstRemaining--;
        if (this.burstRemaining > 0) {
          this.sendPing(msg.s1);
        } else {
          this.syncTimer = this.sim.schedule(this.sim.now + SYNC_INTERVAL_MS, () => this.startSyncBurst());
        }
        this.maybeStartTapping();
        break;
      }
      case "schedule": {
        this.schedule = msg;
        this.maybeStartTapping();
        break;
      }
      case "snapshot": {
        if (msg.schedule) this.schedule = msg.schedule;
        this.maybeStartTapping();
        break;
      }
      default:
        break;
    }
  }

  private startSyncBurst(): void {
    if (this.connId === null) return;
    this.sim.cancel(this.syncTimer);
    this.syncTimer = null;
    this.burstRemaining = SYNC_BURST;
    this.sendPing();
  }

  private sendPing(prev?: number): void {
    // `prev` closes a server-measured round trip (amendment 4) when this ping is an immediate
    // reply to a pong
    this.send(prev === undefined ? { t: "ping", cid: this.cid, c0: this.localNow() } : { t: "ping", cid: this.cid, c0: this.localNow(), prev });
  }

  private maybeStartTapping(): void {
    if (this.tapping || !this.schedule || !this.estimator.ready) return;
    this.tapping = true;
    this.scheduleNextTap();
  }

  /** Render the next beat locally from the schedule and tap near it. */
  private scheduleNextTap(): void {
    const schedule = this.schedule;
    if (!schedule || !this.estimator.ready) {
      this.tapping = false;
      return;
    }
    const roomNowEst = this.estimator.toServer(this.localNow());
    const nextBeat = Math.max(nearestBeatIndex(schedule, roomNowEst) + 1, this.lastTapBeat + 1);
    const localBeat = this.estimator.toLocal(beatTime(schedule, nextBeat));
    const tapLocal = localBeat + this.rng.normal(0, this.humanSdMs);
    const at = tapLocal - this.trueOffset; // back to sim time
    this.tapTimer = this.sim.schedule(at, () => {
      this.tapTimer = null;
      this.lastTapBeat = nextBeat;
      const cLocal = this.localNow();
      const cServerEst = this.estimator.toServer(cLocal);
      this.truth.set(cServerEst, this.sim.now);
      this.send({ t: "tap", cid: this.cid, role: this.role, cLocal, cServerEst });
      this.scheduleNextTap();
    });
  }

  stopTapping(): void {
    this.tapping = false;
    this.sim.cancel(this.tapTimer);
    this.tapTimer = null;
  }
}
