"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { DEFAULT_GROWTH, DifferentialField, Spring, countIntersections, hashString } from "@lsp/motion";
import type { BranchSet } from "@lsp/protocol";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FULLSCREEN_VERTEX } from "@/lib/shaders/noise3d";
import { RIBBON_FRAGMENT, RIBBON_VERTEX } from "@/lib/shaders/ribbon";
import { HORIZON_FRAGMENT } from "@/lib/shaders/streams";
import { MAX_STEP_MS } from "./Frost";

export const MAX_STREAMS = 7;
/** uv y of the present (the streams' origin, just below the bottom edge) and of the horizon line */
export const PRESENT_Y = -0.08;
export const HORIZON_Y = 0.78;
/** 600 ms growth ≈ 3.3 halflives: a stream is 97% grown at 600 ms */
const GROW_HALFLIFE_MS = 180;
/** the simulation's fixed timestep (Task 2b): 120 steps per second, at most 30 per frame */
const SIM_DT = 1 / 120;
const MAX_SIM_STEPS = 30;
/** a stream's geometry stops just above the top of the screen; the horizon black hides the rest */
const MAX_END_Y = 1.1;
/** the growing tip softens over this length, as the analytic shader did */
const TIP_FADE = 0.03;
const MAX_NODES = DEFAULT_GROWTH.maxNodesPerLine;

export interface StreamLayout {
  angle: number;
  width: number;
  bright: number;
  endY: number;
  beyondHorizon: boolean;
}

/**
 * Geometry shared by the simulation and the DOM labels. Deterministic in the BranchSet and the
 * canvas aspect: the fan is narrowed on tall phones so no stream leaves the screen.
 */
export function layoutStreams(bs: BranchSet, aspect: number): StreamLayout[] {
  const n = bs.streams.length;
  const spread = 0.62 * Math.min(1, Math.max(aspect, 0.3) / 0.75); // radians of total fan at aspect ≥ 0.75
  return bs.streams.map((s, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = (t - 0.5) * spread;
    const endY = PRESENT_Y + (s.terminalMs / bs.horizonMs) * (HORIZON_Y - PRESENT_Y);
    return {
      angle,
      width: 0.008 + 0.075 * s.p,
      bright: s.confidence ?? s.p,
      endY,
      beyondHorizon: endY > HORIZON_Y,
    };
  });
}

/**
 * Where a stream's label sits, in CSS percent of the canvas. Clamped to the horizon, and kept
 * far enough from the side edges that a centred label up to 38vw wide stays on screen. The
 * simulated tip is driven to exactly this point (clamped at MAX_END_Y), so labels and streams agree.
 */
export function labelPosition(l: StreamLayout, aspect: number): { leftPct: number; bottomPct: number } {
  const endY = Math.min(l.endY, HORIZON_Y);
  const len = (endY - PRESENT_Y) / Math.max(Math.cos(l.angle), 0.2);
  const x = 0.5 + (len * Math.sin(l.angle)) / Math.max(aspect, 0.1);
  const y = PRESENT_Y + len * Math.cos(l.angle);
  return { leftPct: Math.min(80, Math.max(20, x * 100)), bottomPct: y * 100 };
}

/** The tip's full-growth target in simulation space (x aspect-corrected, y from the present). */
function tipTarget(l: StreamLayout): { x: number; y: number } {
  const len = (Math.min(l.endY, MAX_END_Y) - PRESENT_Y) / Math.max(Math.cos(l.angle), 0.2);
  return { x: len * Math.sin(l.angle), y: len * Math.cos(l.angle) };
}

/** The seed is the BranchSet's content: the same scene always grows the same shape. */
export function seedOf(bs: BranchSet): number {
  return hashString(JSON.stringify(bs.streams.map((s) => [s.label, s.p, s.terminalMs, s.confidence ?? null])));
}

export interface SimReport {
  nodes: number;
  crossings: number;
}

