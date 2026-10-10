import {
  ACT_DEBT,
  INTERLUDE_MS,
  S2_APPROACH_MS,
  S2_DESCENT_MS,
  S2_DIAGNOSTIC_MS,
  S2_DOCK_MS,
  S2_FAIL_DEPTH_M,
  S2_DEPTH_M,
  S2_NAV_LINE_REVEALS,
  S2_PROMPT_DEPTH_M,
  S5_COMMIT_HOLD_MS,
  S5_CONTROL_DECIDE_MS,
  S5_REPLY_LEAD_MS,
  S5_TRIALS,
  S5_TRIAL_MS,
  S7_AGAIN_MS,
  S7_DEMO_BEATS,
  S7_MAX_MISSES,
  S7_REPLY_DIM,
  S7_TRUST_CLEAN,
  S7_WINDOWS,
  beatTime,
  currentRun,
  descentTimeAt,
  missedBeats,
  nearestBeatIndex,
  s5CanClassify,
  trialConclusive,
  type ActResult,
  type BranchSet,
  type CallAgain,
  type DescentProfile,
  type Choose,
  type Continue,
  type Focus,
  type LedgerEntry,
  type Role,
  type S2NavLine,
  type SceneEvent,
  type SceneView,
  type TapScore,
} from "@lsp/protocol";
import { ROLES } from "@lsp/protocol";
import * as EP1 from "./ep1";
import { S2_SEAL_BRANCHSET } from "./fixtures";
import type { Outbound } from "./room";
import type { PlayerRecord, ReadRecord, RoomState, S5Trial, SceneState } from "./state";

/**
 * The scene host (Task 3, §7): drives `state.scene` through lobby → S2 → interlude → S5 → S7 →
 * end. It never reads a clock itself: RoomCore passes `now`, and timers go through
 * `nextWakeAt()` like the act's. Every transition ends with a per-role view for each connected
 * player, since what each role may know differs (scene.ts).
 */

export interface SceneCore {
  readonly state: RoomState;
  now(): number;
  /** paced durations are divided by this (SCENE_PACE); 1 in play */
  readonly pace: number;
  touch(): void;
  connectedPlayers(): PlayerRecord[];
  startAct(actId: string, roles: readonly Role[], maxMisses?: number): Outbound[];
  setBranchSet(branchSet: BranchSet): Outbound[];
}


export class SceneHost {
  constructor(private readonly core: SceneCore) {}

  private get scene(): SceneState {
    return this.core.state.scene;
  }

  private paced(ms: number): number {
    return Math.max(1, Math.round(ms / this.core.pace));
  }

  private profile(): DescentProfile {
    return { descentMs: this.paced(S2_DESCENT_MS), approachMs: this.paced(S2_APPROACH_MS), dockMs: this.paced(S2_DOCK_MS) };
  }

  private log(kind: LedgerEntry["kind"], text: string): void {
    this.scene.log.push({ at: this.core.now(), kind, text });
    if (this.scene.log.length > 200) this.scene.log.splice(0, this.scene.log.length - 200);
    this.core.touch();
  }

  private event(ev: Omit<SceneEvent, "t">): Outbound {
    return { to: { kind: "room" }, msg: { t: "sceneEvent", ...ev } };
  }

  /** One view per connected player, for its own role. */
  views(): Outbound[] {
    return this.core
      .connectedPlayers()
      .filter((p) => p.connId !== null)
      .map((p) => ({ to: { kind: "conn", connId: p.connId as string }, msg: this.view(p.role) }));
  }

  // -------------------------------------------------------------------------
  // Intents

  onChoose(player: PlayerRecord, msg: Choose): Outbound[] {
    const s = this.scene;
    if (msg.sceneId !== s.id) return [];
    const out: Outbound[] = [];
    switch (s.id) {
      case "s2":
        out.push(...this.s2Choose(player, msg));
        break;
      case "s5":
        out.push(...this.s5Choose(player, msg));
        break;
      case "s7":
        out.push(...this.s7Choose(player, msg));
        break;
      default:
        return [];
    }
    return out;
  }

  onContinue(player: PlayerRecord, msg: Continue): Outbound[] {
    const s = this.scene;
    if (msg.sceneId !== s.id || player.role !== "theorist") return [];
    switch (s.id) {
      case "lobby": {
        const present = new Set(this.core.connectedPlayers().map((p) => p.role));
        if (!ROLES.every((r) => present.has(r))) return [];
        return this.enterS2();
      }
      case "s5":
        return this.s5Continue();
      default:
        return [];
    }
  }

