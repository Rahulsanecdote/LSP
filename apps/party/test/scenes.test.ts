import { describe, expect, it } from "vitest";
import {
  BEAT_CLOSE_GRACE_MS,
  INTERLUDE_MS,
  S2_APPROACH_MS,
  S2_DESCENT_MS,
  S2_DIAGNOSTIC_MS,
  S2_DOCK_MS,
  S2_FAIL_DEPTH_M,
  S2_PROMPT_DEPTH_M,
  S5_COMMIT_HOLD_MS,
  S5_CONTROL_DECIDE_MS,
  S5_REPLY_LEAD_MS,
  S5_TRIAL_MS,
  S7_AGAIN_MS,
  S7_DEMO_BEATS,
  S7_REPLY_DIM,
  S7_TRUST_CLEAN,
  beatTime,
  descentTimeAt,
  type Role,
  type Schedule,
  type SceneEvent,
  type SceneView,
  type ServerMessage,
} from "@lsp/protocol";
import { RoomCore, type Outbound } from "../src/core/index.js";

class Clock {
  t = 1000;
  now = (): number => this.t;
}

const CONN: Record<Role, [string, string]> = { navigator: ["A", "c-nav"], synaesthete: ["B", "c-syn"], theorist: ["C", "c-the"] };

function crew(pace = 1): { clock: Clock; core: RoomCore; schedule: Schedule } {
  const clock = new Clock();
  const core = new RoomCore({ now: clock.now, pace });
  for (const role of ["navigator", "synaesthete", "theorist"] as Role[]) {
    const [conn, cid] = CONN[role];
    core.onConnect(conn);
    core.onMessage(conn, { t: "hello", cid, role });
  }
  return { clock, core, schedule: core.state.schedule as Schedule };
}

/** Move the clock and let the room handle everything that became due (schedule re-issues included). */
function advanceTo(core: RoomCore, clock: Clock, t: number): Outbound[] {
  const out: Outbound[] = [];
  // step through every pending wake so ordered timers (reply before commit) fire in order
  for (let guard = 0; guard < 200; guard++) {
    const next = core.nextWakeAt();
    if (next === null || next > t) break;
    clock.t = Math.max(clock.t, next);
    out.push(...core.tick());
  }
  clock.t = t;
  out.push(...core.tick());
  return out;
}

function send(core: RoomCore, role: Role, msg: Record<string, unknown>): Outbound[] {
  const [conn, cid] = CONN[role];
  return core.onMessage(conn, { ...msg, cid });
}

function viewFor(out: Outbound[], role: Role): SceneView | undefined {
  const conn = CONN[role][0];
  const v = out.filter((o) => o.msg.t === "scene" && o.to.kind === "conn" && o.to.connId === conn).map((o) => o.msg as SceneView);
  return v[v.length - 1];
}

function events(out: Outbound[]): SceneEvent[] {
  return out.filter((o) => o.msg.t === "sceneEvent").map((o) => o.msg as SceneEvent);
}

function msgs(out: Outbound[], t: ServerMessage["t"]): ServerMessage[] {
  return out.filter((o) => o.msg.t === t).map((o) => o.msg);
}

function profileAt(pace: number): { descentMs: number; approachMs: number; dockMs: number } {
  return { descentMs: S2_DESCENT_MS / pace, approachMs: S2_APPROACH_MS / pace, dockMs: S2_DOCK_MS / pace };
}

function beginDive(core: RoomCore): Outbound[] {
  return send(core, "theorist", { t: "continue", sceneId: "lobby" });
}

/** Through S2 (tighten) and the interlude into S5. */
function reachS5(core: RoomCore, clock: Clock): void {
  beginDive(core);
  send(core, "theorist", { t: "choose", sceneId: "s2", promptId: "tool", optionId: "tighten" });
  const s2 = core.state.scene.s2;
  if (!s2) throw new Error("no s2");
  advanceTo(core, clock, descentTimeAt(1500, s2, profileAt(core.pace)) + 1);
  expect(core.state.scene.id).toBe("interlude");
  advanceTo(core, clock, clock.t + 2 * (INTERLUDE_MS / core.pace) + 10);
  expect(core.state.scene.id).toBe("s5");
}