/** A preallocated ribbon strip for one stream: two vertices per node, rebuilt from the polyline. */
function makeRibbon(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const verts = MAX_NODES * 2;
  const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("position", pos);
  for (const name of ["aAcross", "aWidth", "aTip", "aBright"]) {
    const a = new THREE.BufferAttribute(new Float32Array(verts), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  const index = new Uint16Array((MAX_NODES - 1) * 6);
  for (let k = 0; k < MAX_NODES - 1; k++) {
    const o = k * 6;
    const v = k * 2;
    index[o] = v;
    index[o + 1] = v + 1;
    index[o + 2] = v + 2;
    index[o + 3] = v + 1;
    index[o + 4] = v + 3;
    index[o + 5] = v + 2;
  }
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.setDrawRange(0, 0);
  return g;
}

/** Write the polyline of line `i` into its strip. */
function fillRibbon(geo: THREE.BufferGeometry, line: readonly { x: number; y: number }[], l: StreamLayout): void {
  const n = Math.min(line.length, MAX_NODES);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const across = geo.getAttribute("aAcross") as THREE.BufferAttribute;
  const width = geo.getAttribute("aWidth") as THREE.BufferAttribute;
  const tip = geo.getAttribute("aTip") as THREE.BufferAttribute;
  const bright = geo.getAttribute("aBright") as THREE.BufferAttribute;
  // cumulative length, for the taper and the tip fade
  const cum = new Array<number>(n).fill(0);
  for (let k = 1; k < n; k++) {
    const p = line[k - 1] as { x: number; y: number };
    const q = line[k] as { x: number; y: number };
    cum[k] = (cum[k - 1] as number) + Math.hypot(q.x - p.x, q.y - p.y);
  }
  const total = Math.max(cum[n - 1] as number, 1e-6);
  for (let k = 0; k < n; k++) {
    const p = line[k] as { x: number; y: number };
    const a = line[Math.max(k - 1, 0)] as { x: number; y: number };
    const b = line[Math.min(k + 1, n - 1)] as { x: number; y: number };
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const along = (cum[k] as number) / total;
    const w = l.width * (1 - 0.4 * along);
    const half = 3 * w;
    const fromTip = total - (cum[k] as number);
    const t = Math.min(fromTip / TIP_FADE, 1);
    const fade = t * t * (3 - 2 * t);
    const v = k * 2;
    pos.setXYZ(v, p.x + ty * half, p.y - tx * half, 0);
    pos.setXYZ(v + 1, p.x - ty * half, p.y + tx * half, 0);
    across.setX(v, -1);
    across.setX(v + 1, 1);
    width.setX(v, w);
    width.setX(v + 1, w);
    tip.setX(v, fade);
    tip.setX(v + 1, fade);
    bright.setX(v, l.bright);
    bright.setX(v + 1, l.bright);
  }
  pos.needsUpdate = true;
  across.needsUpdate = true;
  width.needsUpdate = true;
  tip.needsUpdate = true;
  bright.needsUpdate = true;
  geo.setDrawRange(0, n >= 2 ? (n - 1) * 6 : 0);
}

export function Streams({
  branchSet,
  holding,
  pastHorizon,
  onGrow,
  onSim,
}: {
  branchSet: BranchSet | null;
  holding: boolean;
  pastHorizon: boolean;
  onGrow?: (g: number[]) => void;
  onSim?: (r: SimReport) => void;
}) {
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const layout = useMemo(() => (branchSet ? layoutStreams(branchSet, aspect) : []), [branchSet, aspect]);
  const grows = useRef(Array.from({ length: MAX_STREAMS }, () => new Spring(0, GROW_HALFLIFE_MS)));
  // one field per (BranchSet, aspect): the shape is a pure function of the scene and the screen
  const field = useMemo(() => {
    const f = new DifferentialField(branchSet ? seedOf(branchSet) : 0);
    layout.forEach(() => f.addLine({ x: 0, y: 0 }));
    return f;
  }, [branchSet, layout]);
  const targets = useMemo(() => layout.map(tipTarget), [layout]);
  const acc = useRef(0);
  const frame = useRef(0);

  const ribbonMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RIBBON_VERTEX,
        fragmentShader: RIBBON_FRAGMENT,
        uniforms: { uAspect: { value: 1 }, uPresentY: { value: PRESENT_Y }, uDarken: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide, // the strip's winding follows the stream's direction; never cull it
      }),
    [],
  );
  const horizonMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: HORIZON_FRAGMENT,
        uniforms: { uHorizonY: { value: HORIZON_Y }, uFormed: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const ribbons = useMemo(() => Array.from({ length: MAX_STREAMS }, makeRibbon), []);
  useEffect(
    () => () => {
      ribbonMaterial.dispose();
      horizonMaterial.dispose();
      ribbons.forEach((g) => g.dispose());
    },
    [ribbonMaterial, horizonMaterial, ribbons],
  );
  const darken = useRef(new Spring(0, 450));

  useFrame((_, dt) => {
    const ms = Math.min(dt * 1000, MAX_STEP_MS);
    const g: number[] = [];
    let formed = 0;
    layout.forEach((_l, i) => {
      // streams grow in a slight stagger so the fan "forms" rather than pops
      const spring = grows.current[i] as Spring;
      spring.halflife = holding ? GROW_HALFLIFE_MS + i * 25 : 120;
      const v = spring.to(holding ? 1 : 0, ms);
      g.push(v);
      formed = Math.max(formed, v);
      const t = targets[i] as { x: number; y: number };
      field.setTip(i, { x: t.x * v, y: t.y * v });
    });
    // the simulation runs at its fixed step; idle (fully retracted, not holding) costs nothing
    if (holding || formed > 1e-3) {
      acc.current += ms / 1000;
      let steps = 0;
      while (acc.current >= SIM_DT && steps < MAX_SIM_STEPS) {
        field.step(SIM_DT);
        acc.current -= SIM_DT;
        steps++;
      }
      if (steps === MAX_SIM_STEPS) acc.current = 0;
    } else {
      acc.current = 0;
    }
    layout.forEach((l, i) => fillRibbon(ribbons[i] as THREE.BufferGeometry, field.line(i), l));
    for (let i = layout.length; i < MAX_STREAMS; i++) (ribbons[i] as THREE.BufferGeometry).setDrawRange(0, 0);
    (ribbonMaterial.uniforms.uAspect as THREE.IUniform<number>).value = aspect;
    (ribbonMaterial.uniforms.uDarken as THREE.IUniform<number>).value = darken.current.to(pastHorizon ? 1 : 0, ms);
    (horizonMaterial.uniforms.uFormed as THREE.IUniform<number>).value = formed;
    onGrow?.(g);
    if (onSim && frame.current++ % 15 === 0) onSim({ nodes: field.nodeCount, crossings: countIntersections(field) });
  });

  return (
    <>
      {ribbons.map((geo, i) => (
        <mesh key={i} geometry={geo} frustumCulled={false} renderOrder={1}>
          <primitive object={ribbonMaterial} attach="material" />
        </mesh>
      ))}
      <mesh frustumCulled={false} renderOrder={2}>
        <planeGeometry args={[2, 2]} />
        <primitive object={horizonMaterial} attach="material" />
      </mesh>
    </>
  );
}
