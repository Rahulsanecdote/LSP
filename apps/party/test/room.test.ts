import { describe, expect, it } from "vitest";
import {
  BEAT_CLOSE_GRACE_MS,
  BEAT_INTERVAL_MS,
  SCHEDULE_HORIZON_MS,
  SCHEDULE_REBROADCAST_MS,
  beatTime,
  type Role,
  type Schedule,
  type ServerMessage,
} from "@lsp/protocol";
import { RoomCore, type Outbound } from "../src/core/index.js";

class Clock {
  t = 1000;
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

function msgs(out: Outbound[], t: ServerMessage["t"]): ServerMessage[] {
  return out.filter((o) => o.msg.t === t).map((o) => o.msg);
}

function join(core: RoomCore, connId: string, cid: string, role: Role): Outbound[] {
  const out = core.onConnect(connId);
  out.push(...core.onMessage(connId, { t: "hello", cid, role }));
  return out;
}

function tapAt(core: RoomCore, connId: string, cid: string, role: Role, serverTime: number): Outbound[] {
  return core.onMessage(connId, { t: "tap", cid, role, cLocal: 0, cServerEst: serverTime });
}

describe("RoomCore", () => {
  it("issues a schedule on first connect and sends it to the newcomer", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    const out = core.onConnect("A");
    expect(out).toHaveLength(1);
    const sched = out[0]?.msg as Schedule;
    expect(sched.t).toBe("schedule");
    expect(sched.epoch).toBe(1000);
    expect(sched.until).toBe(1000 + SCHEDULE_HORIZON_MS);
    expect(out[0]?.to).toEqual({ kind: "conn", connId: "A" });
    expect(core.dirty).toBe(true);
  });

  it("re-broadcasts the schedule every 20 s with the SAME epoch and an extended until", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    core.onConnect("A");
    expect(core.nextWakeAt()).toBe(1000 + SCHEDULE_REBROADCAST_MS);
    clock.advance(SCHEDULE_REBROADCAST_MS - 1);
    expect(core.tick()).toHaveLength(0);
    clock.advance(1);
    const out = core.tick();
    const sched = msgs(out, "schedule")[0] as Schedule;
    expect(sched.epoch).toBe(1000);
    expect(sched.until).toBe(clock.t + SCHEDULE_HORIZON_MS);
    expect(out[0]?.to).toEqual({ kind: "room" });
  });

