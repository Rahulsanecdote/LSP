import { describe, expect, it } from "vitest";
import {
  BEAT_WINDOW_MS,
  S2_APPROACH_MS,
  S2_DEPTH_M,
  S2_DESCENT_MS,
  S2_DOCK_MS,
  S2_FAIL_DEPTH_M,
  S2_PROMPT_DEPTH_M,
  S2_NAV_LINES,
  S2_NAV_LINE_REVEALS,
  S7_PHRASINGS,
  descentDepthM,
  descentTimeAt,
  evaluate,
  closeBeat,
  applyTap,
  parseClientMessage,
  parseServerMessage,
  s5CanClassify,
  startAct,
  trialConclusive,
  type SceneView,
} from "../src/index";

describe("scene rules (Task 3)", () => {
  it("descent depth is piecewise linear through the prompt and fail depths, pauses excluded, clamped", () => {
    const s2 = { startedAt: 1000, pausedAt: null, pausedTotal: 0 };
    expect(descentDepthM(1000, s2)).toBe(0);
    expect(descentDepthM(1000 + S2_DESCENT_MS / 2, s2)).toBeCloseTo(S2_PROMPT_DEPTH_M / 2, 6);
    expect(descentDepthM(1000 + S2_DESCENT_MS, s2)).toBeCloseTo(S2_PROMPT_DEPTH_M, 6);
    expect(descentDepthM(1000 + S2_DESCENT_MS + S2_APPROACH_MS, s2)).toBeCloseTo(S2_FAIL_DEPTH_M, 6);
    expect(descentDepthM(1000 + S2_DESCENT_MS + S2_APPROACH_MS + S2_DOCK_MS, s2)).toBeCloseTo(S2_DEPTH_M, 6);
    expect(descentDepthM(1000 + S2_DESCENT_MS * 9, s2)).toBe(S2_DEPTH_M);
    const paused = { startedAt: 1000, pausedAt: 2000, pausedTotal: 500 };
    expect(descentDepthM(5000, paused)).toBeCloseTo(((5000 - 1000 - 500 - 3000) / S2_DESCENT_MS) * S2_PROMPT_DEPTH_M, 6);
    expect(descentTimeAt(S2_PROMPT_DEPTH_M, s2)).toBeCloseTo(1000 + S2_DESCENT_MS, 6);
    expect(descentTimeAt(S2_FAIL_DEPTH_M, s2)).toBeCloseTo(1000 + S2_DESCENT_MS + S2_APPROACH_MS, 6);
    expect(descentTimeAt(1400, s2)).toBeCloseTo(1000 + S2_DESCENT_MS + S2_APPROACH_MS / 2, 6);
    // the two are inverses
    for (const d of [100, 1380, 1400, 1420, 1460, 1500]) expect(descentDepthM(descentTimeAt(d, s2), s2)).toBeCloseTo(d, 6);
  });

  it("a trial is conclusive inside the beat tolerance, on either side", () => {
    expect(trialConclusive(10_000, 10_000 + BEAT_WINDOW_MS)).toBe(true);
    expect(trialConclusive(10_000, 10_000 - BEAT_WINDOW_MS)).toBe(true);
    expect(trialConclusive(10_000, 10_000 + BEAT_WINDOW_MS + 1)).toBe(false);
    expect(s5CanClassify(2)).toBe(true);
    expect(s5CanClassify(1)).toBe(false);
  });

  it("exactly one Navigator line does not reveal, and exactly one phrasing is clean", () => {
    expect(S2_NAV_LINES.filter((l) => !S2_NAV_LINE_REVEALS[l])).toEqual(["humor-me"]);
    expect(S7_PHRASINGS.filter((p) => p === "clean")).toHaveLength(1);
  });

  it("an act with maxMisses closes on the third missed beat; without it Task 1 behaviour holds", () => {
    const base = { actId: "a", roles: ["navigator" as const], startBeat: 0, participants: [{ cid: "n", role: "navigator" as const }] };
    let a = startAct({ ...base, maxMisses: 3 });
    let b = startAct(base);
    for (let i = 0; i < 3; i++) {
      a = closeBeat(a, i); // nobody tapped: a miss
      b = closeBeat(b, i);
    }
    expect(evaluate(a)).toBe("failed");
    expect(evaluate(b)).toBe("open");
    // a hit between misses still counts toward the miss total
    let c = startAct({ ...base, maxMisses: 3 });
    c = closeBeat(c, 0);
    c = applyTap(c, { cid: "n", role: "navigator", beatIndex: 1, deltaMs: 5, hit: true }).state;
    c = closeBeat(c, 1);
    c = closeBeat(c, 2);
    expect(evaluate(c)).toBe("open");
    c = closeBeat(c, 3);
    expect(evaluate(c)).toBe("failed");
  });

  it("scene views and intents round-trip through the wire parsers", () => {
    const view: SceneView = {
      t: "scene",
      id: "s2",
      enteredAt: 5,
      debts: { navigator: 1, synaesthete: 0, theorist: 0 },
      present: ["navigator", "theorist"],
      log: [{ at: 5, kind: "system", text: "descent begins" }],
      s2: { attempt: 1, descentStartedAt: 5, pausedAt: null, pausedTotal: 0, descentMs: 120_000, approachMs: 40_000, dockMs: 60_000, prompted: false, reads: 0, fixed: false, afterFix: false, lines: [{ id: "humor-me", text: "Sarah, run a seal diagnostic for me, humor me" }], line: null, privateQuestion: null },
    };
    const parsed = parseServerMessage(JSON.stringify(view));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.msg).toEqual(view);
    const ev = parseServerMessage({ t: "sceneEvent", kind: "consoleReply", at: 99, replyKind: "self" });
    expect(ev.ok).toBe(true);
    for (const intent of [
      { t: "choose", cid: "c1", sceneId: "s2", promptId: "nav-line", optionId: "humor-me" },
      { t: "choose", cid: "c1", sceneId: "s5", promptId: "question", optionId: "q1", phase: "start" },
      { t: "continue", cid: "c1", sceneId: "lobby" },
      { t: "focus", cid: "c1", on: true },
      { t: "callAgain", cid: "c1" },
    ]) {
      expect(parseClientMessage(intent).ok).toBe(true);
    }
    expect(parseClientMessage({ t: "choose", cid: "c1", sceneId: "s9", promptId: "x", optionId: "y" }).ok).toBe(false);
  });
});
