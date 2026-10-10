"use client";

import type { LedgerEntry } from "@lsp/protocol";

/**
 * The Theorist's Ledger (design §0: every window, every act, every cost; the Theorist writes).
 * Read-only in the slice: editing is out of scope (§8). Plain DOM, the Rive slot.
 */
export function Ledger({ log, max = 12 }: { log: LedgerEntry[]; max?: number }) {
  const rows = log.slice(-max);
  return (
    <div className="panel" data-testid="ledger" style={{ fontSize: 12, color: "var(--ink-2)", maxHeight: "32vh", overflowY: "auto" }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Ledger</div>
      {rows.length === 0 ? (
        <div className="muted">Nothing yet.</div>
      ) : (
        rows.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "3px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
            <span className="muted" style={{ fontVariantNumeric: "tabular-nums", minWidth: 58 }}>{(e.at / 1000).toFixed(1)} s</span>
            <span style={{ color: e.kind === "cost" ? "var(--miss)" : e.kind === "private" ? "var(--accent)" : "inherit" }}>{e.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
