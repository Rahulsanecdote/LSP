"use client";

import type { SceneView } from "@lsp/protocol";
import { Debts } from "./common";

export function EndCard({ scene }: { scene: SceneView }) {
  const end = scene.end;
  if (!end) return null;
  const answered = end.ending === "answered";
  return (
    <main className="interlude" data-testid="end" data-ending={end.ending} data-consent={end.consent}>
      <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
        <h1>EPISODE 1 · DESCENT</h1>
        <p style={{ fontSize: 18, color: "var(--ink)" }}>{answered ? "The knock was answered." : "The episode ends on an unanswered knock."}</p>
        <p>
          {scene.s7?.outcome === "clean" ? "The facility's lights dimmed by exactly the amount her mind-shape brightened." : scene.s7?.outcome === "silent" ? "The crew landed the beat with a condition. The Ancient answered with silence." : "Blackout. The game does not punish it; it remembers it."}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          consent beat: {end.consent} · S5 logged as {end.classification ?? "—"}
        </p>
        <Debts debts={scene.debts} />
      </div>
    </main>
  );
}
