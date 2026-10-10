"use client";

import { Canvas } from "@react-three/fiber";
import { HORIZON_MS } from "@lsp/protocol";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { BeatClient, BeatClientSnapshot } from "@/lib/beatClient";
import { HorizonDrone } from "@/lib/audio";
import { useFps } from "@/lib/useFps";
import { Frost } from "./Frost";
import { HORIZON_Y, Streams, labelPosition, layoutStreams } from "./Streams";

/** One label level: taller than the tallest label (three lines at 11px/1.2 plus its shadow). */
const LABEL_STEP_PX = 46;
import { GlCanvasBoundary } from "./GlCanvasBoundary";

/**
 * The Navigator's instrument (design doc §1, handoff §6). Press and hold anywhere: the scene
 * desaturates, frost forms, 3–7 streams fan forward (width = likelihood, brightness =
 * confidence) and clip to black at the horizon. Holding past the horizon darkens the field and
 * drops the drone an octave. Release: +1 DEBT, or +2 past the horizon, decided by the server.
 *
 * The client only sends intents (readStart / readEnd) and renders. Hold progress shown here is a
 * local preview from the same projectionRate the server uses; the server's verdict arrives in
 * the end readEvent.
 */
export function NavigatorRead({ snap, client }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null> }) {
  const fps = useFps();
  const drone = useRef<HorizonDrone | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [aspect, setAspect] = useState(1);
  const surface = useRef<HTMLDivElement | null>(null);
  const growRef = useRef<number[]>([]);

  // local clock for the hold preview, 30 Hz
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 33) {
        setNow(performance.now());
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.clientWidth / Math.max(el.clientHeight, 1)));
    ro.observe(el);
    setAspect(el.clientWidth / Math.max(el.clientHeight, 1));
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => drone.current?.dispose(), []);

  const branchSet = snap?.branchSet ?? null;
  const holding = snap?.holding ?? false;
  const heldMs = holding && snap?.holdStartedLocal !== null && snap?.holdStartedLocal !== undefined ? Math.max(0, now - snap.holdStartedLocal) : 0;
  const rate = branchSet?.projectionRate ?? 15;
  const projectedMs = heldMs * rate;
  const pastHorizon = holding && projectedMs > (branchSet?.horizonMs ?? HORIZON_MS);
  useEffect(() => drone.current?.setPastHorizon(pastHorizon), [pastHorizon]);

  const layout = useMemo(() => (branchSet ? layoutStreams(branchSet, aspect) : []), [branchSet, aspect]);
  // Labels that would overprint each other step upward. Two labels collide when their centres
  // are within a label's width horizontally (labels are up to 38vw wide) and within a label's
  // height vertically; on a phone the fan is narrow enough that neighbouring streams collide even
  // with different termini, so this is measured in screen space, not by terminus.
  // Each label takes the lowest level no colliding neighbour holds, so a four-stream fan on a
  // phone alternates between two levels instead of climbing a staircase.
  const labelOffsets = useMemo(() => {
    const placed: { leftPct: number; bottomPct: number; offset: number }[] = [];
    return layout.map((l) => {
      const pos = labelPosition(l, aspect);
      const taken = new Set(
        placed.filter((q) => Math.abs(q.leftPct - pos.leftPct) < 38 && Math.abs(q.bottomPct - pos.bottomPct) < 9).map((q) => q.offset),
      );
      let offset = 0;
      while (taken.has(offset)) offset += 1;
      placed.push({ ...pos, offset });
      return offset;
    });
  }, [layout, aspect]);

  const down = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const c = client.current;
      if (!c || !c.readStart()) return;
      drone.current ??= new HorizonDrone();
      drone.current.start();
    },
    [client],
  );
  const up = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      if (client.current?.readEnd()) drone.current?.stop();
    },
    [client],
  );

  const ready = Boolean(snap?.connected && snap.offset !== null && branchSet);
  const last = snap?.lastReadEvent;

  return (
    <div
      ref={surface}
      data-testid="hold"
      data-holding={holding ? "1" : "0"}
      data-branchset={branchSet ? "1" : "0"}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", inset: 0, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", background: "#0e0f12", cursor: ready ? "pointer" : "wait" }}
    >
      <GlCanvasBoundary>
        <Canvas dpr={[1, 2]} gl={{ antialias: false, powerPreference: "high-performance" }} frameloop="always" style={{ position: "absolute", inset: 0 }}>
          <Frost holding={holding} pastHorizon={pastHorizon} />
          <Streams branchSet={branchSet} holding={holding} pastHorizon={pastHorizon} onGrow={(g) => (growRef.current = g)} />
        </Canvas>
      </GlCanvasBoundary>

      {/* stream labels: plain DOM, the Rive slot (amendment 6c) */}
      {holding &&
        layout.map((l, i) => {
          const pos = labelPosition(l, aspect);
          const s = branchSet?.streams[i];
          if (!s) return null;
          const shown = (growRef.current[i] ?? 0) > 0.6;
          return (
            <div
              key={i}
              className="stream-label"
              data-testid="stream-label"
              style={{
                position: "absolute",
                left: `${pos.leftPct}%`,
                bottom: `${pos.bottomPct}%`,
                transform: `translate(-50%, ${l.beyondHorizon ? -(labelOffsets[i] ?? 0) * LABEL_STEP_PX : -6 - (labelOffsets[i] ?? 0) * LABEL_STEP_PX}px)`,
                opacity: shown ? (l.beyondHorizon ? 0.45 : 0.6 + 0.4 * l.bright) : 0,
                transition: "opacity 180ms ease-out",
                color: "#f2f2f0",
                fontSize: 11,
                lineHeight: 1.2,
                textAlign: "center",
                pointerEvents: "none",
                textShadow: "0 1px 6px #000",
                maxWidth: "38vw",
              }}
            >
              <div style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{Math.round(s.p * 100)}%</div>
              <div>{s.label}</div>
              {l.beyondHorizon && <div style={{ opacity: 0.7 }}>past the horizon</div>}
            </div>
          );
        })}

      {/* horizon marker, with the field */}
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: `${HORIZON_Y * 100}%`, borderTop: "1px dashed rgba(242,242,240,.18)", pointerEvents: "none", opacity: holding ? 1 : 0, transition: "opacity 300ms" }} />

      {/* prompt and diag line */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, pointerEvents: "none", fontSize: 12, color: "#b7b9c0", display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{!ready ? "connecting…" : holding ? (pastHorizon ? "beyond the horizon — release costs double" : "reading") : "press and hold anywhere to read"}</span>
        <span data-testid="diag" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#7e818b" }}>
          {fps} fps · hold {Math.round(heldMs)} ms → {(projectedMs / 1000).toFixed(1)} s · DEBT {snap?.debt ?? 0}
          {last?.phase === "end" ? ` · last ${last.durationMs?.toFixed(0)} ms ${last.pastHorizon ? "+2" : "+1"}` : ""}
          {snap?.lastReadLatencyMs !== null && snap?.lastReadLatencyMs !== undefined ? ` · evt ${snap.lastReadLatencyMs.toFixed(0)} ms` : ""}
        </span>
      </div>
    </div>
  );
}
