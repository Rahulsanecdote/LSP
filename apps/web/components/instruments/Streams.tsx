"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Spring } from "@lsp/motion";
import type { BranchSet } from "@lsp/protocol";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FULLSCREEN_VERTEX } from "@/lib/shaders/noise3d";
import { STREAMS_FRAGMENT } from "@/lib/shaders/streams";
import { MAX_STEP_MS } from "./Frost";

export const MAX_STREAMS = 7;
/** uv y of the present (the streams' origin, just below the bottom edge) and of the horizon line */
export const PRESENT_Y = -0.08;
export const HORIZON_Y = 0.78;
/** 600 ms growth ≈ 3.3 halflives: a stream is 97% grown at 600 ms */
const GROW_HALFLIFE_MS = 180;

export interface StreamLayout {
  angle: number;
  width: number;
  bright: number;
  endY: number;
  beyondHorizon: boolean;
}

/**
 * Geometry shared by the shader and the DOM labels. Deterministic in the BranchSet and the
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

/** Where a stream's label sits, in CSS percent of the canvas. Clamped to the horizon. */
export function labelPosition(l: StreamLayout, aspect: number): { leftPct: number; bottomPct: number } {
  const endY = Math.min(l.endY, HORIZON_Y);
  const len = (endY - PRESENT_Y) / Math.max(Math.cos(l.angle), 0.2);
  const x = 0.5 + (len * Math.sin(l.angle)) / Math.max(aspect, 0.1);
  const y = PRESENT_Y + len * Math.cos(l.angle);
  return { leftPct: x * 100, bottomPct: y * 100 };
}

export function Streams({ branchSet, holding, pastHorizon, onGrow }: { branchSet: BranchSet | null; holding: boolean; pastHorizon: boolean; onGrow?: (g: number[]) => void }) {
  const { size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const layout = useMemo(() => (branchSet ? layoutStreams(branchSet, aspect) : []), [branchSet, aspect]);
  const grows = useRef(Array.from({ length: MAX_STREAMS }, () => new Spring(0, GROW_HALFLIFE_MS)));
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: STREAMS_FRAGMENT,
        uniforms: {
          uCount: { value: 0 },
          uAngle: { value: new Array<number>(MAX_STREAMS).fill(0) },
          uWidth: { value: new Array<number>(MAX_STREAMS).fill(0) },
          uBright: { value: new Array<number>(MAX_STREAMS).fill(0) },
          uGrow: { value: new Array<number>(MAX_STREAMS).fill(0) },
          uEndY: { value: new Array<number>(MAX_STREAMS).fill(0) },
          uHorizonY: { value: HORIZON_Y },
          uPresentY: { value: PRESENT_Y },
          uDarken: { value: 0 },
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const darken = useRef(new Spring(0, 450));
  useFrame((_, dt) => {
    const ms = Math.min(dt * 1000, MAX_STEP_MS);
    const u = material.uniforms as Record<string, THREE.IUniform<number> | THREE.IUniform<number[]> | THREE.IUniform<THREE.Vector2>>;
    (u.uTime as THREE.IUniform<number>).value += ms / 1000;
    (u.uCount as THREE.IUniform<number>).value = layout.length;
    const arr = (k: string): number[] => (u[k] as THREE.IUniform<number[]>).value;
    const g: number[] = [];
    layout.forEach((l, i) => {
      arr("uAngle")[i] = l.angle;
      arr("uWidth")[i] = l.width;
      arr("uBright")[i] = l.bright;
      arr("uEndY")[i] = l.endY;
      // streams grow in a slight stagger so the fan "forms" rather than pops
      const spring = grows.current[i] as Spring;
      spring.halflife = holding ? GROW_HALFLIFE_MS + i * 25 : 120;
      const v = spring.to(holding ? 1 : 0, ms);
      arr("uGrow")[i] = v;
      g.push(v);
    });
    (u.uDarken as THREE.IUniform<number>).value = darken.current.to(pastHorizon ? 1 : 0, ms);
    (u.uResolution as THREE.IUniform<THREE.Vector2>).value.set(size.width, size.height);
    onGrow?.(g);
  });
  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
