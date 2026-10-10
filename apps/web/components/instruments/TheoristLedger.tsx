"use client";

import type { ReactNode } from "react";
import type { BeatClientSnapshot } from "@/lib/beatClient";

/**
 * The Theorist's DEBT counter (handoff §6 done-criterion). Task 2 shows DEBT and the read log
 * only; Ledger editing is out of scope (§8). Plain DOM: this is the Rive slot (amendment 6c);
 * swap the counter for a Rive gauge when a .riv exists.
 */
export function TheoristLedger({ snap, children }: { snap: BeatClientSnapshot | null; children?: ReactNode }) {
  const reading = snap?.activeRead ?? null;
  const last = snap?.lastReadEvent ?? null;
  const ready = Boolean(snap?.connected && snap.offset !== null);
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
      {children && <div className="scene-ui" style={{ margin: 0 }}>{children}</div>}
      <div className="kv" style={{ textAlign: "center", padding: "28px 16px" }}>
        <div className="k">DEBT</div>
        <div className="v" data-testid="debt" style={{ fontSize: 72, lineHeight: 1 }}>
          {snap?.debt ?? 0}
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }} data-testid="reading">
          {!ready ? "connecting…" : reading ? `${reading.label} is reading…` : last?.phase === "end" ? `last read ${((last.durationMs ?? 0) / 1000).toFixed(1)} s${last.pastHorizon ? ", beyond the horizon, +2" : ", +1"}` : "no reads yet"}
        </div>
      </div>
      <div className="panel" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        Every hold the Navigator makes costs one. Past the horizon it costs two. You see the cost, never the read.
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        {snap?.lastReadLatencyMs !== null && snap?.lastReadLatencyMs !== undefined ? `event latency ${snap.lastReadLatencyMs.toFixed(0)} ms` : ""}
      </p>
    </main>
  );
}
