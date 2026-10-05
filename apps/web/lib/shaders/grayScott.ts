/**
 * Gray–Scott reaction–diffusion, from the model equations. Not ported from any repo.
 *
 *   ∂u/∂t = Du ∇²u − u v² + F (1 − u)
 *   ∂v/∂t = Dv ∇²v + u v² − (F + k) v
 *
 * Simulated on a fixed-size texture (u in .r, v in .g) with an explicit Euler step and the
 * usual 9-point Laplacian (centre −1, edge neighbours 0.2, diagonals 0.05). The simulation
 * resolution is independent of device pixel ratio so every phone runs the same field; the
 * display pass upsamples. Up to 6 "blobs" (one per crew member) are kept alive by seeding v at
 * their centres each step. A blob's `uFlare` brightens its rendering toward prismatic white.
 */
export const GRAY_SCOTT_STEP_FRAGMENT = /* glsl */ `
  precision highp float;
  const int MAXB = 6;
  uniform sampler2D uState;
  uniform vec2 uTexel;        // 1 / simulation size
  uniform float uDu, uDv, uF, uK;
  uniform int uBlobCount;
  uniform vec2 uBlobPos[MAXB];
  uniform float uBlobSeed[MAXB]; // how strongly to keep feeding v at this blob
  varying vec2 vUv;

  void main() {
    vec2 c = texture2D(uState, vUv).rg;
    vec2 lap = -c
      + 0.2  * (texture2D(uState, vUv + vec2( uTexel.x, 0.0)).rg + texture2D(uState, vUv + vec2(-uTexel.x, 0.0)).rg
              + texture2D(uState, vUv + vec2(0.0,  uTexel.y)).rg + texture2D(uState, vUv + vec2(0.0, -uTexel.y)).rg)
      + 0.05 * (texture2D(uState, vUv + vec2( uTexel.x,  uTexel.y)).rg + texture2D(uState, vUv + vec2(-uTexel.x,  uTexel.y)).rg
              + texture2D(uState, vUv + vec2( uTexel.x, -uTexel.y)).rg + texture2D(uState, vUv + vec2(-uTexel.x, -uTexel.y)).rg);
    float u = c.r, v = c.g;
    float uvv = u * v * v;
    float du = uDu * lap.r - uvv + uF * (1.0 - u);
    float dv = uDv * lap.g + uvv - (uF + uK) * v;
    u += du; v += dv;
    // seed the crew's blobs so they persist as living shapes
    for (int i = 0; i < MAXB; i++) {
      if (i >= uBlobCount) break;
      float d = distance(vUv, uBlobPos[i]);
      v += uBlobSeed[i] * smoothstep(0.045, 0.0, d) * 0.08;
    }
    gl_FragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
  }
`;

export const GRAY_SCOTT_DISPLAY_FRAGMENT = /* glsl */ `
  precision highp float;
  const int MAXB = 6;
  uniform sampler2D uState;
  uniform int uBlobCount;
  uniform vec2 uBlobPos[MAXB];
  uniform float uFlare[MAXB];   // 0..1 prismatic-white flare per blob
  uniform vec3 uTint[MAXB];
  uniform float uTime;
  uniform float uAspect;        // canvas width / height
  varying vec2 vUv;

  void main() {
    // the simulation is square; map the canvas onto it so blobs stay round on a tall phone
    vec2 st = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5) + 0.5;
    float v = texture2D(uState, st).g;
    float shape = smoothstep(0.08, 0.35, v);
    vec3 col = vec3(0.04, 0.05, 0.08);
    for (int i = 0; i < MAXB; i++) {
      if (i >= uBlobCount) break;
      float d = distance(st, uBlobPos[i]);
      float belong = smoothstep(0.22, 0.0, d);   // which blob this fragment mostly belongs to
      vec3 base = uTint[i] * shape * belong;
      // prismatic white: the shape goes to white with a thin spectral fringe at its edge
      float edge = smoothstep(0.08, 0.16, v) * (1.0 - smoothstep(0.16, 0.30, v));
      vec3 prism = vec3(0.5 + 0.5 * sin(d * 60.0 + uTime * 3.0),
                        0.5 + 0.5 * sin(d * 60.0 + 2.1 + uTime * 3.0),
                        0.5 + 0.5 * sin(d * 60.0 + 4.2 + uTime * 3.0));
      vec3 flared = mix(base, vec3(1.0) * shape * belong + prism * edge * belong, uFlare[i]);
      col += flared;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;
