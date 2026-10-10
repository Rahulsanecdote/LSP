"use client";

import { Canvas } from "@react-three/fiber";
import { Spring } from "@lsp/motion";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
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
export interface SynaestheteOverlayProps {
  snap: BeatClientSnapshot | null;
  /** the Navigator's blob never falls below this (S2 after the fix: "not fully fading"; S7: the reply) */
  floor?: number;
  /** S5: local time at which her mind commits; the blob builds toward it over the commit hold */
  commitAtLocal?: number | null;
  /** S5: press-and-hold on the field is overlay focus */
  onFocus?: (on: boolean) => void;
  /** S7: the last beat's taps by role; one colour if all hit, one per role if not */
  tapColours?: { role: string; hit: boolean }[] | null;
  /** the line at bottom left; defaults to the crew count / who is reading */
  caption?: string | null;
  /** uv y of the blob ring's centre (0 bottom, 1 top); scenes with controls at the bottom raise it */
  ringY?: number;
  children?: ReactNode;
}

export function SynaestheteOverlay({ snap, floor = 0, commitAtLocal = null, onFocus, tapColours = null, caption, ringY = 0.5, children }: SynaestheteOverlayProps) {
  const fps = useFps();
  const [focusing, setFocusing] = useState(false);
  const commitRef = useRef<number | null>(null);
  commitRef.current = commitAtLocal;
  const floorRef = useRef(0);
  floorRef.current = floor;
  const clients = useMemo(() => (snap?.stats?.clients ?? []).filter((c) => c.connected).sort((a, b) => a.label.localeCompare(b.label)).slice(0, MAX_BLOBS), [snap?.stats]);
  const blobs: Blob[] = useMemo(
    () =>
      clients.map((c, i) => {
        const n = Math.max(clients.length, 1);
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const r = n === 1 ? 0 : 0.17; // inside the visible slice of the square sim on a tall phone
        return { x: 0.5 + r * Math.cos(a), y: ringY + r * Math.sin(a) * 1.4, tint: TINTS[i % TINTS.length] as [number, number, number] };
      }),
    [clients, ringY],
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
      // S5: the mind-shape builds toward the commit over the hold, peaks, then lets go
      let ramp = 0;
      const commitAt = commitRef.current;
      if (commitAt !== null) {
        const until = commitAt - t;
        if (until > 0 && until < 1000) ramp = 0.9 * (1 - until / 1000);
        else if (until <= 0 && until > -400) ramp = 0.9;
      }
      for (let i = 0; i < MAX_BLOBS; i++) {
        const isReader = i === navIndex && reading;
        const isNav = i === navIndex;
        // while the read is held the blob stays lit; on release it decays to dark, or to the floor
        const target = Math.max(isReader ? 0.55 : 0, isNav ? floorRef.current : 0, isNav ? ramp : 0);
        flaresRef.current[i] = (springs.current[i] as Spring).to(target, dt);
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
  const focusDown = (e: ReactPointerEvent) => {
    if (!onFocus) return;
    if ((e.target as HTMLElement).closest?.("[data-scene-ui]")) return;
    e.preventDefault();
    setFocusing(true);
    onFocus(true);
  };
  const focusUp = () => {
    if (!onFocus || !focusing) return;
    setFocusing(false);
    onFocus(false);
  };
  const allHit = tapColours && tapColours.length > 0 && tapColours.every((t) => t.hit);

  return (
    <div
      onPointerDown={focusDown}
      onPointerUp={focusUp}
      onPointerCancel={focusUp}
      data-focus={focusing ? "1" : "0"}
      style={{ position: "fixed", inset: 0, background: "#0a0b0e", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", outline: focusing ? "2px solid rgba(242,242,240,0.35)" : "none", outlineOffset: -2 }}
    >
      <GlCanvasBoundary>
        <Canvas dpr={[1, 2]} gl={{ antialias: false, powerPreference: "high-performance" }} style={{ position: "absolute", inset: 0 }}>
          <FlareBridge flaresRef={flaresRef} blobs={blobs} onStatus={setSim} />
        </Canvas>
      </GlCanvasBoundary>
      {/* S7: the colour of the crew's taps. In rhythm, one colour; out of rhythm, three. */}
      {tapColours && tapColours.length > 0 && (
        <div data-testid="tap-colours" data-in-rhythm={allHit ? "1" : "0"} style={{ position: "absolute", top: 56, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
          {tapColours.map((t, i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: allHit ? "#f2f2f0" : t.hit ? ROLE_COLOURS[t.role] ?? "#888" : "#3a3d46", opacity: 0.9 }} />
          ))}
        </div>
      )}
      {children && (
        <div data-scene-ui style={{ position: "absolute", left: 0, right: 0, bottom: 64, top: 48, pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          {children}
        </div>
      )}
      <div
        data-testid="flare"
        data-flare={flareShown.toFixed(3)}
        data-latency={snap?.lastReadLatencyMs === null || snap?.lastReadLatencyMs === undefined ? "" : snap.lastReadLatencyMs.toFixed(0)}
        data-reading={reading ? "1" : "0"}
        data-branchset={snap?.branchSet ? "1" : "0"}
        data-sim={sim ? `${sim.type}:${sim.complete ? "ok" : "incomplete"}` : ""}
        style={{ position: "absolute", left: 16, right: 16, bottom: 14, pointerEvents: "none", fontSize: 12, color: "#b7b9c0", display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span data-testid="caption">{caption !== undefined && caption !== null ? caption : !ready ? "connecting…" : reading ? `${snap?.activeRead?.label ?? "someone"} is reading` : `${clients.length} in the crew`}</span>
        <span data-testid="diag" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {fps} fps · flare {flareShown.toFixed(2)}
          {sim ? ` · sim ${SIM_SIZE}² ${sim.type}${sim.complete ? "" : " (incomplete)"}` : ""}
          {snap?.lastReadLatencyMs !== null && snap?.lastReadLatencyMs !== undefined ? ` · evt ${snap.lastReadLatencyMs.toFixed(0)} ms` : ""}
        </span>
      </div>
    </div>
  );
}

const ROLE_COLOURS: Record<string, string> = { navigator: "#6fa8ff", synaesthete: "#c98de0", theorist: "#e39a55" };

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
