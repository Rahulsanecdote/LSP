"use client";

import { Canvas } from "@react-three/fiber";
import { Spring } from "@lsp/motion";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { BeatClientSnapshot } from "@/lib/beatClient";
import { useFps } from "@/lib/useFps";
import { GlCanvasBoundary } from "./GlCanvasBoundary";
import { GrayScott, MAX_BLOBS, SIM_SIZE, type Blob, type SimStatus } from "./GrayScott";

const TINTS: [number, number, number][] = [
  [0.45, 0.65, 0.95], // navigator-ish blue
  [0.85, 0.5, 0.35],
  [0.4, 0.8, 0.6],
  [0.8, 0.7, 0.35],
  [0.75, 0.45, 0.8],
  [0.5, 0.5, 0.5],
];

/**
 * The Synaesthete's overlay (handoff §6): one Gray–Scott blob per crew member. The Navigator's
 * blob flares prismatic white on a start readEvent and decays on a spring. This component never
 * receives stream content: the server only ever sends branchSet to the navigator's connection,
 * and the e2e test asserts the word "seal" is absent from this page.
 *
 * The flare spring runs in a DOM-level rAF loop, not inside the GL frame, so the flare value
 * (and the test that reads it) exists even where WebGL does not.
 */
export function SynaestheteOverlay({ snap }: { snap: BeatClientSnapshot | null }) {
  const fps = useFps();
  const clients = useMemo(() => (snap?.stats?.clients ?? []).filter((c) => c.connected).sort((a, b) => a.label.localeCompare(b.label)).slice(0, MAX_BLOBS), [snap?.stats]);
  const blobs: Blob[] = useMemo(
    () =>
      clients.map((c, i) => {
        const n = Math.max(clients.length, 1);
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = n === 1 ? 0 : 0.17; // inside the visible slice of the square sim on a tall phone
        return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) * 1.4, tint: TINTS[i % TINTS.length] as [number, number, number] };
      }),
    [clients],
  );
  const navIndex = clients.findIndex((c) => c.role === "navigator");

  // flare springs, one per blob slot
  const springs = useRef(Array.from({ length: MAX_BLOBS }, () => new Spring(0, 350)));
  const flaresRef = useRef<number[]>(new Array<number>(MAX_BLOBS).fill(0));
  const [flareShown, setFlareShown] = useState(0);
  const [sim, setSim] = useState<SimStatus>(null);
  const lastReadId = useRef<string | null>(null);
  const reading = snap?.activeRead !== null && snap?.activeRead !== undefined;
  const lastEvent = snap?.lastReadEvent ?? null;

  // a new start event snaps the reader's blob to full white
  useEffect(() => {
    if (!lastEvent || lastEvent.phase !== "start" || lastEvent.readId === lastReadId.current) return;
    lastReadId.current = lastEvent.readId;
    const idx = clients.findIndex((c) => c.label === lastEvent.label);
    if (idx >= 0) springs.current[idx]?.snap(1);
  }, [lastEvent, clients]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastPublish = 0;
    const loop = (t: number) => {
      const dt = Math.min(t - last, 100);
      last = t;
      for (let i = 0; i < MAX_BLOBS; i++) {
        const isReader = i === navIndex && reading;
        // while the read is held the blob stays lit; on release it decays to dark
        flaresRef.current[i] = (springs.current[i] as Spring).to(isReader ? 0.55 : 0, dt);
      }
      if (t - lastPublish > 100) {
        setFlareShown(navIndex >= 0 ? (flaresRef.current[navIndex] ?? 0) : 0);
        lastPublish = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [navIndex, reading]);

  const ready = Boolean(snap?.connected && snap.offset !== null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0b0e", touchAction: "none", userSelect: "none" }}>
      <GlCanvasBoundary>
        <Canvas dpr={[1, 2]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
          <FlareBridge flaresRef={flaresRef} blobs={blobs} onStatus={setSim} />
        </Canvas>
      </GlCanvasBoundary>
      <div
        data-testid="flare"
        data-flare={flareShown.toFixed(3)}
        data-latency={snap?.lastReadLatencyMs === null || snap?.lastReadLatencyMs === undefined ? "" : snap.lastReadLatencyMs.toFixed(0)}
        data-reading={reading ? "1" : "0"}
        data-branchset={snap?.branchSet ? "1" : "0"}
        data-sim={sim ? `${sim.type}:${sim.complete ? "ok" : "incomplete"}` : ""}
        style={{ position: "absolute", left: 16, right: 16, bottom: 14, pointerEvents: "none", fontSize: 12, color: "#b7b9c0", display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span>{!ready ? "connecting…" : reading ? `${snap?.activeRead?.label ?? "someone"} is reading` : `${clients.length} in the crew`}</span>
        <span data-testid="diag" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {fps} fps · flare {flareShown.toFixed(2)}
          {sim ? ` · sim ${SIM_SIZE}² ${sim.type}${sim.complete ? "" : " (incomplete)"}` : ""}
          {snap?.lastReadLatencyMs !== null && snap?.lastReadLatencyMs !== undefined ? ` · evt ${snap.lastReadLatencyMs.toFixed(0)} ms` : ""}
        </span>
      </div>
    </div>
  );
}

/** Reads the DOM-side flare values into the GL component every frame. */
function FlareBridge({ flaresRef, blobs, onStatus }: { flaresRef: RefObject<number[]>; blobs: Blob[]; onStatus: (s: SimStatus) => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <GrayScott blobs={blobs} flares={flaresRef.current ?? []} onStatus={onStatus} />;
}