  onFocus(player: PlayerRecord, msg: Focus): Outbound[] {
    const s5 = this.scene.s5;
    if (player.role !== "synaesthete" || !s5) return [];
    s5.synFocusing = msg.on;
    this.core.touch();
    return this.views();
  }

  onCallAgain(player: PlayerRecord, _msg: CallAgain): Outbound[] {
    const s7 = this.scene.s7;
    if (player.role !== "synaesthete" || !s7 || s7.phase !== "between" || s7.againUsed) return [];
    s7.againUsed = true;
    s7.againUntil = null;
    s7.window += 1;
    s7.phase = "act";
    this.log("window", `Chen calls "again". Window ${s7.window}.`);
    const out = this.core.startAct(`s7-w${s7.window}`, [...ROLES], S7_MAX_MISSES);
    out.push(...this.views());
    return out;
  }

  /** A read ended (any scene): per-human DEBT follows the Navigator's counter; S2 and S5 note it. */
  onReadEnded(player: PlayerRecord, record: ReadRecord): Outbound[] {
    const s = this.scene;
    s.debts.navigator = this.core.state.debt;
    this.log("cost", `${player.label} read ${(record.durationMs / 1000).toFixed(1)} s${record.pastHorizon ? ", beyond the horizon" : ""}: DEBT +${record.debtDelta}.`);
    const out: Outbound[] = [];
    if (s.id === "s2" && s.s2) {
      s.s2.reads += 1;
      if (s.s2.reads === 2) out.push(...this.core.setBranchSet(EP1.S2_CONFIRM_BRANCHSET));
    }
    if (s.id === "s5" && s.s5) {
      const t = s.s5.trials[s.s5.current];
      if (t && !t.done) t.navRead = true;
    }
    out.push(...this.views());
    return out;
  }

  /** A scored tap (any scene): S5 times the Synaesthete's tap against the commit. */
  onTap(player: PlayerRecord, score: TapScore, cServerEst: number): Outbound[] {
    const s5 = this.scene.s5;
    if (this.scene.id !== "s5" || !s5 || player.role !== "synaesthete") return [];
    const t = s5.trials[s5.current];
    if (!t || t.done || t.commitAt === null || t.synTapAt !== null) return [];
    void score;
    t.synTapAt = cServerEst;
    t.synDeltaMs = cServerEst - t.commitAt;
    t.conclusive = trialConclusive(t.commitAt, cServerEst);
    this.log("window", `Trial ${t.index + 1}: Chen's tap ${t.synDeltaMs >= 0 ? "+" : ""}${t.synDeltaMs.toFixed(0)} ms from the commit: ${t.conclusive ? "conclusive" : "inconclusive"}.`);
    return this.finishTrialIfDue(t);
  }

  /** The consent act closed (S7). */
  onActResult(result: ActResult): Outbound[] {
    const s = this.scene;
    const s7 = s.s7;
    if (s.id !== "s7" || !s7 || s7.phase !== "act") return [];
    const out: Outbound[] = [];
    const now = this.core.now();
    if (result.ok) {
      for (const r of ROLES) s.debts[r] += ACT_DEBT;
      this.core.state.debt = s.debts.navigator;
      s.consent = s7.window === 1 ? "clean" : "retried";
      if (s7.phrasing === "clean") {
        s7.outcome = "clean";
        s.trust += S7_TRUST_CLEAN;
        this.log("act", `Consent beat, window ${s7.window}: clean. DEBT +1 all round. The lights dim.`);
        out.push(this.event({ kind: "lightsReply", at: now, amount: S7_REPLY_DIM }));
      } else {
        s7.outcome = "silent";
        this.log("act", `Consent beat, window ${s7.window}: landed, with a condition. DEBT +1 all round. Silence.`);
        out.push(this.event({ kind: "silence", at: now }));
      }
      s7.phase = "done";
      s.ending = "answered";
      out.push(...this.enterEnd());
      return out;
    }
    s7.windowsFailed += 1;
    this.log("act", `Consent beat, window ${s7.window}: the window closed.`);
    if (s7.window < S7_WINDOWS && !s7.againUsed) {
      s7.phase = "between";
      s7.againUntil = now + S7_AGAIN_MS;
      out.push(...this.views());
      return out;
    }
    out.push(...this.blackout());
    return out;
  }

