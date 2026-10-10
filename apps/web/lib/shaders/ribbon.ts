/**
 * One probability stream as a triangle-strip ribbon around its differential-growth polyline.
 * The strip is built on the CPU (Streams.tsx) in the streams' uv space: x aspect-corrected about
 * the centre, y measured from the present. Each vertex carries where it sits across the ribbon
 * (−1..1 over the glow extent), the core half-width there, a tip fade, and the stream's
 * brightness; the fragment reproduces the Task 2 look (soft core, wide faint glow, soft tip)
 * from those instead of an analytic distance to a straight line.
 */
export const RIBBON_VERTEX = /* glsl */ `
  precision highp float;
  attribute float aAcross;
  attribute float aWidth;
  attribute float aTip;
  attribute float aBright;
  uniform float uAspect;
  uniform float uPresentY;
  varying float vAcross;
  varying float vWidth;
  varying float vTip;
  varying float vBright;
  void main() {
    vAcross = aAcross;
    vWidth = aWidth;
    vTip = aTip;
    vBright = aBright;
    float ux = position.x / uAspect + 0.5;
    float uy = position.y + uPresentY;
    gl_Position = vec4(ux * 2.0 - 1.0, uy * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const RIBBON_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uDarken;            // past-horizon darkening of the whole field
  varying float vAcross;
  varying float vWidth;
  varying float vTip;
  varying float vBright;
  void main() {
    float w = vWidth;
    float dist = abs(vAcross) * 3.0 * w;      // the strip spans the glow, three core widths each side
    float core = smoothstep(w, w * 0.25, dist);
    float glow = smoothstep(w * 3.0, 0.0, dist) * 0.25;
    float b = vBright;
    vec3 c = mix(vec3(0.55, 0.70, 0.90), vec3(0.98, 0.99, 1.0), b) * (0.35 + 0.65 * b);
    float a = (core + glow) * vTip;
    c *= 1.0 - uDarken * 0.6;
    gl_FragColor = vec4(c * a, a);
  }
`;
