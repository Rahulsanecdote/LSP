"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FULLSCREEN_VERTEX } from "@/lib/shaders/noise3d";
import { GRAY_SCOTT_DISPLAY_FRAGMENT, GRAY_SCOTT_STEP_FRAGMENT } from "@/lib/shaders/grayScott";

export const MAX_BLOBS = 6;
/** Fixed simulation size, independent of device pixel ratio (note 3): every phone runs the same field. */
export const SIM_SIZE = 256;
const STEPS_PER_FRAME = 6;

export interface Blob {
  x: number;
  y: number;
  tint: [number, number, number];
}

const INIT_FRAGMENT = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }
`;

/**
 * Gray–Scott reaction–diffusion in a ping-pong pair of SIM_SIZE² half-float targets, drawn
 * upscaled to the canvas. `flares[i]` (0..1) brightens blob i toward prismatic white; the caller
 * owns the spring so the value exists even if WebGL does not.
 */
export type SimStatus = { type: "half" | "float" | "byte"; complete: boolean } | null;

function makeTargets(type: THREE.TextureDataType): readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] {
  const mk = () =>
    new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
  return [mk(), mk()] as const;
}

export function GrayScott({ blobs, flares, onStatus }: { blobs: Blob[]; flares: number[]; onStatus?: (s: SimStatus) => void }) {
  const { gl, size } = useThree();
  // Half float is the intended target (iOS Safari and Chrome Android both render to it). If the
  // framebuffer comes back incomplete, step down to float, then to 8-bit so something still shows.
  const targetsRef = useRef<readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null>(null);
  const statusRef = useRef<SimStatus>(null);
  const pickTargets = (): readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] => {
    if (targetsRef.current) return targetsRef.current;
    const ctx = gl.getContext();
    const candidates: Array<["half" | "float" | "byte", THREE.TextureDataType]> = [
      ["half", THREE.HalfFloatType],
      ["float", THREE.FloatType],
      ["byte", THREE.UnsignedByteType],
    ];
    for (const [name, type] of candidates) {
      const t = makeTargets(type);
      gl.setRenderTarget(t[0]);
      const complete = ctx.checkFramebufferStatus(ctx.FRAMEBUFFER) === ctx.FRAMEBUFFER_COMPLETE;
      gl.setRenderTarget(null);
      if (complete || name === "byte") {
        targetsRef.current = t;
        statusRef.current = { type: name, complete };
        onStatus?.(statusRef.current);
        return t;
      }
      t[0].dispose();
      t[1].dispose();
    }
    throw new Error("unreachable");
  };
  const simScene = useMemo(() => new THREE.Scene(), []);
  const simCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const stepUniforms = useMemo(
    () => ({
      uState: { value: null as THREE.Texture | null },
      uTexel: { value: new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE) },
      uDu: { value: 0.16 },
      uDv: { value: 0.08 },
      uF: { value: 0.035 },
      uK: { value: 0.062 },
      uBlobCount: { value: 0 },
      uBlobPos: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector2(0.5, 0.5)) },
      uBlobSeed: { value: new Array<number>(MAX_BLOBS).fill(0) },
    }),
    [],
  );
  const displayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: GRAY_SCOTT_DISPLAY_FRAGMENT,
        uniforms: {
          uState: { value: null as THREE.Texture | null },
          uBlobCount: { value: 0 },
          uBlobPos: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector2(0.5, 0.5)) },
          uFlare: { value: new Array<number>(MAX_BLOBS).fill(0) },
          uTint: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector3(0.4, 0.6, 0.9)) },
          uTime: { value: 0 },
          uAspect: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  // ShaderMaterial clones its constructor uniforms: always mutate the material's own copies.
  const displayUniforms = displayMaterial.uniforms as {
    uState: THREE.IUniform<THREE.Texture | null>;
    uBlobCount: THREE.IUniform<number>;
    uBlobPos: THREE.IUniform<THREE.Vector2[]>;
    uFlare: THREE.IUniform<number[]>;
    uTint: THREE.IUniform<THREE.Vector3[]>;
    uTime: THREE.IUniform<number>;
    uAspect: THREE.IUniform<number>;
  };
  const stepMaterial = useMemo(() => new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader: GRAY_SCOTT_STEP_FRAGMENT, uniforms: stepUniforms, depthTest: false, depthWrite: false }), [stepUniforms]);
  // same rule for the step material: drive the clone it owns
  const stepU = stepMaterial.uniforms as typeof stepUniforms;
  const initMaterial = useMemo(() => new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader: INIT_FRAGMENT, depthTest: false, depthWrite: false }), []);
  const quad = useMemo(() => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), initMaterial), [initMaterial]);
  const readIdx = useRef(0);
  const initialised = useRef(false);
  // When the crew changes, the blobs move; without a reset the old positions linger as rings
  // the reaction only slowly absorbs. A fresh field re-forms in well under a second.
  const layoutKey = blobs.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`).join("|");
  const lastLayoutKey = useRef(layoutKey);
  if (lastLayoutKey.current !== layoutKey) {
    lastLayoutKey.current = layoutKey;
    initialised.current = false;
  }

  useEffect(() => {
    simScene.add(quad);
    return () => {
      simScene.remove(quad);
      targetsRef.current?.[0].dispose();
      targetsRef.current?.[1].dispose();
      stepMaterial.dispose();
      initMaterial.dispose();
      displayMaterial.dispose();
      quad.geometry.dispose();
    };
  }, [simScene, quad, stepMaterial, initMaterial, displayMaterial]);

  useFrame((_, dt) => {
    displayUniforms.uTime.value += Math.min(dt, 0.25);
    displayUniforms.uAspect.value = size.width / Math.max(size.height, 1);
    const count = Math.min(blobs.length, MAX_BLOBS);
    stepU.uBlobCount.value = count;
    displayUniforms.uBlobCount.value = count;
    for (let i = 0; i < MAX_BLOBS; i++) {
      const b = blobs[i];
      if (b) {
        stepU.uBlobPos.value[i]?.set(b.x, b.y);
        displayUniforms.uBlobPos.value[i]?.set(b.x, b.y);
        displayUniforms.uTint.value[i]?.set(b.tint[0], b.tint[1], b.tint[2]);
        stepU.uBlobSeed.value[i] = 1;
      } else {
        stepU.uBlobSeed.value[i] = 0;
      }
      displayUniforms.uFlare.value[i] = Math.max(0, Math.min(1, flares[i] ?? 0));
    }

    const targets = pickTargets();
    const prevTarget = gl.getRenderTarget();
    if (!initialised.current) {
      quad.material = initMaterial;
      for (const t of targets) {
        gl.setRenderTarget(t);
        gl.render(simScene, simCamera);
      }
      initialised.current = true;
    }
    quad.material = stepMaterial;
    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      const read = targets[readIdx.current] as THREE.WebGLRenderTarget;
      const write = targets[1 - readIdx.current] as THREE.WebGLRenderTarget;
      stepU.uState.value = read.texture;
      gl.setRenderTarget(write);
      gl.render(simScene, simCamera);
      readIdx.current = 1 - readIdx.current;
    }
    gl.setRenderTarget(prevTarget);
    displayUniforms.uState.value = (targets[readIdx.current] as THREE.WebGLRenderTarget).texture;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={displayMaterial} attach="material" />
    </mesh>
  );
}
