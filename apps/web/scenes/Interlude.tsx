"use client";

import type { SceneView } from "@lsp/protocol";

/** S3 and S4 are not played in the slice: one dated card each, server-timed. */
export function Interlude({ scene }: { scene: SceneView }) {
  const card = scene.interlude;
  if (!card) return null;
  return (
    <main className="interlude" data-testid="interlude" data-index={card.index}>
      <div key={card.index}>
        <h1>{card.title}</h1>
        <span className="rule" aria-hidden />
        <p>{card.text}</p>
      </div>
    </main>
  );
}
