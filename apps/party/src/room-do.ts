import { DurableObject } from "cloudflare:workers";
import { RoomCore, initialRoomState, type Outbound, type RoomState } from "./core/index";
import type { Env } from "./worker";

/**
 * Durable Object host for RoomCore. One object per room; the room code is its name.
 *
 * Clock (clarification 6, v0.2.1): room time is `Date.now() − anchor`, where `anchor` is a
 * wall-clock ms persisted in DO storage the first time the room starts. `performance.now()`
 * cannot be the room clock on Workers: it is frozen during synchronous execution and resets
 * when the object is evicted, so a persisted schedule epoch would be in a dead clock. Every
 * scored value is relative to the one anchor, so absolute drift does not matter.
 *
 * Sockets use the WebSocket Hibernation API: the runtime keeps them open while the object is
 * evicted from memory between messages, and reconstructs the object on the next event. Each
 * socket carries its connection id as a serialised attachment so the rebuilt object can map
 * events back to the player the core knows. Timers are storage alarms for the same reason.
 *
 * State: the whole RoomState is written to storage after any handler that changed it.
 */

const STATE_KEY = "state";
const ANCHOR_KEY = "anchor";

interface Attachment {
  connId: string;
}

export class BeatRoom extends DurableObject<Env> {
  private anchor = 0;
  private core!: RoomCore;
  private roomName = "?";
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(() => this.load());
  }

  private now = (): number => Date.now() - this.anchor;

  private async load(): Promise<void> {
    const storedAnchor = await this.ctx.storage.get<number>(ANCHOR_KEY);
    if (storedAnchor === undefined) {
      this.anchor = Date.now();
      await this.ctx.storage.put(ANCHOR_KEY, this.anchor);
    } else {
      this.anchor = storedAnchor;
    }
    const state = (await this.ctx.storage.get<RoomState>(STATE_KEY)) ?? initialRoomState();
    // Reconcile connection flags with the sockets the runtime kept alive through hibernation.
    const live = new Set(this.ctx.getWebSockets().map((ws) => this.connIdOf(ws)));
    for (const p of Object.values(state.players)) {
      if (p.connId !== null && !live.has(p.connId)) {
        p.connected = false;
        p.connId = null;
      }
    }
    this.core = new RoomCore({ now: this.now }, state);
  }

  private connIdOf(ws: WebSocket): string | null {
    const a = ws.deserializeAttachment() as Attachment | null;
    return a?.connId ?? null;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    this.roomName = decodeURIComponent(url.pathname.split("/").pop() ?? "?").toUpperCase();

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const connId = `conn-${crypto.randomUUID().slice(0, 8)}`;
      server.serializeAttachment({ connId } satisfies Attachment);
      this.ctx.acceptWebSocket(server, [connId]);
      await this.handle(this.core.onConnect(connId));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET") return this.summary();
    return new Response("method not allowed", { status: 405 });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready;
    if (typeof message !== "string") return;
    const connId = this.connIdOf(ws);
    if (connId === null) return;
    await this.handle(this.core.onMessage(connId, message));
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    await this.ready;
    const connId = this.connIdOf(ws);
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    if (connId !== null) await this.handle(this.core.onClose(connId));
    void wasClean;
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.ready;
    const connId = this.connIdOf(ws);
    if (connId !== null) await this.handle(this.core.onClose(connId));
  }

  override async alarm(): Promise<void> {
    await this.ready;
    await this.handle(this.core.tick());
  }

  /** Read-only room summary for the diagnostic tooling and the e2e test. */
  private summary(): Response {
    const s = this.core.state;
    const body = {
      room: this.roomName,
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
      await this.ctx.storage.put(STATE_KEY, this.core.state);
      this.core.markPersisted();
    }
    await this.arm();
  }

  private deliver(out: Outbound[]): void {
    if (out.length === 0) return;
    const sockets = this.ctx.getWebSockets();
    for (const o of out) {
      const frame = JSON.stringify(o.msg);
      for (const ws of sockets) {
        const id = this.connIdOf(ws);
        const send =
          o.to.kind === "room" ||
          (o.to.kind === "conn" && id === o.to.connId) ||
          (o.to.kind === "others" && id !== o.to.connId);
        if (!send) continue;
        try {
          ws.send(frame);
        } catch {
          /* socket closing; its close event will follow */
        }
      }
    }
  }

  private async arm(): Promise<void> {
    const next = this.core.nextWakeAt();
    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(this.anchor + next);
  }
}
