/**
 * The horizon pass: a fullscreen quad that blacks out everything beyond the horizon line while
 * the field is formed (`uFormed` = the most grown stream, 0 at rest so nothing shows). The
 * streams themselves are ribbons (ribbon.ts) drawn beneath it, so a stream whose terminus lies
 * past the horizon runs into this black.
 */
export const HORIZON_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uHorizonY;
  uniform float uFormed;
  varying vec2 vUv;
  void main() {
    float beyond = smoothstep(uHorizonY - 0.01, uHorizonY + 0.01, vUv.y) * uFormed;
    gl_FragColor = vec4(0.0, 0.0, 0.0, beyond * 0.92);
  }
`;