/** Through S5 with two conclusive trials and an "anomaly" verdict, into S7. */
function reachS7(core: RoomCore, clock: Clock): void {
  reachS5(core, clock);
  send(core, "theorist", { t: "continue", sceneId: "s5" }); // trial 1
  send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q1-what", phase: "start" });
  let commit = clock.t + S5_COMMIT_HOLD_MS;
  advanceTo(core, clock, commit + 40);
  send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit + 40 });
  send(core, "theorist", { t: "continue", sceneId: "s5" }); // trial 2
  send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q2-where", phase: "start" });
  commit = clock.t + S5_COMMIT_HOLD_MS;
  advanceTo(core, clock, commit + 60);
  send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit + 60 });
  send(core, "theorist", { t: "continue", sceneId: "s5" }); // trial 3, control
  commit = clock.t + S5_CONTROL_DECIDE_MS;
  advanceTo(core, clock, commit + 20);
  send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit + 20 });
  send(core, "theorist", { t: "choose", sceneId: "s5", promptId: "classify", optionId: "anomaly" });
  send(core, "theorist", { t: "continue", sceneId: "s5" });
  expect(core.state.scene.id).toBe("s7");
}

function everyoneTaps(core: RoomCore, schedule: Schedule, beat: number, miss: Role[] = []): void {
  for (const role of ["navigator", "synaesthete", "theorist"] as Role[]) {
    send(core, role, { t: "tap", role, cLocal: 0, cServerEst: beatTime(schedule, beat) + (miss.includes(role) ? 300 : 10) });
  }
}

