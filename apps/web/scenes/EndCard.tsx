"use client";

import type { Role, SceneView } from "@lsp/protocol";
import { Fragment } from "react";
import { ROLE_NAMES } from "./common";

export function EndCard({ scene }: { scene: SceneView }) {
  const end = scene.end;
  if (!end) return null;
  const answered = end.ending === "answered";
  return (
    <main className="interlude endcard" data-testid="end" data-ending={end.ending} data-consent={end.consent}>
      <div>
        <h1>Episode 1 · Descent</h1>
        <p className="verdict">{answered ? "The knock was answered." : "The episode ends on an unanswered knock."}</p>
        <p>
          {scene.s7?.outcome === "clean" ? "The facility's lights dimmed by exactly the amount her mind-shape brightened." : scene.s7?.outcome === "silent" ? "The crew landed the beat with a condition. The Ancient answered with silence." : "Blackout. The game does not punish it; it remembers it."}
        </p>
        <span className="rule" aria-hidden />
        <dl className="record">
          <dt>Consent beat</dt>
          <dd>{end.consent}</dd>
          <dt>S5 logged as</dt>
          <dd>{end.classification ?? "—"}</dd>
          {(["navigator", "synaesthete", "theorist"] as Role[]).map((r) => (
            <Fragment key={r}>
              <dt>DEBT · {ROLE_NAMES[r]}</dt>
              <dd data-testid={`end-debt-${r}`}>{scene.debts[r] ?? 0}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </main>
  );
}
