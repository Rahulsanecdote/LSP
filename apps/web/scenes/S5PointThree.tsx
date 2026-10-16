"use client";

import { S5_COMMIT_HOLD_MS, type Role, type S5TrialView, type SceneView } from "@lsp/protocol";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Ledger } from "@/components/instruments/Ledger";
import { NavigatorRead } from "@/components/instruments/NavigatorRead";
import { SynaestheteOverlay } from "@/components/instruments/SynaestheteOverlay";
import type { BeatClient, BeatClientSnapshot } from "@/lib/beatClient";
import { Debts, Waveform, roomNow, toLocal } from "./common";

/** how long the "too quick" note stays after a press released before the commit */
const TOO_QUICK_NOTE_MS = 2_500;

export function S5PointThree({ snap, client, role, scene }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; role: Role; scene: SceneView }) {
  const s5 = scene.s5;
  const trial = s5?.trials[s5.current] ?? null;
  const now = roomNow(client);
  const schedule = snap?.schedule ?? null;
  if (!s5) return null;

  switch (role) {
    case "navigator":
      return <NavigatorS5 snap={snap} client={client} scene={scene} trial={trial} />;
    case "synaesthete": {
      const commitLocal = trial && !trial.done ? toLocal(client, trial.commitAt) : null;
      const committed = trial?.committed ?? false;
      const caption = !s5.started ? "the console registers an EM event" : trial && !trial.done ? (trial.commitAt === null ? `trial ${trial.index + 1} — watch her mind-shape` : committed ? "committed — mark it" : "building…") : trial ? `trial ${trial.index + 1}: ${trial.conclusive ? "conclusive" : "inconclusive"}` : "";
      return (
        <SynaestheteOverlay snap={snap} ringY={0.68} commitAtLocal={commitLocal} onFocus={(on) => client.current?.focus(on)} caption={caption}>
          <div className="scene-ui" style={{ alignItems: "center" }}>
            <div className="card muted" style={{ fontSize: 12, alignSelf: "stretch" }}>Hold the field to focus the overlay. Mark the instant her mind commits.</div>
            <button
              type="button"
              className="bigtap"
              data-testid="tap"
              data-commit-local={commitLocal === null || trial?.synTapAt ? "" : commitLocal.toFixed(0)}
              disabled={!trial || trial.done || trial.synTapAt !== null}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                client.current?.tap();
              }}
            >
              MARK
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              {s5.trials.map((t) => (t.done ? (t.conclusive ? "●" : "○") : "·")).join(" ")}
            </div>
          </div>
        </SynaestheteOverlay>
      );
    }
    case "theorist":
      return (
        <main style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 40 }}>
          <div className="panel">
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Console · EM event · 520 ms · pulse—pause—pulse</div>
            {schedule && <Waveform startBeat={Math.floor((now ?? 0) / 520 / 6) * 6} beats={6} epoch={schedule.epoch} now={now} active={true} />}
          </div>
          <Debts debts={scene.debts} />
          {s5.trials.map((t) => (
            <TrialLine key={t.index} t={t} />
          ))}
          {s5.canClassify && (
            <div className="wheel" data-testid="classify">
              <div className="muted" style={{ fontSize: 12 }}>
                {s5.conclusiveCount} of 3 conclusive. What goes in the Ledger?
              </div>
              <button type="button" data-testid="classify-anomaly" onClick={() => client.current?.choose("s5", "classify", "anomaly")}>
                Anomaly — this opens the question.
              </button>
              <button type="button" data-testid="classify-artifact" onClick={() => client.current?.choose("s5", "classify", "artifact")}>
                Artifact — this closes it and keeps Upstairs calm.
              </button>
            </div>
          )}
          {s5.classification === "noise" && <div className="muted" data-testid="noise">Too few conclusive trials. Logged as noise.</div>}
          <button type="button" className="primary" data-testid="advance" data-can-advance={s5.canAdvance ? "1" : "0"} disabled={!s5.canAdvance} onClick={() => client.current?.continue("s5")}>
            {!s5.started ? "Propose the test: three trials" : s5.trials.length < 3 ? `Trial ${s5.trials.length + 1}` : "Continue"}
          </button>
          <Ledger log={scene.log} />
        </main>
      );
  }
}

