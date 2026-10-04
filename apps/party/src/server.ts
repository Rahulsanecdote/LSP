import type * as Party from "partykit/server";
import { RoomCore, initialRoomState, type Outbound, type RoomState } from "./core/index.js";

/**
 * PartyKit host for RoomCore. One party per crew; the room code is the party id.
 *
 * Clock (clarification 6, v0.2.1): room time is `Date.now() − anchor`, where `anchor` is a
 * wall-clock ms persisted in room storage the first time the room starts. `performance.now()`
 * cannot be the room clock on Workers: it is frozen during synchronous execution and resets
 * when the Durable Object hibernates, so a persisted schedule epoch would be in a dead clock.
 * Every scored value is relative to the one anchor, so absolute drift does not matter.
 *
 * State: the whole RoomState is written to storage after any handler that changed it, so the
 * room survives reconnects and hibernation. Timers (schedule re-broadcast, act beat closes) use
 * storage alarms, which also survive hibernation.
 */

const STATE_KEY = "state";
const ANCHOR_KEY = "anchor";

export default class BeatServer implements Party.Server {
  readonly options: Party.ServerOptions = { hibernate: true };

  private anchor = 0;
  private core!: RoomCore;

  constructor(readonly room: Party.Room) {}

  private now = (): number => Date.now() - this.anchor;

  async onStart(): Promise<void> {
    const storedAnchor = await this.room.storage.get<number>(ANCHOR_KEY);
    if (storedAnchor === undefined) {
      this.anchor = Date.now();
      await this.room.storage.put(ANCHOR_KEY, this.anchor);
    } else {
      this.anchor = storedAnchor;
    }
    const state = (await this.room.storage.get<RoomState>(STATE_KEY)) ?? initialRoomState();
    // connections do not survive a cold start; anyone still connected will say hello again
    for (const p of Object.values(state.players)) {
      p.connected = false;
      p.connId = null;
    }
    this.core = new RoomCore({ now: this.now }, state);
  }

  async onConnect(conn: Party.Connection): Promise<void> {
    await this.handle(this.core.onConnect(conn.id));
  }

  async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    if (typeof message !== "string") return;
    await this.handle(this.core.onMessage(sender.id, message));
  }

  async onClose(conn: Party.Connection): Promise<void> {
    await this.handle(this.core.onClose(conn.id));
  }

  async onError(conn: Party.Connection): Promise<void> {
    await this.handle(this.core.onClose(conn.id));
  }

  async onAlarm(): Promise<void> {
    await this.handle(this.core.tick());
  }

  /** Read-only room summary for the diagnostic tooling and the e2e test. */
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
    const s = this.core.state;
    const body = {
      room: this.room.id,
      serverNow: this.now(),
      anchor: this.anchor,
      schedule: s.schedule,
      players: Object.values(s.players).map((p) => ({
        label: p.label,
        role: p.role,
        connected: p.connected,
        taps: p.taps,
        hits: p.hits,
      })),
      activeAct: s.activeAct ? { actId: s.activeAct.actId, startBeat: s.activeAct.startBeat } : null,
      recentBeats: this.core.recentBeats(),
      tapLog: s.tapLog,
    };
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  private async handle(out: Outbound[]): Promise<void> {
    this.deliver(out);
    if (this.core.dirty) {
      await this.room.storage.put(STATE_KEY, this.core.state);
      this.core.markPersisted();
    }
    await this.arm();
  }

  private deliver(out: Outbound[]): void {
    for (const o of out) {
      const frame = JSON.stringify(o.msg);
      switch (o.to.kind) {
        case "conn":
          this.room.getConnection(o.to.connId)?.send(frame);
          break;
        case "room":
          this.room.broadcast(frame);
          break;
        case "others":
          this.room.broadcast(frame, [o.to.connId]);
          break;
      }
    }
  }

  private async arm(): Promise<void> {
    const next = this.core.nextWakeAt();
    if (next === null) {
      await this.room.storage.deleteAlarm();
      return;
    }
    await this.room.storage.setAlarm(this.anchor + next);
  }
}

BeatServer satisfies Party.Worker;