  // -------------------------------------------------------------------------
  // Timers

  nextWakeAt(): number | null {
    const s = this.scene;
    const c: number[] = [];
    if (s.id === "s2" && s.s2 && !s.s2.failed) {
      const s2 = s.s2;
      const profile = this.profile();
      if (s2.pausedAt !== null) {
        if (s2.diagnosticEndsAt !== null) c.push(s2.diagnosticEndsAt);
      } else {
        if (!s2.prompted) c.push(descentTimeAt(S2_PROMPT_DEPTH_M, s2, profile));
        if (!s2.fixed) c.push(descentTimeAt(S2_FAIL_DEPTH_M, s2, profile));
        c.push(descentTimeAt(S2_DEPTH_M, s2, profile));
      }
    }
    if (s.id === "interlude" && s.interludeUntil !== null) c.push(s.interludeUntil);
    if (s.id === "s5" && s.s5) {
      const t = s.s5.trials[s.s5.current];
      if (t && !t.done) {
        c.push(t.endsAt);
        if (t.replyAt !== null && !t.replySent) c.push(t.replyAt);
        if (t.commitAt !== null && !t.committed) c.push(t.commitAt);
      }
    }
    if (s.id === "s7" && s.s7) {
      if (s.s7.phase === "demo") c.push(s.s7.demoEndsAt);
      if (s.s7.phase === "between" && s.s7.againUntil !== null) c.push(s.s7.againUntil);
    }
    return c.length ? Math.min(...c) : null;
  }

