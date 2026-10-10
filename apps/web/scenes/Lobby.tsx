"use client";

import { ROLES, type Role, type SceneView } from "@lsp/protocol";
import type { RefObject } from "react";
import { NavigatorRead } from "@/components/instruments/NavigatorRead";
import { SynaestheteOverlay } from "@/components/instruments/SynaestheteOverlay";
import { TheoristLedger } from "@/components/instruments/TheoristLedger";
import type { BeatClient, BeatClientSnapshot } from "@/lib/beatClient";
import { ROLE_NAMES } from "./common";

/**
 * Pre-dive: every seat's instrument is live (the Task 2 check runs here), the crew sees who is
 * present, and the Theorist begins the dive once all three seats are filled.
 */
export function Lobby({ snap, client, role, scene }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; role: Role; scene: SceneView | null }) {
  const present = new Set(scene?.present ?? []);
  const crew = (
    <div className="card" data-testid="crew-card">
      <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Pre-dive · instrument check</div>
      <div className="row" style={{ marginTop: 6, gap: 10 }}>
        {ROLES.map((r) => (
          <span key={r} style={{ color: present.has(r) ? "var(--hit)" : "var(--ink-3)" }}>
            {present.has(r) ? "●" : "○"} {ROLE_NAMES[r]}
          </span>
        ))}
      </div>
      {role === "theorist" ? (
        <button type="button" className="primary" data-testid="begin" style={{ marginTop: 10, width: "100%" }} disabled={!ROLES.every((r) => present.has(r))} onClick={() => client.current?.continue("lobby")}>
          Begin the dive
        </button>
      ) : (
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Sarah begins the dive when all three seats are filled.</div>
      )}
    </div>
  );
  switch (role) {
    case "navigator":
      return (
        <NavigatorRead snap={snap} client={client}>
          <div className="scene-ui">{crew}</div>
        </NavigatorRead>
      );
    case "synaesthete":
      return (
        <SynaestheteOverlay snap={snap}>
          <div className="scene-ui">{crew}</div>
        </SynaestheteOverlay>
      );
    case "theorist":
      return <TheoristLedger snap={snap}>{crew}</TheoristLedger>;
  }
}
