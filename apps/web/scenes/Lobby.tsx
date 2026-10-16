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
      <div className="eyebrow">Pre-dive · instrument check</div>
      <div className="roster">
        {ROLES.map((r) => (
          <div key={r} className="seat">
            <span>
              <span className="name">{ROLE_NAMES[r]}</span>
              <span className="role">{r}</span>
            </span>
            <span className={`here ${present.has(r) ? "on" : "off"}`}>{present.has(r) ? "● aboard" : "○ waiting"}</span>
          </div>
        ))}
      </div>
      {role === "theorist" ? (
        <button type="button" className="primary" data-testid="begin" style={{ marginTop: 12, width: "100%" }} disabled={!ROLES.every((r) => present.has(r))} onClick={() => client.current?.continue("lobby")}>
          Begin the dive
        </button>
      ) : (
        <div className="note" style={{ marginTop: 10 }}>Sarah begins the dive when all three seats are filled.</div>
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
