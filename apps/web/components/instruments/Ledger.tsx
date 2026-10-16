"use client";

import type { LedgerEntry } from "@lsp/protocol";

/**
 * The Theorist's Ledger (design §0: every window, every act, every cost; the Theorist writes).
 * Read-only in the slice: editing is out of scope (§8). Plain DOM, the Rive slot.
 */
const KIND_LABEL: Record<LedgerEntry["kind"], string> = { system: "rig", window: "test", act: "act", cost: "debt", comms: "comms", private: "priv" };

export function Ledger({ log, max = 12 }: { log: LedgerEntry[]; max?: number }) {
  const rows = log.slice(-max);
  return (
    <div className="panel ledger" data-testid="ledger">
      <div className="eyebrow">
        <span>Ledger</span>
        <span>{log.length} entries</span>
      </div>
      {rows.length === 0 ? (
        <div className="muted">Nothing yet.</div>
      ) : (
        rows.map((e, i) => (
          <div key={i} className={`entry ${e.kind}`}>
            <span className="t">{(e.at / 1000).toFixed(1)} s</span>
            <span className="kind">{KIND_LABEL[e.kind]}</span>
            <span>{e.text}</span>
          </div>
        ))
      )}
    </div>
  );
}
