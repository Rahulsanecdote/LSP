"use client";

import { descentDepthM, type Role, type SceneView } from "@lsp/protocol";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Ledger } from "@/components/instruments/Ledger";
import { NavigatorRead } from "@/components/instruments/NavigatorRead";
import { SynaestheteOverlay } from "@/components/instruments/SynaestheteOverlay";
import type { BeatClient, BeatClientSnapshot } from "@/lib/beatClient";
import { Debts, Wheel, roomNow } from "./common";

/** How far the flare settles after the fix: "not fully fading" (design S2, horror beat). */
const AFTER_FIX_FLOOR = 0.18;

export function S2Seal({ snap, client, role, scene }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; role: Role; scene: SceneView }) {
  const s2 = scene.s2;
  const now = roomNow(client);
  const depth = s2 && now !== null ? descentDepthM(now, { startedAt: s2.descentStartedAt, pausedAt: s2.pausedAt, pausedTotal: s2.pausedTotal }, { descentMs: s2.descentMs, approachMs: s2.approachMs, dockMs: s2.dockMs }) : 0;
  const depthText = `−${Math.round(depth).toLocaleString("en-US")} m`;
  // the viewport doubles once, when the fix lands
  const [doubled, setDoubled] = useState(false);
  const wasFixed = useRef(false);
  useEffect(() => {
    if (s2?.fixed && !wasFixed.current) {
      wasFixed.current = true;
      setDoubled(true);
      const id = window.setTimeout(() => setDoubled(false), 900);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [s2?.fixed]);
  if (!s2) return null;

  switch (role) {
    case "navigator": {
      const prompt = s2.prompted ? (snap?.holding ? "reading" : "reflex prompt — exits < 3. Press and hold to read.") : `descending · ${depthText}`;
      return (
        <NavigatorRead snap={snap} client={client} prompt={prompt} doubled={doubled}>
          <div className="scene-ui" data-prompted={s2.prompted ? "1" : "0"}>
            {s2.privateQuestion && (
              <div className="card" data-testid="private">
                <span className="muted">Chen, private channel:</span> “{s2.privateQuestion}”
              </div>
            )}
            {s2.prompted && s2.line === null && s2.lines && (
              <>
                <div className="card muted" style={{ fontSize: 12 }}>Tell the crew. Say what you need to say.</div>
                <Wheel options={s2.lines} chosen={s2.line ?? null} onPick={(id) => client.current?.choose("s2", "nav-line", id)} testPrefix="line" />
              </>
            )}
            {s2.line !== null && s2.lines && (
              <div className="card" data-testid="line-chosen">
                <span className="muted">You:</span> “{s2.lines.find((l) => l.id === s2.line)?.text}”
              </div>
            )}
            {s2.fixed && <div className="card muted" style={{ fontSize: 12 }}>Seal 4 holds. {depthText}.</div>}
          </div>
        </NavigatorRead>
      );
    }
    case "synaesthete":
      return (
        <SynaestheteOverlay snap={snap} floor={s2.afterFix ? AFTER_FIX_FLOOR : 0} caption={s2.afterFix ? "the flare is not fully fading" : null}>
          <div className="scene-ui">
            {s2.choice === null && s2.choices && (
              <>
                <div className="card muted" style={{ fontSize: 12 }}>You saw her flare before she spoke. Private channels are never private from the Ledger.</div>
                <Wheel options={s2.choices} chosen={null} onPick={(id) => client.current?.choose("s2", "syn-choice", id)} testPrefix="syn" />
              </>
            )}
            {s2.choice !== null && s2.choices && (
              <div className="card" data-testid="syn-chosen">
                {s2.choices.find((c) => c.id === s2.choice)?.text}
              </div>
            )}
          </div>
        </SynaestheteOverlay>
      );
    case "theorist": {
      const diagLeft = s2.diagnosticEndsAt !== null && s2.diagnosticEndsAt !== undefined && now !== null ? Math.max(0, s2.diagnosticEndsAt - now) : null;
      return (
        <main style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 40 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="kv" style={{ flex: 1 }}>
              <div className="k">Depth</div>
              <div className="v" data-testid="depth">{depthText}</div>
            </div>
            <div className="kv" style={{ flex: 1 }} data-testid="telemetry">
              <div className="k">Seal {s2.telemetry?.seal ?? 4}</div>
              <div className="v">
                {s2.telemetry?.differentialKPa ?? 0.3} kPa <small>{s2.telemetry?.tolerance ?? "inside tolerance"}</small>
              </div>
            </div>
          </div>
          <Debts debts={scene.debts} />
          <div className="panel" data-testid="comms" style={{ fontSize: 14, minHeight: 44 }}>
            {(s2.comms ?? []).length === 0 ? <span className="muted">Comms quiet.</span> : (s2.comms ?? []).map((c, i) => <div key={i}>{c}</div>)}
          </div>
          {s2.tools && (
            <Wheel options={s2.tools} chosen={s2.tool ?? null} onPick={(id) => client.current?.choose("s2", "tool", id)} testPrefix="tool" disabled={s2.fixed} />
          )}
          {diagLeft !== null && !s2.fixed && (
            <div className="muted" data-testid="diagnostic" style={{ fontSize: 13 }}>
              Diagnostic running: {(diagLeft / 1000).toFixed(0)} s. Descent paused.
            </div>
          )}
          {s2.fixed && <div style={{ color: "var(--hit)", fontSize: 13 }} data-testid="fixed">Seal 4 holds.</div>}
          <Ledger log={scene.log} />
        </main>
      );
    }
  }
}
