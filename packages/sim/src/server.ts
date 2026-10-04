import { RoomCore, type Outbound } from "@lsp/party";
import type { ClientMessage, ServerMessage } from "@lsp/protocol";
import type { Handle, Sim } from "./sim";

/** Something that can receive server frames after a delay: a SimClient. */
export interface Endpoint {
  receiveFromServer(msg: ServerMessage): void;
}

/**
 * Hosts a RoomCore inside the virtual-time sim, the way the PartyKit server hosts it in
 * production: forwards connect/message/close events, delivers Outbound messages to the right
 * endpoints, and arms a timer at `nextWakeAt()` to call `tick()`.
 */
export class SimServer {
  readonly core: RoomCore;
  private readonly conns = new Map<string, Endpoint>();
  private nextConn = 1;
  private wake: Handle | null = null;

  constructor(private readonly sim: Sim) {
    this.core = new RoomCore({ now: () => sim.now, tapLogCap: 100_000 });
  }

  connect(endpoint: Endpoint): string {
    const connId = `conn-${this.nextConn++}`;
    this.conns.set(connId, endpoint);
    this.deliver(connId, this.core.onConnect(connId));
    this.rearm();
    return connId;
  }

  receive(connId: string, msg: ClientMessage): void {
    if (!this.conns.has(connId)) return; // arrived after the socket closed
    this.deliver(connId, this.core.onMessage(connId, msg));
    this.rearm();
  }

  close(connId: string): void {
    if (!this.conns.delete(connId)) return;
    this.deliver(connId, this.core.onClose(connId));
    this.rearm();
  }

  private deliver(_from: string, out: Outbound[]): void {
    for (const o of out) {
      switch (o.to.kind) {
        case "conn": {
          this.conns.get(o.to.connId)?.receiveFromServer(o.msg);
          break;
        }
        case "room": {
          for (const ep of this.conns.values()) ep.receiveFromServer(o.msg);
          break;
        }
        case "others": {
          for (const [id, ep] of this.conns) if (id !== o.to.connId) ep.receiveFromServer(o.msg);
          break;
        }
      }
    }
  }

  private rearm(): void {
    this.sim.cancel(this.wake);
    this.wake = null;
    const at = this.core.nextWakeAt();
    if (at === null) return;
    this.wake = this.sim.schedule(at, () => {
      this.wake = null;
      this.deliver("timer", this.core.tick());
      this.rearm();
    });
  }
}