function TrialLine({ t }: { t: S5TrialView }) {
  const span = 8000;
  const x = (at: number | null) => (at === null ? null : Math.max(0, Math.min(1, (at - t.startedAt) / span)) * 300);
  const reply = x(t.replyAt);
  const commit = x(t.commitAt);
  const tap = x(t.synTapAt);
  return (
    <div className="panel" data-testid={`trial-${t.index}`} data-done={t.done ? "1" : "0"} data-conclusive={t.conclusive === null ? "" : t.conclusive ? "1" : "0"} style={{ fontSize: 13 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          Trial {t.index + 1} {t.kind === "control" ? "(control: she asks nothing)" : ""}
        </span>
        <span className={t.conclusive === null ? "muted" : t.conclusive ? "ok" : "bad"}>{t.conclusive === null ? (t.done ? "no tap" : "…") : t.conclusive ? "conclusive" : "inconclusive"}</span>
      </div>
      <svg viewBox="0 0 300 28" width="100%" height="28" aria-hidden>
        <line x1={0} x2={300} y1={14} y2={14} stroke="#2a2d36" />
        {reply !== null && <line x1={reply} x2={reply} y1={2} y2={26} stroke="#e39a55" strokeWidth={2} />}
        {commit !== null && t.committed && <line x1={commit} x2={commit} y1={2} y2={26} stroke="#6fa8ff" strokeWidth={2} />}
        {tap !== null && <circle cx={tap} cy={14} r={4} fill="#c98de0" />}
      </svg>
      <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
        {t.replyAt !== null && t.commitAt !== null && t.committed ? `reply ${(t.commitAt - t.replyAt).toFixed(0)} ms before the commit` : t.replyAt !== null ? "reply logged" : ""}
        {t.synDeltaMs !== null ? ` · Chen ${t.synDeltaMs >= 0 ? "+" : ""}${t.synDeltaMs.toFixed(0)} ms` : ""}
        {t.navRead ? " · she read (+1)" : ""}
      </div>
    </div>
  );
}

function NavigatorS5({ snap, client, scene, trial }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; scene: SceneView; trial: S5TrialView | null }) {
  const s5 = scene.s5;
  const holdingId = useRef<string | null>(null);
  // whether the current trial had committed when the finger lifted: a lift before it is too quick
  const committedRef = useRef(false);
  committedRef.current = trial?.committed ?? false;
  const [tooQuick, setTooQuick] = useState(false);
  const tooQuickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (tooQuickTimer.current) clearTimeout(tooQuickTimer.current);
  }, []);
  const down = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      // keep the hold on this button if the finger drifts off it (a drift used to cancel)
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic pointer (the e2e) has nothing to capture
      }
      holdingId.current = id;
      setTooQuick(false);
      client.current?.choose("s5", "question", id, "start");
    },
    [client],
  );
  const up = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const id = holdingId.current;
      holdingId.current = null;
      if (!id) return;
      // released before the commit: the server treats this as a cancel; after it, it is ignored
      client.current?.choose("s5", "question", id, "cancel");
      if (!committedRef.current) {
        setTooQuick(true);
        if (tooQuickTimer.current) clearTimeout(tooQuickTimer.current);
        tooQuickTimer.current = setTimeout(() => setTooQuick(false), TOO_QUICK_NOTE_MS);
      }
    },
    [client],
  );
  if (!s5) return null;
  const pending = trial?.commitAt !== null && trial?.commitAt !== undefined && !trial.committed;
  const prompt = !s5.started ? "the console registers an EM event" : trial && !trial.done ? (trial.kind === "control" ? "ask nothing. Let the moment pass." : trial.committed ? "committed" : pending ? "committing…" : `trial ${trial.index + 1} — press and hold a question until the bar fills`) : "waiting for Sarah";
  return (
    <NavigatorRead snap={snap} client={client} prompt={prompt}>
      <div className="scene-ui">
        {trial && !trial.done && trial.kind === "question" && s5.questions && (
          <div className="wheel" data-testid="questions" data-committed={trial.committed ? "1" : "0"}>
            {s5.questions.map((q) => (
              <button
                key={q.id}
                type="button"
                data-testid={`q-${q.id}`}
                className={s5.holdingQuestion === q.id ? (trial.committed ? "chosen" : "holding") : ""}
                disabled={(pending || trial.committed) && s5.holdingQuestion !== q.id}
                onPointerDown={(e) => down(e, q.id)}
                onPointerUp={up}
                onPointerCancel={up}
                onContextMenu={(e) => e.preventDefault()}
                style={{ position: "relative", overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              >
                {q.text}
                {s5.holdingQuestion === q.id && pending && <span aria-hidden style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: "100%", background: "var(--accent)", transformOrigin: "left", animation: `lsp-grow ${S5_COMMIT_HOLD_MS}ms linear forwards` }} />}
              </button>
            ))}
          </div>
        )}
        {trial && !trial.done && trial.kind === "question" && !trial.committed && (
          <div className="card muted" data-testid="hold-hint" style={{ fontSize: 13 }}>
            {tooQuick ? "Too quick: hold until the bar fills." : `Hold ${S5_COMMIT_HOLD_MS / 1000} s: that is Elena thinking it.`}
          </div>
        )}
        {trial && trial.kind === "control" && !trial.done && <div className="card muted">Sarah's control: think nothing. Let the knock come to an empty room.</div>}
        {trial && trial.done && <div className="card muted" data-testid="trial-done">Trial {trial.index + 1} logged.</div>}
      </div>
    </NavigatorRead>
  );
}
