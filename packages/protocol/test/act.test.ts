import { describe, expect, it } from "vitest";
import {
  actResult,
  applyTap,
  closeBeat,
  currentRun,
  evaluate,
  startAct,
  type ActState,
  type Role,
} from "../src/index.js";

const roles: Role[] = ["navigator", "synaesthete", "theorist"];
const participants = roles.map((role) => ({ cid: `c-${role}`, role }));

function open(): ActState {
  return startAct({ actId: "a1", roles, startBeat: 10, participants });
}

/** Everyone taps beat `b`; `missing` roles miss or don't tap. */
function beat(
  state: ActState,
  b: number,
  opts: { miss?: Role[]; silent?: Role[]; deltas?: Partial<Record<Role, number>> } = {},
): ActState {
  let s = state;
  for (const role of roles) {
    if (opts.silent?.includes(role)) continue;
    const hit = !opts.miss?.includes(role);
    s = applyTap(s, {
      cid: `c-${role}`,
      role,
      beatIndex: b,
      deltaMs: opts.deltas?.[role] ?? (hit ? 20 : 200),
      hit,
    }).state;
  }
  return closeBeat(s, b);
}

describe("consent act", () => {
  it("clean success: three consecutive all-hit beats", () => {
    let s = open();
    expect(evaluate(s)).toBe("open");
    s = beat(s, 10);
    s = beat(s, 11);
    expect(evaluate(s)).toBe("open");
    s = beat(s, 12);
    expect(evaluate(s)).toBe("ok");
    const r = actResult(s, true);
    expect(r.ok).toBe(true);
    for (const role of roles) {
      expect(r.perRole[role].hits).toBe(3);
      expect(r.perRole[role].deltas).toEqual([20, 20, 20]);
    }
  });

  it("a single miss by anyone resets the shared run", () => {
    let s = open();
    s = beat(s, 10);
    s = beat(s, 11);
    s = beat(s, 12, { miss: ["theorist"] });
    expect(currentRun(s)).toBe(0);
    expect(evaluate(s)).toBe("open");
    s = beat(s, 13);
    s = beat(s, 14);
    expect(evaluate(s)).toBe("open");
    s = beat(s, 15);
    expect(evaluate(s)).toBe("ok");
    const r = actResult(s, true);
    expect(r.perRole.theorist.hits).toBe(5);
    expect(r.perRole.navigator.hits).toBe(6);
  });

  it("a listed role that does not tap on a beat has missed it", () => {
    let s = open();
    s = beat(s, 10);
    s = beat(s, 11, { silent: ["synaesthete"] });
    expect(currentRun(s)).toBe(0);
    expect(s.beats["11"]?.outcomes.synaesthete).toBe("miss");
  });

  it("a late joiner does not count", () => {
    let s = startAct({
      actId: "a2",
      roles,
      startBeat: 10,
      participants: participants.filter((p) => p.role !== "theorist"),
    });
    // a theorist who joined after actStart taps perfectly on every beat
    for (const b of [10, 11, 12]) {
      for (const role of roles) {
        const res = applyTap(s, { cid: `c-${role}`, role, beatIndex: b, deltaMs: 0, hit: true });
        s = res.state;
        if (role === "theorist") expect(res.disposition).toBe("notParticipant");
      }
      s = closeBeat(s, b);
    }
    // the listed theorist role was never served by a participant, so every beat is a miss for it
    expect(evaluate(s)).toBe("open");
    expect(currentRun(s)).toBe(0);
  });

  it("taps from roles not listed in the act are ignored", () => {
    const s = startAct({ actId: "a3", roles: ["navigator"], startBeat: 0, participants });
    const res = applyTap(s, { cid: "c-theorist", role: "theorist", beatIndex: 0, deltaMs: 0, hit: true });
    expect(res.disposition).toBe("roleNotListed");
    expect(res.state).toBe(s);
  });

  it("fails at the 12-beat cap with perRole filled", () => {
    let s = open();
    for (let b = 10; b < 22; b++) s = beat(s, b, { miss: b % 3 === 0 ? ["navigator"] : [] });
    expect(evaluate(s)).toBe("failed");
    const r = actResult(s, false);
    expect(r.ok).toBe(false);
    expect(r.perRole.navigator.hits).toBe(8);
    expect(r.perRole.synaesthete.hits).toBe(12);
    expect(r.perRole.navigator.deltas).toHaveLength(12);
  });

  it("a tap arriving after its beat closed is ignored and never reassigned", () => {
    let s = open();
    s = beat(s, 10, { silent: ["navigator"] });
    const late = applyTap(s, { cid: "c-navigator", role: "navigator", beatIndex: 10, deltaMs: 40, hit: true });
    expect(late.disposition).toBe("beatClosed");
    expect(late.state.beats["10"]?.outcomes.navigator).toBe("miss");
    expect(late.state.beats["11"]).toBeUndefined();
  });

  it("only the first tap per role per beat counts", () => {
    let s = open();
    s = applyTap(s, { cid: "c-navigator", role: "navigator", beatIndex: 10, deltaMs: 10, hit: true }).state;
    const dup = applyTap(s, { cid: "c-navigator", role: "navigator", beatIndex: 10, deltaMs: 300, hit: false });
    expect(dup.disposition).toBe("duplicate");
    expect(dup.state.beats["10"]?.outcomes.navigator).toBe("hit");
  });

  it("taps outside the act's beat range are ignored", () => {
    const s = open();
    expect(applyTap(s, { cid: "c-navigator", role: "navigator", beatIndex: 9, deltaMs: 0, hit: true }).disposition).toBe("outOfRange");
    expect(applyTap(s, { cid: "c-navigator", role: "navigator", beatIndex: 22, deltaMs: 0, hit: true }).disposition).toBe("outOfRange");
  });

  it("reconnect does not reset anyone: the same cid keeps counting", () => {
    let s = open();
    s = beat(s, 10);
    s = beat(s, 11);
    // navigator "reconnects" between beats; its cid is unchanged so its tap counts normally
    s = beat(s, 12);
    expect(evaluate(s)).toBe("ok");
  });

  it("beats must close in order", () => {
    const s = open();
    expect(() => closeBeat(s, 11)).toThrow();
  });
});
