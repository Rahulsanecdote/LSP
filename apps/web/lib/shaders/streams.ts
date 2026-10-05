/**
 * The probability streams, drawn analytically in one fragment shader: up to 7 lines that fan
 * forward from the present (bottom centre) toward the future (top). For each fragment we take
 * the distance to each stream's centreline and shade by width (= likelihood p) and brightness
 * (= confidence). `uGrow[i]` in 0..1 is the spring-eased growth over 600 ms. Fragments above the
 * horizon line are black; a stream whose terminus lies past the horizon runs into that black.
 */
export const STREAMS_FRAGMENT = /* glsl */ `
  precision highp float;
  const int MAXS = 7;
  uniform int uCount;
  uniform float uAngle[MAXS];      // radians from straight up; negative = left
  uniform float uWidth[MAXS];      // half-width in uv units
  uniform float uBright[MAXS];     // 0..1 confidence
  uniform float uGrow[MAXS];       // 0..1 grown fraction of the stream's own length
  uniform float uEndY[MAXS];       // uv y of the terminus (may exceed 1)
  uniform float uHorizonY;         // uv y of the horizon
  uniform float uPresentY;         // uv y of the present (the streams' origin), may be below the screen
  uniform float uDarken;           // past-horizon darkening of the whole field
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - uPresentY); // origin: the present
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < MAXS; i++) {
      if (i >= uCount) break;
      vec2 dir = vec2(sin(uAngle[i]), cos(uAngle[i]));
      float along = dot(p, dir);                 // distance along the stream
      float across = abs(p.x * dir.y - p.y * dir.x); // distance from the centreline
      float len = (uEndY[i] - uPresentY) / max(dir.y, 0.2) * uGrow[i];
      if (along < 0.0 || along > len) continue;
      // width tapers toward the terminus, as a stream thins toward its outcome
      float w = uWidth[i] * (1.0 - 0.4 * along / max(len, 1e-3));
      float core = smoothstep(w, w * 0.25, across);
      float glow = smoothstep(w * 3.0, 0.0, across) * 0.25;
      float tip = smoothstep(len, len - 0.03, along); // soft growing tip
      float b = uBright[i];
      vec3 c = mix(vec3(0.55, 0.70, 0.90), vec3(0.98, 0.99, 1.0), b) * (0.35 + 0.65 * b);
      float a = (core + glow) * tip;
      col += c * a;
      alpha = max(alpha, a);
    }
    // the horizon: everything beyond it is black, but only while the field is formed
    float formed = 0.0;
    for (int i = 0; i < MAXS; i++) { if (i >= uCount) break; formed = max(formed, uGrow[i]); }
    float beyond = smoothstep(uHorizonY - 0.01, uHorizonY + 0.01, vUv.y) * formed;
    col *= 1.0 - beyond;
    alpha = max(alpha * (1.0 - beyond), beyond * 0.92);
    col *= 1.0 - uDarken * 0.6;
    gl_FragColor = vec4(col, alpha);
  }
`;
