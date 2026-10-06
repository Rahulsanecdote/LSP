/**
 * Tileable 3D gradient noise, written from the lattice definition. Not ported from any repo.
 *
 * Gradient noise on an integer lattice: at each lattice point pick a pseudo-random unit-ish
 * gradient; for a sample point take the dot product of each corner's gradient with the offset
 * from that corner, and blend the eight corner values with a C2-continuous fade
 * f(t) = 6t^5 − 15t^4 + 10t^3. Tiling comes from hashing the lattice coordinate modulo the
 * period, so cell (P, y, z) uses the same gradient as (0, y, z).
 *
 * The hash is a small integer mix on the wrapped lattice coordinates; it only has to be
 * decorrelated across neighbouring cells, not cryptographic.
 */
export const NOISE3D_GLSL = /* glsl */ `
  float lsp_fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

  // integer hash on wrapped lattice coordinates → [0,1)
  float lsp_hash(vec3 p, float period) {
    p = mod(p, period);
    // three rounds of the classic 32-bit style mix, kept in float precision range
    float h = dot(p, vec3(127.1, 311.7, 74.7));
    return fract(sin(h) * 43758.5453123);
  }

  vec3 lsp_gradient(vec3 cell, float period) {
    float a = lsp_hash(cell, period) * 6.2831853;
    float b = lsp_hash(cell + vec3(19.0, 7.0, 3.0), period) * 6.2831853;
    // point on the unit sphere from two angles
    return vec3(cos(a) * cos(b), sin(a) * cos(b), sin(b));
  }

  // gradient noise in [-1, 1], tileable with the given integer period
  float lsp_noise3(vec3 x, float period) {
    vec3 i = floor(x);
    vec3 f = x - i;
    vec3 u = vec3(lsp_fade(f.x), lsp_fade(f.y), lsp_fade(f.z));
    float n000 = dot(lsp_gradient(i + vec3(0,0,0), period), f - vec3(0,0,0));
    float n100 = dot(lsp_gradient(i + vec3(1,0,0), period), f - vec3(1,0,0));
    float n010 = dot(lsp_gradient(i + vec3(0,1,0), period), f - vec3(0,1,0));
    float n110 = dot(lsp_gradient(i + vec3(1,1,0), period), f - vec3(1,1,0));
    float n001 = dot(lsp_gradient(i + vec3(0,0,1), period), f - vec3(0,0,1));
    float n101 = dot(lsp_gradient(i + vec3(1,0,1), period), f - vec3(1,0,1));
    float n011 = dot(lsp_gradient(i + vec3(0,1,1), period), f - vec3(0,1,1));
    float n111 = dot(lsp_gradient(i + vec3(1,1,1), period), f - vec3(1,1,1));
    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z) * 1.5; // gradient noise peaks near ±0.66; rescale toward ±1
  }

  // three octaves; the period doubles with the frequency so every octave still tiles
  float lsp_fbm3(vec3 x, float period) {
    float s = 0.0, a = 0.5, f = 1.0;
    for (int o = 0; o < 3; o++) {
      s += a * lsp_noise3(x * f, period * f);
      f *= 2.0;
      a *= 0.5;
    }
    return s;
  }
`;

/** Fullscreen frost: fbm noise scrolling toward the viewer, forming as `uHold` rises. */
export const FROST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uHold;      // 0 → 1 as the field forms
  uniform float uDarken;    // 0 → 1 past the horizon
  uniform float uSaturation; // scene desaturation, 1 = full colour
  uniform vec2 uResolution;
  varying vec2 vUv;
  ${NOISE3D_GLSL}
  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec3 p = vec3(uv.x * aspect * 3.0, uv.y * 3.0, uTime * 0.35); // z scrolls toward the viewer
    float n = lsp_fbm3(p, 8.0);
    // frost: ridged noise, crystalline edges
    float ridge = 1.0 - abs(n);
    ridge = pow(ridge, 6.0); // thin crystalline ridges, not a wash
    // the field forms from the bottom (the present) upward (the future) as the hold progresses
    float form = smoothstep(uv.y - 0.15, uv.y + 0.15, uHold * 1.3);
    vec3 scene = mix(vec3(0.10, 0.12, 0.17), vec3(0.07, 0.11, 0.22), uv.y); // the desaturated deep
    float grey = dot(scene, vec3(0.299, 0.587, 0.114));
    scene = mix(vec3(grey), scene, uSaturation);
    vec3 frost = vec3(0.72, 0.84, 0.95) * ridge;
    vec3 col = scene + frost * form * 0.42;
    // beyond the horizon: black that breathes
    float breathe = 0.5 + 0.5 * sin(uTime * 1.8);
    col *= 1.0 - uDarken * (0.75 + 0.2 * breathe);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