  it("answers ping with pong carrying c0 and room time", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    core.onConnect("A");
    clock.advance(37);
    const out = core.onMessage("A", JSON.stringify({ t: "ping", cid: "x", c0: 123 }));
    expect(out).toEqual([{ to: { kind: "conn", connId: "A" }, msg: { t: "pong", cid: "x", c0: 123, s1: 1037 } }]);
    // a prev from an unknown cid is ignored, never throws
    expect(core.onMessage("A", { t: "ping", cid: "x", c0: 124, prev: 1000 })).toHaveLength(1);
  });

  it("hello registers a player with a stable anonymous label and returns a snapshot", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    const out = join(core, "A", "cid-1", "navigator");
    const snap = msgs(out, "snapshot")[0];
    expect(snap).toMatchObject({ t: "snapshot", you: "p1", players: [{ label: "p1", role: "navigator", connected: true }] });
    expect(msgs(out, "stats")).toHaveLength(1);
    // reconnect with the same cid keeps the label
    core.onClose("A");
    expect(core.state.players["cid-1"]?.connected).toBe(false);
    const again = join(core, "B", "cid-1", "navigator");
    expect(msgs(again, "snapshot")[0]).toMatchObject({ you: "p1" });
    expect(core.state.players["cid-1"]?.connected).toBe(true);
    expect(core.state.players["cid-1"]?.connId).toBe("B");
  });

  it("drops invalid frames and records the error", () => {
    const core = new RoomCore({ now: () => 0 });
    core.onConnect("A");
    expect(core.onMessage("A", "garbage")).toEqual([]);
    expect(core.lastError).toBeTruthy();
    expect(core.onMessage("A", { t: "tap" })).toEqual([]);
  });

  it("scores taps, replies to the tapper, anonymises the broadcast, logs receive time", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    join(core, "A", "cid-1", "navigator");
    join(core, "B", "cid-2", "theorist");
    const schedule = core.state.schedule as Schedule;
    clock.advance(5000);
    const out = tapAt(core, "A", "cid-1", "navigator", beatTime(schedule, 3) + 40);
    const scores = msgs(out, "tapScore");
    expect(scores).toHaveLength(2);
    expect(out[0]).toEqual({
      to: { kind: "conn", connId: "A" },
      msg: { t: "tapScore", cid: "cid-1", beatIndex: 3, deltaMs: 40, hit: true, auditDeltaMs: null },
    });
    expect(out[1]).toEqual({
      to: { kind: "others", connId: "A" },
      msg: { t: "tapScore", cid: "p1", beatIndex: 3, deltaMs: 40, hit: true, auditDeltaMs: null },
    });
    expect(core.state.tapLog).toEqual([
      expect.objectContaining({ cid: "cid-1", cServerEst: beatTime(schedule, 3) + 40, receivedAt: 6000, beatIndex: 3, hit: true }),
    ]);
    const stats = msgs(out, "stats")[0];
    expect(stats).toMatchObject({
      clients: [
        { label: "p1", n: 1, hitRate: 1, medianAbsDelta: 40, medianAbsAuditDelta: null, rttMs: null },
        { label: "p2", n: 0, hitRate: 0, medianAbsDelta: 0 },
      ],
      recentBeats: [{ beatIndex: 3, n: 1, spread: null, auditSpread: null, correctedSpread: null }],
    });
  });

  it("measures round trips from pings that reply to its pongs and audits taps with them (amendment 4)", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    join(core, "A", "cid-1", "navigator");
    const schedule = core.state.schedule as Schedule;
    // first ping: no prev → no rtt sample
    const pong1 = core.onMessage("A", { t: "ping", cid: "cid-1", c0: 0 })[0]?.msg;
    expect(pong1?.t).toBe("pong");
    const s1 = pong1?.t === "pong" ? pong1.s1 : 0;
    // the client replies 90 ms later, naming the pong it answers
    clock.advance(90);
    core.onMessage("A", { t: "ping", cid: "cid-1", c0: 1, prev: s1 });
    expect(core.state.players["cid-1"]?.rttSamples).toEqual([90]);
    // and again at 110 ms → median rtt 100
    const pong2 = core.onMessage("A", { t: "ping", cid: "cid-1", c0: 2 })[0]?.msg;
    clock.advance(110);
    core.onMessage("A", { t: "ping", cid: "cid-1", c0: 3, prev: pong2?.t === "pong" ? pong2.s1 : 0 });
    expect(core.state.players["cid-1"]?.rttSamples).toEqual([90, 110]);

    // a tap received at beat 4 + 70 ms, claiming to be exactly on the beat
    clock.t = beatTime(schedule, 4) + 70;
    const out = tapAt(core, "A", "cid-1", "navigator", beatTime(schedule, 4));
    const score = msgs(out, "tapScore")[0];
    // scored on cServerEst: delta 0; audited on receivedAt − rtt/2 = +70 − 50 = +20
    expect(score).toMatchObject({ deltaMs: 0, hit: true, auditDeltaMs: 20 });
    expect(core.state.tapLog[0]).toMatchObject({ auditServerTime: beatTime(schedule, 4) + 20, auditDeltaMs: 20 });
    const stats = msgs(out, "stats")[0];
    expect(stats).toMatchObject({
      clients: [{ rttMs: 100, medianAbsAuditDelta: 20, syncBiasMs: 20 }],
      // one tapper: every spread is max − min of a single value
      recentBeats: [{ beatIndex: 4, n: 1, spread: 0, auditSpread: 0, correctedSpread: 0 }],
    });

    // a reconnect starts the rtt samples over: the old socket's path is gone
    core.onClose("A");
    join(core, "B", "cid-1", "navigator");
    expect(core.state.players["cid-1"]?.rttSamples).toEqual([]);
  });

  it("recentBeats reports spread only for beats every connected player tapped", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    join(core, "A", "cid-1", "navigator");
    join(core, "B", "cid-2", "theorist");
    const schedule = core.state.schedule as Schedule;
    tapAt(core, "A", "cid-1", "navigator", beatTime(schedule, 2) + 10);
    tapAt(core, "B", "cid-2", "theorist", beatTime(schedule, 2) - 30);
    tapAt(core, "A", "cid-1", "navigator", beatTime(schedule, 3) + 5);
    expect(core.recentBeats()).toEqual([
      { beatIndex: 2, n: 2, spread: 40, auditSpread: null, correctedSpread: null },
      { beatIndex: 3, n: 1, spread: null, auditSpread: null, correctedSpread: null },
    ]);
  });

  it("ignores taps from clients that never said hello and taps outside the schedule", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    core.onConnect("A");
    expect(tapAt(core, "A", "ghost", "navigator", 1000)).toEqual([]);
    join(core, "A", "cid-1", "navigator");
    expect(tapAt(core, "A", "cid-1", "navigator", 1000 - 400)).toEqual([]);
    expect(core.state.tapLog).toHaveLength(0);
  });

  it("caps the tap log", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now, tapLogCap: 5 });
    join(core, "A", "cid-1", "navigator");
    const schedule = core.state.schedule as Schedule;
    for (let i = 0; i < 9; i++) tapAt(core, "A", "cid-1", "navigator", beatTime(schedule, i));
    expect(core.state.tapLog).toHaveLength(5);
    expect(core.state.tapLog[0]?.beatIndex).toBe(4);
  });

  describe("consent act", () => {
    const roles: Role[] = ["navigator", "synaesthete", "theorist"];

    function setup(): { clock: Clock; core: RoomCore; schedule: Schedule } {
      const clock = new Clock();
      const core = new RoomCore({ now: clock.now });
      join(core, "A", "c-nav", "navigator");
      join(core, "B", "c-syn", "synaesthete");
      join(core, "C", "c-the", "theorist");
      return { clock, core, schedule: core.state.schedule as Schedule };
    }

    function everyoneTaps(core: RoomCore, schedule: Schedule, beat: number, miss: Role[] = []): void {
      const conns: Record<Role, [string, string]> = {
        navigator: ["A", "c-nav"],
        synaesthete: ["B", "c-syn"],
        theorist: ["C", "c-the"],
      };
      for (const role of roles) {
        const [conn, cid] = conns[role];
        tapAt(core, conn, cid, role, beatTime(schedule, beat) + (miss.includes(role) ? 200 : 10));
      }
    }

    it("starts on the first beat whose window has not opened and completes after 3 clean beats", () => {
      const { clock, core, schedule } = setup();
      clock.advance(2000); // t = 3000
      const out = core.startAct("act-1", roles);
      expect(msgs(out, "actStart")).toHaveLength(1);
      const act = core.state.activeAct;
      expect(act).not.toBeNull();
      // beat 4 is at 1000 + 2080 = 3080; its window opens at 2930 < 3000, so start at beat 5
      expect(act?.startBeat).toBe(5);
      expect(act?.participants).toHaveLength(3);
      expect(core.nextWakeAt()).toBe(beatTime(schedule, 5) + BEAT_CLOSE_GRACE_MS);

      for (const b of [5, 6, 7]) {
        everyoneTaps(core, schedule, b);
        clock.t = beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS;
        const t = core.tick();
        if (b < 7) {
          expect(msgs(t, "actResult")).toHaveLength(0);
        } else {
          const result = msgs(t, "actResult")[0];
          expect(result).toMatchObject({ actId: "act-1", ok: true });
          expect(core.state.activeAct).toBeNull();
        }
      }
    });

    it("a tap arriving after its beat closed stays a miss; act fails at the cap with perRole", () => {
      const { clock, core, schedule } = setup();
      core.startAct("act-2", roles);
      const start = core.state.activeAct?.startBeat as number;
      let result: ServerMessage | undefined;
      for (let b = start; b < start + 12; b++) {
        // theorist is always late: its tap lands after the beat has closed
        for (const [conn, cid, role] of [
          ["A", "c-nav", "navigator"],
          ["B", "c-syn", "synaesthete"],
        ] as const) {
          tapAt(core, conn, cid, role, beatTime(schedule, b));
        }
        clock.t = beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS;
        const t = core.tick();
        tapAt(core, "C", "c-the", "theorist", beatTime(schedule, b)); // perfect delta, too late
        result ??= msgs(t, "actResult")[0];
      }
      expect(result).toMatchObject({ ok: false });
      if (result?.t === "actResult") {
        expect(result.perRole.theorist.hits).toBe(0);
        expect(result.perRole.navigator.hits).toBe(12);
      }
      expect(core.state.activeAct).toBeNull();
    });

    it("reconnecting mid-act keeps the participant in the run", () => {
      const { clock, core, schedule } = setup();
      core.startAct("act-3", roles);
      const start = core.state.activeAct?.startBeat as number;
      everyoneTaps(core, schedule, start);
      clock.t = beatTime(schedule, start) + BEAT_CLOSE_GRACE_MS;
      core.tick();
      // theorist drops and comes back on a new connection with the same cid
      core.onClose("C");
      join(core, "C2", "c-the", "theorist");
      for (const b of [start + 1, start + 2]) {
        tapAt(core, "A", "c-nav", "navigator", beatTime(schedule, b));
        tapAt(core, "B", "c-syn", "synaesthete", beatTime(schedule, b));
        tapAt(core, "C2", "c-the", "theorist", beatTime(schedule, b));
        clock.t = beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS;
        const t = core.tick();
        if (b === start + 2) expect(msgs(t, "actResult")[0]).toMatchObject({ ok: true });
      }
    });

    it("a player who joins after actStart is not a participant", () => {
      const clock = new Clock();
      const core = new RoomCore({ now: clock.now });
      join(core, "A", "c-nav", "navigator");
      join(core, "B", "c-syn", "synaesthete");
      core.startAct("act-4", roles);
      join(core, "C", "c-the", "theorist");
      expect(core.state.activeAct?.participants.map((p) => p.role)).toEqual(["navigator", "synaesthete"]);
    });

    it("ignores a second actStart while one is active", () => {
      const { core } = setup();
      core.startAct("act-5", roles);
      expect(core.startAct("act-6", roles)).toEqual([]);
      expect(core.state.activeAct?.actId).toBe("act-5");
    });

    it("beat interval literal is what the schedule carries", () => {
      const { schedule } = setup();
      expect(schedule.interval).toBe(BEAT_INTERVAL_MS);
    });
  });
});