describe("scenes (Task 3)", () => {
  it("lobby: only the Theorist starts the dive, and only with all three seats present", () => {
    const clock = new Clock();
    const core = new RoomCore({ now: clock.now });
    core.onConnect("A");
    core.onMessage("A", { t: "hello", cid: "c-nav", role: "navigator" });
    core.onConnect("C");
    core.onMessage("C", { t: "hello", cid: "c-the", role: "theorist" });
    expect(core.onMessage("C", { t: "continue", cid: "c-the", sceneId: "lobby" })).toEqual([]);
    expect(core.state.scene.id).toBe("lobby");
    core.onConnect("B");
    const out = core.onMessage("B", { t: "hello", cid: "c-syn", role: "synaesthete" });
    expect(viewFor(out, "synaesthete")?.present.sort()).toEqual(["navigator", "synaesthete", "theorist"]);
    expect(core.onMessage("A", { t: "continue", cid: "c-nav", sceneId: "lobby" })).toEqual([]);
    const started = core.onMessage("C", { t: "continue", cid: "c-the", sceneId: "lobby" });
    expect(core.state.scene.id).toBe("s2");
    expect(msgs(started, "branchSet")).toHaveLength(1); // the S2 read, to the navigator
    expect(viewFor(started, "navigator")?.s2?.lines?.map((l) => l.id)).toContain("humor-me");
    expect(viewFor(started, "synaesthete")?.s2?.lines).toBeUndefined();
    expect(viewFor(started, "theorist")?.s2?.tools?.length).toBe(3);
    expect(JSON.stringify(viewFor(started, "synaesthete"))).not.toContain("seal failure");
  });

  it("S2: the prompt lands at −1,380 m, tighten fixes the seal, docking leads through the interlude to S5", () => {
    const { clock, core } = crew();
    const started = beginDive(core);
    expect(viewFor(started, "navigator")?.s2?.prompted).toBe(false);
    const s2 = core.state.scene.s2;
    if (!s2) throw new Error("no s2");
    const promptAt = descentTimeAt(S2_PROMPT_DEPTH_M, s2);
    let out = advanceTo(core, clock, promptAt - 1);
    expect(core.state.scene.s2?.prompted).toBe(false);
    out = advanceTo(core, clock, promptAt + 1);
    expect(core.state.scene.s2?.prompted).toBe(true);
    expect(viewFor(out, "navigator")?.s2?.prompted).toBe(true);
    // she asks without revealing; the Theorist sees the line as comms
    out = send(core, "navigator", { t: "choose", sceneId: "s2", promptId: "nav-line", optionId: "humor-me" });
    expect(core.state.scene.s2?.revealed).toBe(false);
    expect(viewFor(out, "theorist")?.s2?.comms?.[0]).toContain("humor me");
    expect(viewFor(out, "synaesthete")?.s2?.comms).toBeUndefined();
    out = send(core, "theorist", { t: "choose", sceneId: "s2", promptId: "tool", optionId: "tighten" });
    expect(events(out).map((e) => e.kind)).toEqual(["sealFixed"]);
    expect(core.state.scene.s2?.fixed).toBe(true);
    expect(viewFor(out, "synaesthete")?.s2?.afterFix).toBe(true);
    out = advanceTo(core, clock, descentTimeAt(1500, s2) + 1);
    expect(core.state.scene.id).toBe("interlude");
    expect(viewFor(out, "navigator")?.interlude?.title).toContain("ARRIVAL");
    out = advanceTo(core, clock, clock.t + INTERLUDE_MS + 1);
    expect(viewFor(out, "navigator")?.interlude?.title).toContain("DEEP BRANCH");
    advanceTo(core, clock, clock.t + INTERLUDE_MS + 1);
    expect(core.state.scene.id).toBe("s5");
  });

  it("S2: a diagnostic pauses the descent for 30 s and then fixes the seal", () => {
    const { clock, core } = crew();
    beginDive(core);
    const s2 = core.state.scene.s2;
    if (!s2) throw new Error("no s2");
    advanceTo(core, clock, descentTimeAt(S2_PROMPT_DEPTH_M, s2) + 1);
    send(core, "theorist", { t: "choose", sceneId: "s2", promptId: "tool", optionId: "diagnostic" });
    expect(core.state.scene.s2?.pausedAt).toBe(clock.t);
    const out = advanceTo(core, clock, clock.t + S2_DIAGNOSTIC_MS + 1);
    expect(events(out).map((e) => e.kind)).toContain("sealFixed");
    expect(core.state.scene.s2?.fixed).toBe(true);
    expect(core.state.scene.s2?.pausedAt).toBeNull();
    expect(core.state.scene.s2?.pausedTotal).toBeGreaterThanOrEqual(S2_DIAGNOSTIC_MS);
    expect(core.state.scene.s2?.failed).toBe(false);
  });

  it("S2: holding course fails the seal at −1,420 m and restarts S2 with DEBT carried", () => {
    const { clock, core } = crew();
    beginDive(core);
    const s2 = core.state.scene.s2;
    if (!s2) throw new Error("no s2");
    // one read first, so there is debt to carry
    send(core, "navigator", { t: "readStart", cLocal: 0, cServerEst: clock.t });
    clock.t += 2000;
    send(core, "navigator", { t: "readEnd", cLocal: 0, cServerEst: clock.t });
    expect(core.state.scene.debts.navigator).toBe(1);
    send(core, "theorist", { t: "choose", sceneId: "s2", promptId: "tool", optionId: "hold-course" });
    const out = advanceTo(core, clock, descentTimeAt(S2_FAIL_DEPTH_M, s2) + 1);
    expect(events(out).map((e) => e.kind)).toContain("sealFailed");
    expect(core.state.scene.id).toBe("s2");
    expect(core.state.scene.s2?.attempt).toBe(2);
    expect(core.state.scene.s2?.fixed).toBe(false);
    expect(core.state.scene.debts.navigator).toBe(1);
    expect(viewFor(out, "theorist")?.log.some((l) => l.text.includes("Seal 4 fails"))).toBe(true);
  });

  it("S2: a second read to confirm switches the Navigator to the four-failure set, +1 more", () => {
    const { clock, core } = crew();
    beginDive(core);
    for (let i = 0; i < 2; i++) {
      send(core, "navigator", { t: "readStart", cLocal: 0, cServerEst: clock.t });
      clock.t += 1500;
      const out = send(core, "navigator", { t: "readEnd", cLocal: 0, cServerEst: clock.t });
      const bs = msgs(out, "branchSet");
      if (i === 0) expect(bs).toHaveLength(0);
      else {
        expect(bs).toHaveLength(1);
        expect((bs[0] as { streams: unknown[] }).streams).toHaveLength(5);
      }
    }
    expect(core.state.scene.debts.navigator).toBe(2);
    expect(core.state.scene.s2?.reads).toBe(2);
  });

  it("S5: the reply precedes the commit, the Synaesthete's tap decides the trial, two conclusive lets the Theorist classify", () => {
    const { clock, core } = crew();
    reachS5(core, clock);
    expect(send(core, "navigator", { t: "continue", sceneId: "s5" })).toEqual([]); // only the Theorist runs the test
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    expect(core.state.scene.s5?.current).toBe(0);
    // the Synaesthete holds focus through the first trial
    send(core, "synaesthete", { t: "focus", on: true });
    let out = send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q1-what", phase: "start" });
    const commit = clock.t + S5_COMMIT_HOLD_MS;
    // the Synaesthete sees the pending commit; the console does not yet
    expect(viewFor(out, "synaesthete")?.s5?.trials[0]?.commitAt).toBe(commit);
    expect(viewFor(out, "theorist")?.s5?.trials[0]?.commitAt).toBeNull();
    out = advanceTo(core, clock, commit + 1);
    const evs = events(out);
    expect(evs.map((e) => e.kind)).toEqual(["consoleReply", "mindCommit"]);
    expect(evs[0]?.at).toBe(commit - (S5_REPLY_LEAD_MS[0] as number));
    expect(evs[0]?.replyKind).toBe("ancient");
    expect(evs[1]?.at).toBe(commit);
    send(core, "synaesthete", { t: "focus", on: false });
    // a tap 120 ms after the commit: conclusive, and it closes the trial
    out = send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit + 120 });
    const t0 = core.state.scene.s5?.trials[0];
    expect(t0?.synDeltaMs).toBe(120);
    expect(t0?.conclusive).toBe(true);
    expect(t0?.synFocused).toBe(true);
    expect(t0?.done).toBe(true);
    expect(viewFor(out, "theorist")?.s5?.canAdvance).toBe(true);
    // trial 2: a sloppy tap is inconclusive
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q2-seal", phase: "start" });
    const commit2 = clock.t + S5_COMMIT_HOLD_MS;
    advanceTo(core, clock, commit2 + 10);
    send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit2 + 400 });
    expect(core.state.scene.s5?.trials[1]?.conclusive).toBe(false);
    // trial 3 is the control: the server picks the moment, the reply still comes first
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    expect(core.state.scene.s5?.trials[2]?.kind).toBe("control");
    const commit3 = clock.t + S5_CONTROL_DECIDE_MS;
    out = advanceTo(core, clock, commit3 + 5);
    expect(events(out).map((e) => e.kind)).toEqual(["consoleReply", "mindCommit"]);
    send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit3 - 50 });
    expect(core.state.scene.s5?.trials[2]?.conclusive).toBe(true);
    const v = viewFor(send(core, "theorist", { t: "focus", on: true }), "theorist"); // no-op intent, just to read a view
    void v;
    expect(core.state.scene.s5?.classification).toBeNull();
    expect(core.state.scene.debts.synaesthete).toBe(0); // focus was not held through all three
    send(core, "theorist", { t: "choose", sceneId: "s5", promptId: "classify", optionId: "anomaly" });
    expect(core.state.scene.s5?.classification).toBe("anomaly");
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    expect(core.state.scene.id).toBe("s7");
  });

  it("S5: fewer than two conclusive trials is logged as noise, and no verdict is accepted", () => {
    const { clock, core } = crew();
    reachS5(core, clock);
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    for (let i = 0; i < 3; i++) {
      if (i < 2) send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: i === 0 ? "q1-me" : "q2-back", phase: "start" });
      // nobody taps: every trial times out
      advanceTo(core, clock, clock.t + S5_TRIAL_MS + 1);
      expect(core.state.scene.s5?.trials[i]?.done).toBe(true);
      if (i < 2) send(core, "theorist", { t: "continue", sceneId: "s5" });
    }
    expect(core.state.scene.s5?.classification).toBe("noise");
    expect(send(core, "theorist", { t: "choose", sceneId: "s5", promptId: "classify", optionId: "anomaly" })).toEqual([]);
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    expect(core.state.scene.id).toBe("s7");
  });

  it("S5: a mark slightly before the commit is conclusive and closes the trial when the commit lands", () => {
    const { clock, core } = crew();
    reachS5(core, clock);
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q1-hear", phase: "start" });
    const commit = clock.t + S5_COMMIT_HOLD_MS;
    advanceTo(core, clock, commit - 30);
    send(core, "synaesthete", { t: "tap", role: "synaesthete", cLocal: 0, cServerEst: commit - 30 });
    expect(core.state.scene.s5?.trials[0]?.done).toBe(false); // waiting for the commit
    const out = advanceTo(core, clock, commit + 1);
    expect(events(out).map((e) => e.kind)).toContain("mindCommit");
    const t = core.state.scene.s5?.trials[0];
    expect(t?.synDeltaMs).toBe(-30);
    expect(t?.conclusive).toBe(true);
    expect(t?.done).toBe(true);
  });

  it("S5: releasing the question before the commit cancels it", () => {
    const { clock, core } = crew();
    reachS5(core, clock);
    send(core, "theorist", { t: "continue", sceneId: "s5" });
    send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q1-what", phase: "start" });
    expect(core.state.scene.s5?.trials[0]?.commitAt).not.toBeNull();
    clock.t += 300;
    send(core, "navigator", { t: "choose", sceneId: "s5", promptId: "question", optionId: "q1-what", phase: "cancel" });
    expect(core.state.scene.s5?.trials[0]?.commitAt).toBeNull();
    expect(core.state.scene.s5?.trials[0]?.question).toBeNull();
  });

  it("S7: demonstration, the clean phrasing, three clean beats: the lights dim, DEBT +1 all round, TRUST +3, answered", () => {
    const { clock, core, schedule } = crew();
    reachS7(core, clock);
    const s7 = core.state.scene.s7;
    if (!s7) throw new Error("no s7");
    expect(s7.phase).toBe("demo");
    const debtsBefore = { ...core.state.scene.debts };
    let out = advanceTo(core, clock, beatTime(schedule, s7.demoStartBeat + S7_DEMO_BEATS) + 1);
    expect(core.state.scene.s7?.phase).toBe("phrasing");
    expect(viewFor(out, "theorist")?.s7?.phrasings?.map((p) => p.id)).toContain("clean");
    expect(viewFor(out, "navigator")?.s7?.phrasings).toBeUndefined();
    out = send(core, "theorist", { t: "choose", sceneId: "s7", promptId: "phrasing", optionId: "clean" });
    expect(msgs(out, "actStart")).toHaveLength(1);
    const act = core.state.activeAct;
    if (!act) throw new Error("no act");
    expect(act.maxMisses).toBe(3);
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b);
      out = advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(msgs(out, "actResult")[0]).toMatchObject({ ok: true });
    const evs = events(out);
    expect(evs.map((e) => e.kind)).toEqual(["lightsReply"]);
    expect(evs[0]?.amount).toBe(S7_REPLY_DIM);
    expect(core.state.scene.id).toBe("end");
    expect(core.state.scene.ending).toBe("answered");
    expect(core.state.scene.consent).toBe("clean");
    expect(core.state.scene.trust).toBe(S7_TRUST_CLEAN);
    for (const r of ["navigator", "synaesthete", "theorist"] as Role[]) expect(core.state.scene.debts[r]).toBe(debtsBefore[r] + 1);
    expect(core.state.debt).toBe(core.state.scene.debts.navigator);
    expect(viewFor(out, "theorist")?.end).toEqual({ ending: "answered", classification: "anomaly", consent: "clean" });
  });

  it("S7: a conditional phrasing lands the beat but is answered with silence", () => {
    const { clock, core, schedule } = crew();
    reachS7(core, clock);
    const s7 = core.state.scene.s7;
    if (!s7) throw new Error("no s7");
    advanceTo(core, clock, beatTime(schedule, s7.demoStartBeat + S7_DEMO_BEATS) + 1);
    send(core, "theorist", { t: "choose", sceneId: "s7", promptId: "phrasing", optionId: "cond-safe" });
    const act = core.state.activeAct;
    if (!act) throw new Error("no act");
    let out: Outbound[] = [];
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b);
      out = advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(events(out).map((e) => e.kind)).toEqual(["silence"]);
    expect(core.state.scene.s7?.outcome).toBe("silent");
    expect(core.state.scene.trust).toBe(0);
    expect(core.state.scene.ending).toBe("answered");
  });

  it("S7: three missed beats close the window; 'again' once; a second failure is blackout", () => {
    const { clock, core, schedule } = crew();
    reachS7(core, clock);
    const s7 = core.state.scene.s7;
    if (!s7) throw new Error("no s7");
    advanceTo(core, clock, beatTime(schedule, s7.demoStartBeat + S7_DEMO_BEATS) + 1);
    send(core, "theorist", { t: "choose", sceneId: "s7", promptId: "phrasing", optionId: "clean" });
    let act = core.state.activeAct;
    if (!act) throw new Error("no act");
    let out: Outbound[] = [];
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b, ["synaesthete"]);
      out = advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(msgs(out, "actResult")[0]).toMatchObject({ ok: false });
    expect(core.state.scene.s7?.phase).toBe("between");
    expect(viewFor(out, "synaesthete")?.s7?.againAvailable).toBe(true);
    expect(viewFor(out, "navigator")?.s7?.againAvailable).toBe(false);
    // only the Synaesthete can call again
    expect(send(core, "navigator", { t: "callAgain" })).toEqual([]);
    out = send(core, "synaesthete", { t: "callAgain" });
    expect(msgs(out, "actStart")).toHaveLength(1);
    expect(core.state.scene.s7?.window).toBe(2);
    act = core.state.activeAct;
    if (!act) throw new Error("no act 2");
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b, ["theorist"]);
      out = advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(events(out).map((e) => e.kind)).toEqual(["blackout"]);
    expect(core.state.scene.id).toBe("end");
    expect(core.state.scene.ending).toBe("unanswered");
    expect(core.state.scene.consent).toBe("failed");
    expect(core.state.scene.s7?.outcome).toBe("failed");
  });

  it("S7: not calling again in time is blackout too; a clean second window counts as retried", () => {
    const { clock, core, schedule } = crew();
    reachS7(core, clock);
    const s7 = core.state.scene.s7;
    if (!s7) throw new Error("no s7");
    advanceTo(core, clock, beatTime(schedule, s7.demoStartBeat + S7_DEMO_BEATS) + 1);
    send(core, "theorist", { t: "choose", sceneId: "s7", promptId: "phrasing", optionId: "clean" });
    let act = core.state.activeAct;
    if (!act) throw new Error("no act");
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b, ["navigator"]);
      advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(core.state.scene.s7?.phase).toBe("between");
    // the retry path first
    send(core, "synaesthete", { t: "callAgain" });
    act = core.state.activeAct;
    if (!act) throw new Error("no act 2");
    let out: Outbound[] = [];
    for (const b of [act.startBeat, act.startBeat + 1, act.startBeat + 2]) {
      everyoneTaps(core, schedule, b);
      out = advanceTo(core, clock, beatTime(schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    expect(core.state.scene.consent).toBe("retried");
    expect(core.state.scene.ending).toBe("answered");
    void out;
    // and the timeout path, on a fresh crew
    const fresh = crew();
    reachS7(fresh.core, fresh.clock);
    const f7 = fresh.core.state.scene.s7;
    if (!f7) throw new Error("no s7");
    advanceTo(fresh.core, fresh.clock, beatTime(fresh.schedule, f7.demoStartBeat + S7_DEMO_BEATS) + 1);
    send(fresh.core, "theorist", { t: "choose", sceneId: "s7", promptId: "phrasing", optionId: "clean" });
    const fact = fresh.core.state.activeAct;
    if (!fact) throw new Error("no act");
    for (const b of [fact.startBeat, fact.startBeat + 1, fact.startBeat + 2]) {
      everyoneTaps(fresh.core, fresh.schedule, b, ["navigator"]);
      advanceTo(fresh.core, fresh.clock, beatTime(fresh.schedule, b) + BEAT_CLOSE_GRACE_MS + 1);
    }
    const o = advanceTo(fresh.core, fresh.clock, fresh.clock.t + S7_AGAIN_MS + 1);
    expect(events(o).map((e) => e.kind)).toEqual(["blackout"]);
    expect(fresh.core.state.scene.ending).toBe("unanswered");
  });

  it("pace divides the descent, the diagnostic and the interlude, and nothing a client sends changes it", () => {
    const { clock, core } = crew(10);
    beginDive(core);
    const s2 = core.state.scene.s2;
    if (!s2) throw new Error("no s2");
    const v = core.sceneView("navigator");
    expect(v.s2?.descentMs).toBe(S2_DESCENT_MS / 10);
    expect(v.s2?.approachMs).toBe(S2_APPROACH_MS / 10);
    send(core, "theorist", { t: "choose", sceneId: "s2", promptId: "tool", optionId: "tighten" });
    advanceTo(core, clock, descentTimeAt(1500, s2, profileAt(10)) + 1);
    expect(core.state.scene.id).toBe("interlude");
    advanceTo(core, clock, clock.t + 2 * (INTERLUDE_MS / 10) + 10);
    expect(core.state.scene.id).toBe("s5");
  });

  it("a reconnecting player gets the current scene in its snapshot", () => {
    const { clock, core } = crew();
    beginDive(core);
    core.onClose("A");
    clock.t += 500;
    core.onConnect("A2");
    const out = core.onMessage("A2", { t: "hello", cid: "c-nav", role: "navigator" });
    const snap = msgs(out, "snapshot")[0] as { scene?: SceneView } | undefined;
    expect(snap?.scene?.id).toBe("s2");
    expect(snap?.scene?.s2?.lines?.length).toBe(4);
  });
});
