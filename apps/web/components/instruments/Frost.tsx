"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Spring } from "@lsp/motion";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FROST_FRAGMENT, FULLSCREEN_VERTEX } from "@/lib/shaders/noise3d";

/** Animation step cap: a long gap (tab switch, software renderer) advances at most this much per frame. */
export const MAX_STEP_MS = 250;

/**
 * The frost field: tileable 3D noise scrolling toward the viewer, forming on hold.
 * The material is built by hand and attached as a primitive: ShaderMaterial clones the uniforms
 * it is constructed with, so we must mutate `material.uniforms`, not the object we passed in.
 */
export function Frost({ holding, pastHorizon }: { holding: boolean; pastHorizon: boolean }) {
  const { size } = useThree();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: FROST_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHold: { value: 0 },
          uDarken: { value: 0 },
          uSaturation: { value: 1 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const hold = useRef(new Spring(0, 160));
  const darken = useRef(new Spring(0, 450));
  const sat = useRef(new Spring(1, 200));
  useFrame((_, dt) => {
    const ms = Math.min(dt * 1000, MAX_STEP_MS);
    const u = material.uniforms;
    (u.uTime as THREE.IUniform<number>).value += ms / 1000;
    (u.uHold as THREE.IUniform<number>).value = hold.current.to(holding ? 1 : 0, ms);
    (u.uDarken as THREE.IUniform<number>).value = darken.current.to(pastHorizon ? 1 : 0, ms);
    (u.uSaturation as THREE.IUniform<number>).value = sat.current.to(holding ? 0.15 : 1, ms);
    (u.uResolution as THREE.IUniform<THREE.Vector2>).value.set(size.width, size.height);
  });
  return (
    <mesh frustumCulled={false} renderOrder={0}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