  tick(now: number): Outbound[] {
    const s = this.scene;
    const out: Outbound[] = [];
    if (s.id === "s2" && s.s2) out.push(...this.s2Tick(now));
    else if (s.id === "interlude") {
      if (s.interludeUntil !== null && now >= s.interludeUntil) {
        s.interludeIndex += 1;
        if (s.interludeIndex >= EP1.INTERLUDE_CARDS.length) out.push(...this.enterS5());
        else {
          s.interludeUntil = now + this.paced(INTERLUDE_MS);
          this.core.touch();
          out.push(...this.views());
        }
      }
    } else if (s.id === "s5" && s.s5) out.push(...this.s5Tick(now));
    else if (s.id === "s7" && s.s7) {
      const s7 = s.s7;
      if (s7.phase === "demo" && now >= s7.demoEndsAt) {
        s7.phase = "phrasing";
        this.log("system", "The demonstration ends. The console holds the rhythm.");
        out.push(...this.views());
      } else if (s7.phase === "between" && s7.againUntil !== null && now >= s7.againUntil) {
        out.push(...this.blackout());
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // S2

  private enterS2(): Outbound[] {
    const s = this.scene;
    const now = this.core.now();
    const attempt = (s.s2?.attempt ?? 0) + 1;
    s.id = "s2";
    s.enteredAt = now;
    s.s2 = { attempt, startedAt: now, pausedAt: null, pausedTotal: 0, prompted: false, reads: 0, line: null, revealed: null, synChoice: null, tool: null, diagnosticEndsAt: null, fixed: false, fixedAt: null, failed: false };
    this.log("system", attempt === 1 ? "Descent begins. 0 m." : `Emergency ascent complete. Descent restarts, attempt ${attempt}. DEBT carried.`);
    const out = this.core.setBranchSet(S2_SEAL_BRANCHSET);
    out.push(...this.views());
    return out;
  }

  private s2Choose(player: PlayerRecord, msg: Choose): Outbound[] {
    const s2 = this.scene.s2;
    if (!s2 || s2.failed) return [];
    const out: Outbound[] = [];
    if (player.role === "navigator" && msg.promptId === "nav-line" && s2.line === null) {
      const line = EP1.S2_NAV_LINES.find((o) => o.id === msg.optionId);
      if (!line) return [];
      s2.line = line.id;
      s2.revealed = S2_NAV_LINE_REVEALS[line.id as S2NavLine] ?? true;
      this.log("comms", `Elena: "${line.text}"`);
    } else if (player.role === "synaesthete" && msg.promptId === "syn-choice" && s2.synChoice === null) {
      const choice = EP1.S2_SYN_CHOICES.find((o) => o.id === msg.optionId);
      if (!choice) return [];
      s2.synChoice = choice.id;
      if (choice.id === "ask-elena") this.log("private", `Chen → Elena (private channel): "Did you just read?"`);
      if (choice.id === "vouch") this.log("comms", `Chen → Sarah: "She read. Act on it."`);
    } else if (player.role === "theorist" && msg.promptId === "tool" && s2.tool === null && !s2.fixed) {
      const tool = EP1.S2_TOOLS.find((o) => o.id === msg.optionId);
      if (!tool) return [];
      s2.tool = tool.id;
      const now = this.core.now();
      if (tool.id === "diagnostic") {
        s2.pausedAt = now;
        s2.diagnosticEndsAt = now + this.paced(S2_DIAGNOSTIC_MS);
        this.log("window", "Sarah runs a seal diagnostic. Descent paused, 30 s.");
      } else if (tool.id === "tighten") {
        out.push(...this.fixSeal(now, "Sarah tightens seal 4 remotely. Logged: unexplained manual intervention."));
      } else {
        this.log("window", "Sarah holds course.");
      }
    } else {
      return [];
    }
    this.core.touch();
    out.push(...this.views());
    return out;
  }

  private fixSeal(now: number, text: string): Outbound[] {
    const s2 = this.scene.s2;
    if (!s2) return [];
    s2.fixed = true;
    s2.fixedAt = now;
    if (s2.pausedAt !== null) {
      s2.pausedTotal += now - s2.pausedAt;
      s2.pausedAt = null;
    }
    s2.diagnosticEndsAt = null;
    this.log("window", text);
    return [this.event({ kind: "sealFixed", at: now })];
  }

  private s2Tick(now: number): Outbound[] {
    const s2 = this.scene.s2;
    if (!s2 || s2.failed) return [];
    const out: Outbound[] = [];
    const profile = this.profile();
    let changed = false;
    if (s2.pausedAt !== null && s2.diagnosticEndsAt !== null && now >= s2.diagnosticEndsAt) {
      out.push(...this.fixSeal(now, "Diagnostic complete: fault on seal 4 found and corrected."));
      changed = true;
    }
    if (s2.pausedAt === null) {
      if (!s2.prompted && now >= descentTimeAt(S2_PROMPT_DEPTH_M, s2, profile)) {
        s2.prompted = true;
        this.log("system", "−1,380 m. Reflex prompt to the Navigator: exits < 3.");
        changed = true;
      }
      if (!s2.fixed && now >= descentTimeAt(S2_FAIL_DEPTH_M, s2, profile)) {
        s2.failed = true;
        this.log("system", "−1,420 m. Seal 4 fails. Emergency ascent.");
        out.push(this.event({ kind: "sealFailed", at: now }));
        out.push(...this.enterS2());
        return out;
      }
      if (s2.fixed && now >= descentTimeAt(S2_DEPTH_M, s2, profile)) {
        this.log("system", "−1,500 m. The rig docks.");
        out.push(...this.enterInterlude(now));
        return out;
      }
    }
    if (changed) {
      this.core.touch();
      out.push(...this.views());
    }
    return out;
  }

  private enterInterlude(now: number): Outbound[] {
    const s = this.scene;
    s.id = "interlude";
    s.enteredAt = now;
    s.interludeIndex = 0;
    s.interludeUntil = now + this.paced(INTERLUDE_MS);
    this.core.touch();
    return this.views();
  }

  // -------------------------------------------------------------------------
  // S5

  private enterS5(): Outbound[] {
    const s = this.scene;
    const now = this.core.now();
    s.id = "s5";
    s.enteredAt = now;
    s.interludeUntil = null;
    s.s5 = { started: false, trials: [], current: -1, classification: null, synFocusing: false, synCharged: false };
    this.log("system", "The console registers an EM event: structured, 520 ms interval, pulse—pause—pulse.");
    return this.views();
  }

  private s5Continue(): Outbound[] {
    const s5 = this.scene.s5;
    if (!s5) return [];
    const current = s5.trials[s5.current];
    if (!s5.started) {
      s5.started = true;
      this.log("window", "Sarah proposes the test: three trials.");
      return this.startTrial(0);
    }
    if (current && !current.done) return [];
    if (s5.trials.length < S5_TRIALS) return this.startTrial(s5.trials.length);
    if (s5.classification === null) return [];
    return this.enterS7();
  }

  private startTrial(index: number): Outbound[] {
    const s5 = this.scene.s5;
    if (!s5) return [];
    const now = this.core.now();
    const kind = index === S5_TRIALS - 1 ? "control" : "question";
    const t: S5Trial = {
      index,
      kind,
      startedAt: now,
      endsAt: now + S5_TRIAL_MS,
      question: null,
      questionKind: null,
      commitAt: null,
      replyAt: null,
      replySent: false,
      committed: false,
      synTapAt: null,
      synDeltaMs: null,
      conclusive: null,
      navRead: false,
      synFocused: false,
      done: false,
    };
    if (kind === "control") {
      t.commitAt = now + S5_CONTROL_DECIDE_MS;
      t.replyAt = t.commitAt - (S5_REPLY_LEAD_MS[index] ?? 300);
      t.questionKind = "self";
    }
    s5.trials.push(t);
    s5.current = index;
    this.log("window", kind === "control" ? EP1.S5_CONTROL_NOTE : `Trial ${index + 1} opens.`);
    return this.views();
  }

  private s5Choose(player: PlayerRecord, msg: Choose): Outbound[] {
    const s5 = this.scene.s5;
    if (!s5) return [];
    const now = this.core.now();
    if (player.role === "navigator" && msg.promptId === "question") {
      const t = s5.trials[s5.current];
      if (!t || t.done || t.kind !== "question" || t.committed) return [];
      if (msg.phase === "cancel") {
        if (t.commitAt !== null && now < t.commitAt) {
          t.question = null;
          t.questionKind = null;
          t.commitAt = null;
          t.replyAt = null;
          this.core.touch();
          return this.views();
        }
        return [];
      }
      if (t.commitAt !== null) return [];
      const q = (EP1.S5_QUESTIONS[t.index] ?? []).find((o) => o.id === msg.optionId);
      if (!q) return [];
      t.question = q.id;
      t.questionKind = q.kind;
      t.commitAt = now + S5_COMMIT_HOLD_MS;
      t.replyAt = t.commitAt - (S5_REPLY_LEAD_MS[t.index] ?? 300);
      this.core.touch();
      return this.views();
    }
    if (player.role === "theorist" && msg.promptId === "classify") {
      if (s5.trials.length < S5_TRIALS || s5.trials.some((t) => !t.done) || s5.classification !== null) return [];
      if (!s5CanClassify(s5.trials.filter((t) => t.conclusive).length)) return [];
      if (msg.optionId !== "anomaly" && msg.optionId !== "artifact") return [];
      s5.classification = msg.optionId;
      this.log("window", `Sarah logs the test as ${msg.optionId}.`);
      return this.views();
    }
    return [];
  }

  private s5Tick(now: number): Outbound[] {
    const s5 = this.scene.s5;
    if (!s5) return [];
    const t = s5.trials[s5.current];
    if (!t || t.done) return [];
    const out: Outbound[] = [];
    let changed = false;
    if (t.replyAt !== null && !t.replySent && now >= t.replyAt) {
      t.replySent = true;
      out.push(this.event({ kind: "consoleReply", at: t.replyAt, replyKind: t.questionKind ?? "self" }));
      this.log("window", `Trial ${t.index + 1}: the console logs a reply at ${t.replyAt.toFixed(0)}.`);
      changed = true;
    }
    if (t.commitAt !== null && !t.committed && now >= t.commitAt) {
      t.committed = true;
      t.synFocused = s5.synFocusing;
      out.push(this.event({ kind: "mindCommit", at: t.commitAt }));
      this.log("window", t.kind === "control" ? `Trial ${t.index + 1}: the moment she would have decided, ${t.commitAt.toFixed(0)}.` : `Trial ${t.index + 1}: Elena commits at ${t.commitAt.toFixed(0)}.`);
      changed = true;
      // he marked it before it landed (an early mark, within tolerance or not): the trial closes now
      if (t.synTapAt !== null) {
        out.push(...this.finishTrialIfDue(t));
        return out;
      }
    }
    if (now >= t.endsAt) {
      if (t.conclusive === null) {
        t.conclusive = false;
        this.log("window", `Trial ${t.index + 1}: no tap. Inconclusive.`);
      }
      out.push(...this.finishTrialIfDue(t, true));
      return out;
    }
    if (changed) {
      this.core.touch();
      out.push(...this.views());
    }
    return out;
  }

  private finishTrialIfDue(t: S5Trial, force = false): Outbound[] {
    const s5 = this.scene.s5;
    if (!s5) return [];
    if (!force && !t.committed) {
      // tapped before the commit (anticipation): the trial closes when the commit lands
      this.core.touch();
      return this.views();
    }
    t.done = true;
    const out: Outbound[] = [];
    if (s5.trials.length === S5_TRIALS && s5.trials.every((x) => x.done)) {
      const conclusive = s5.trials.filter((x) => x.conclusive).length;
      if (!s5CanClassify(conclusive)) {
        s5.classification = "noise";
        this.log("window", `${conclusive} of ${S5_TRIALS} trials conclusive. Logged as noise.`);
      }
      if (!s5.synCharged && s5.trials.every((x) => x.synFocused)) {
        s5.synCharged = true;
        this.scene.debts.synaesthete += 1;
        this.log("cost", "Chen held overlay focus through all three trials: DEBT +1.");
      }
    }
    this.core.touch();
    out.push(...this.views());
    return out;
  }

  // -------------------------------------------------------------------------
  // S7

  private enterS7(): Outbound[] {
    const s = this.scene;
    const now = this.core.now();
    const schedule = this.core.state.schedule;
    if (!schedule) return [];
    s.id = "s7";
    s.enteredAt = now;
    const demoStartBeat = nearestBeatIndex(schedule, now) + 1;
    s.s7 = {
      phase: "demo",
      demoStartBeat,
      demoEndsAt: beatTime(schedule, demoStartBeat + S7_DEMO_BEATS),
      phrasing: null,
      window: 1,
      againUsed: false,
      againUntil: null,
      outcome: null,
      windowsFailed: 0,
    };
    this.log("system", "A deliberate collapse, electromagnetic signature, pulse—pause—pulse. It is teaching her to send.");
    return this.views();
  }

  private s7Choose(player: PlayerRecord, msg: Choose): Outbound[] {
    const s7 = this.scene.s7;
    if (!s7 || player.role !== "theorist" || msg.promptId !== "phrasing" || s7.phase !== "phrasing") return [];
    const p = EP1.S7_PHRASINGS.find((o) => o.id === msg.optionId);
    if (!p) return [];
    s7.phrasing = p.id;
    s7.phase = "act";
    this.log("act", `Sarah's phrasing: "${p.text}"`);
    const out = this.core.startAct(`s7-w${s7.window}`, [...ROLES], S7_MAX_MISSES);
    out.push(...this.views());
    return out;
  }

  private blackout(): Outbound[] {
    const s = this.scene;
    const s7 = s.s7;
    const now = this.core.now();
    if (s7) {
      s7.phase = "done";
      s7.outcome = "failed";
      s7.againUntil = null;
    }
    s.consent = "failed";
    s.ending = "unanswered";
    this.log("system", "The window closes. Blackout. The episode ends on an unanswered knock.");
    const out: Outbound[] = [this.event({ kind: "blackout", at: now })];
    out.push(...this.enterEnd());
    return out;
  }

  private enterEnd(): Outbound[] {
    const s = this.scene;
    s.id = "end";
    s.enteredAt = this.core.now();
    this.core.touch();
    return this.views();
  }

  // -------------------------------------------------------------------------
  // Projection

  view(role: Role): SceneView {
    const s = this.scene;
    const present = [...new Set(this.core.connectedPlayers().map((p) => p.role))];
    const base: SceneView = { t: "scene", id: s.id, enteredAt: s.enteredAt, debts: { ...s.debts }, present, log: role === "theorist" ? s.log.slice(-40) : [] };
    if (s.id === "s2" && s.s2) {
      const s2 = s.s2;
      base.s2 = {
        attempt: s2.attempt,
        descentStartedAt: s2.startedAt,
        pausedAt: s2.pausedAt,
        pausedTotal: s2.pausedTotal,
        ...this.profile(),
        prompted: s2.prompted,
        reads: s2.reads,
        fixed: s2.fixed,
        afterFix: s2.fixed,
      };
      if (role === "navigator") {
        base.s2.lines = [...EP1.S2_NAV_LINES];
        base.s2.line = s2.line;
        base.s2.privateQuestion = s2.synChoice === "ask-elena" ? "Did you just read?" : null;
      }
      if (role === "synaesthete") {
        base.s2.choices = [...EP1.S2_SYN_CHOICES];
        base.s2.choice = s2.synChoice;
      }
      if (role === "theorist") {
        const comms: string[] = [];
        const line = EP1.S2_NAV_LINES.find((o) => o.id === s2.line);
        if (line) comms.push(`Elena: "${line.text}"`);
        if (s2.synChoice === "vouch") comms.push(`Chen: "She read. Act on it."`);
        base.s2.comms = comms;
        base.s2.telemetry = { ...EP1.S2_TELEMETRY };
        base.s2.tools = [...EP1.S2_TOOLS];
        base.s2.tool = s2.tool;
        base.s2.diagnosticEndsAt = s2.diagnosticEndsAt;
      }
    }
    if (s.id === "interlude") {
      const card = EP1.INTERLUDE_CARDS[s.interludeIndex] ?? EP1.INTERLUDE_CARDS[0];
      if (card) base.interlude = { index: s.interludeIndex, title: card.title, text: card.text, until: s.interludeUntil ?? s.enteredAt };
    }
    if (s.id === "s5" && s.s5) {
      const s5 = s.s5;
      const current = s5.trials[s5.current];
      base.s5 = {
        started: s5.started,
        trials: s5.trials.map((t) => ({
          index: t.index,
          kind: t.kind,
          startedAt: t.startedAt,
          endsAt: t.endsAt,
          // the pending commit is known to the Synaesthete (he watches it build) and to the Navigator; the console learns it when it lands
          commitAt: role === "theorist" && !t.committed ? null : t.commitAt,
          committed: t.committed,
          replyAt: t.replySent ? t.replyAt : null,
          replyKind: t.replySent ? t.questionKind : null,
          synTapAt: t.synTapAt,
          synDeltaMs: t.synDeltaMs,
          conclusive: t.conclusive,
          navRead: t.navRead,
          synFocused: t.synFocused,
          done: t.done,
        })),
        current: s5.current,
        conclusiveCount: s5.trials.filter((t) => t.conclusive).length,
        classification: s5.classification,
      };
      if (role === "navigator" && current && current.kind === "question") {
        base.s5.questions = [...(EP1.S5_QUESTIONS[current.index] ?? [])];
        base.s5.holdingQuestion = current.question;
      }
      if (role === "synaesthete") base.s5.focusing = s5.synFocusing;
      if (role === "theorist") {
        const allDone = s5.trials.length === S5_TRIALS && s5.trials.every((t) => t.done);
        base.s5.canClassify = allDone && s5.classification === null;
        base.s5.canAdvance = !s5.started || (current !== undefined && current.done && (s5.trials.length < S5_TRIALS || s5.classification !== null));
      }
    }
    if (s.id === "s7" && s.s7) {
      const s7 = s.s7;
      const act = this.core.state.activeAct;
      base.s7 = {
        phase: s7.phase,
        demoStartBeat: s7.demoStartBeat,
        demoBeats: S7_DEMO_BEATS,
        window: s7.window,
        phrasing: s7.phrasing,
        run: act ? currentRun(act) : 0,
        missed: act ? missedBeats(act) : 0,
        startBeat: act ? act.startBeat : null,
        againAvailable: role === "synaesthete" && s7.phase === "between" && !s7.againUsed,
        againUntil: s7.againUntil,
        outcome: s7.outcome,
        dim: s7.outcome === "clean" ? S7_REPLY_DIM : 0,
      };
      if (role === "theorist") base.s7.phrasings = [...EP1.S7_PHRASINGS];
    }
    if (s.id === "end") {
      base.end = { ending: s.ending ?? "unanswered", classification: s.s5?.classification ?? null, consent: s.consent ?? "failed" };
      if (s.s7) {
        const act = this.core.state.activeAct;
        base.s7 = { phase: "done", demoStartBeat: s.s7.demoStartBeat, demoBeats: S7_DEMO_BEATS, window: s.s7.window, phrasing: s.s7.phrasing, run: act ? currentRun(act) : 0, missed: 0, startBeat: null, againAvailable: false, againUntil: null, outcome: s.s7.outcome, dim: s.s7.outcome === "clean" ? S7_REPLY_DIM : 0 };
      }
    }
    return base;
  }
}
