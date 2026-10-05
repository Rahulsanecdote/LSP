import { describe, expect, it } from "vitest";
import { HORIZON_MS, PROJECTION_RATE_DEFAULT, type Role, type ServerMessage } from "@lsp/protocol";
import { RoomCore, S2_SEAL_BRANCHSET, type Outbound } from "../src/core/index";

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

function crew(): { clock: Clock; core: RoomCore } {
  const clock = new Clock();
  const core = new RoomCore({ now: clock.now });
  join(core, "N", "c-nav", "navigator");
  join(core, "S", "c-syn", "synaesthete");
  join(core, "T", "c-the", "theorist");
  return { clock, core };
}

const start = (core: RoomCore, conn = "N", cid = "c-nav"): Outbound[] =>
  core.onMessage(conn, { t: "readStart", cid, cLocal: 0, cServerEst: 0 });
const end = (core: RoomCore, conn = "N", cid = "c-nav"): Outbound[] =>
  core.onMessage(conn, { t: "readEnd", cid, cLocal: 0, cServerEst: 0 });

describe("Navigator read (Task 2)", () => {
  it("a fresh room carries the S2 seal fixture and sends it to the navigator only", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    const nav = join(core, "N", "c-nav", "navigator");
    const syn = join(core, "S", "c-syn", "synaesthete");
    const bs = msgs(nav, "branchSet");
    expect(bs).toHaveLength(1);
    expect(bs[0]).toEqual(S2_SEAL_BRANCHSET);
    expect(nav.find((o) => o.msg.t === "branchSet")?.to).toEqual({ kind: "conn", connId: "N" });
    expect(msgs(syn, "branchSet")).toHaveLength(0);
    expect(S2_SEAL_BRANCHSET.horizonMs).toBe(HORIZON_MS);
    expect(S2_SEAL_BRANCHSET.projectionRate).toBe(PROJECTION_RATE_DEFAULT);
  });

  it("start broadcasts a readEvent with the reader's label and current debt", () => {
    const { clock, core } = crew();
    clock.advance(500);
    const out = start(core);
    expect(out).toEqual([
      { to: { kind: "room" }, msg: { t: "readEvent", readId: "r1", label: "p1", phase: "start", serverTime: 1500, debt: 0 } },
    ]);
    expect(core.state.activeRead).toMatchObject({ readId: "r1", cid: "c-nav", startedAt: 1500 });
  });

  it("a read released inside the horizon costs 1 DEBT, timed by the server", () => {
    const { clock, core } = crew();
    start(core);
    clock.advance(3000); // 3 s × 15 = 45 s projected, inside 90 s
    const out = end(core);
    expect(msgs(out, "readEvent")[0]).toEqual({
      t: "readEvent",
      readId: "r1",
      label: "p1",
      phase: "end",
      serverTime: 4000,
      debt: 1,
      durationMs: 3000,
      projectedMs: 45_000,
      pastHorizon: false,
      debtDelta: 1,
      endedBy: "release",
    });
    expect(core.state.debt).toBe(1);
    expect(core.state.activeRead).toBeNull();
    expect(core.state.readLog).toHaveLength(1);
  });

  it("the horizon is reached at exactly 6 s of hold; past it the read costs 2", () => {
    const { clock, core } = crew();
    start(core);
    clock.advance(6000); // 90 000 projected: not past
    expect(msgs(end(core), "readEvent")[0]).toMatchObject({ pastHorizon: false, debtDelta: 1, debt: 1 });
    start(core);
    clock.advance(6001);
    expect(msgs(end(core), "readEvent")[0]).toMatchObject({ pastHorizon: true, debtDelta: 2, debt: 3, projectedMs: 90_015 });
  });

  it("only the connected navigator can read", () => {
    const { core } = crew();
    expect(start(core, "S", "c-syn")).toEqual([]);
    expect(start(core, "T", "c-the")).toEqual([]);
    // a navigator cid sent from the wrong socket is ignored too
    expect(start(core, "S", "c-nav")).toEqual([]);
    expect(core.state.activeRead).toBeNull();
  });

  it("one read at a time: a second start is ignored, a stray end is ignored", () => {
    const { core } = crew();
    expect(end(core)).toEqual([]);
    start(core);
    expect(start(core)).toEqual([]);
    expect(core.state.activeRead?.readId).toBe("r1");
    end(core);
    expect(end(core)).toEqual([]);
    expect(core.state.debt).toBe(1);
  });

  it("a dropped socket releases the read and still costs", () => {
    const { clock, core } = crew();
    start(core);
    clock.advance(7000);
    const out = core.onClose("N");
    const ev = msgs(out, "readEvent")[0];
    expect(ev).toMatchObject({ phase: "end", endedBy: "disconnect", pastHorizon: true, debtDelta: 2, debt: 2 });
    expect(core.state.activeRead).toBeNull();
    expect(core.state.readLog[0]).toMatchObject({ endedBy: "disconnect", cServerEstEnd: null });
    // reconnecting navigator is not mid-read and gets the BranchSet again
    const again = join(core, "N2", "c-nav", "navigator");
    expect(msgs(again, "branchSet")).toHaveLength(1);
    expect(msgs(again, "snapshot")[0]).toMatchObject({ debt: 2, activeRead: null });
  });

  it("snapshot tells a late joiner that a read is in progress and the debt so far", () => {
    const { clock, core } = crew();
    start(core);
    clock.advance(100);
    const out = join(core, "X", "c-late", "theorist");
    expect(msgs(out, "snapshot")[0]).toMatchObject({ debt: 0, activeRead: { readId: "r1", label: "p1", startedAt: 1000 } });
  });

  it("cannot steer: a read changes nothing but debt, activeRead and readLog", () => {
    const { clock, core } = crew();
    const strip = (s: typeof core.state) => {
      const { debt: _d, activeRead: _a, readLog: _r, nextReadId: _n, ...rest } = structuredClone(s);
      return rest;
    };
    const before = strip(core.state);
    const outs: Outbound[] = [];
    outs.push(...start(core));
    clock.advance(2500);
    outs.push(...end(core));
    outs.push(...start(core));
    clock.advance(9000);
    outs.push(...end(core));
    expect(strip(core.state)).toEqual(before);
    // and the only thing anyone was told is that a read happened
    expect(new Set(outs.map((o) => o.msg.t))).toEqual(new Set(["readEvent"]));
    expect(outs.every((o) => o.to.kind === "room")).toBe(true);
    // no stream content leaked in the broadcasts
    expect(JSON.stringify(outs)).not.toContain("seal");
  });

  it("setBranchSet replaces the content and sends it to connected navigators only", () => {
    const { core } = crew();
    const next = { ...S2_SEAL_BRANCHSET, streams: S2_SEAL_BRANCHSET.streams.slice(0, 3) };
    const out = core.setBranchSet(next);
    expect(out).toEqual([{ to: { kind: "conn", connId: "N" }, msg: next }]);
    expect(core.state.branchSet).toBe(next);
  });

  it("migrates a pre-Task-2 persisted state", () => {
    const clock = new Clock();
    const legacy = new RoomCore({ now: clock.now }).state;
    const stripped = { ...legacy } as Record<string, unknown>;
    delete stripped.debt;
    delete stripped.activeRead;
    delete stripped.readLog;
    delete stripped.nextReadId;
    delete stripped.branchSet;
    const core = new RoomCore({ now: clock.now }, stripped as unknown as typeof legacy);
    expect(core.state.debt).toBe(0);
    expect(core.state.branchSet).toEqual(S2_SEAL_BRANCHSET);
    expect(core.dirty).toBe(true);
  });
});
