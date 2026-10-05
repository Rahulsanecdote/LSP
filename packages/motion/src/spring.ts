/**
 * Critically damped spring, from the equation of motion. Nothing here is ported from a library;
 * SLICE_HANDOFF.md §2 forbids copying the reference material, so the derivation is written out.
 *
 *   x'' = −2ω x' − ω² (x − target)                    (damping ratio ζ = 1)
 *
 * With d = x − target the general solution is d(t) = (A + B t) e^{−ωt}. Matching d(0) = d0 and
 * d'(0) = v0 gives A = d0, B = v0 + ω d0, hence for a step of length dt:
 *
 *   d(dt) = (d0 + (v0 + ω d0) dt) e^{−ω dt}
 *   v(dt) = (v0 − ω (v0 + ω d0) dt) e^{−ω dt}
 *
 * This is the exact solution, so stepping twice by dt/2 equals stepping once by dt: the easing is
 * frame-rate independent and never overshoots from rest.
 *
 * Halflife. From rest, d(t)/d0 = (1 + ωt) e^{−ωt}. We define `halflife` as the time for that
 * ratio to reach 1/2, which gives ω = u* / halflife where u* solves (1 + u) e^{−u} = 1/2,
 * u* ≈ 1.6783469900166605. So "halflife 200 ms" means a released value is exactly halfway home
 * after 200 ms, which is the number a designer actually wants to tune.
 */

/** Root of (1 + u) e^{−u} = 1/2. */
export const HALFLIFE_ROOT = 1.6783469900166605;

export interface SpringState {
  value: number;
  velocity: number;
}

/** Angular frequency for a critically damped spring with the given halflife (ms or s, your choice; be consistent with dt). */
export function omegaFromHalflife(halflife: number): number {
  return HALFLIFE_ROOT / halflife;
}

/**
 * Advance a critically damped spring by `dt` toward `target`.
 * `halflife <= 0` snaps to the target; `dt <= 0` returns the input unchanged.
 */
export function springTo(current: number, target: number, velocity: number, halflife: number, dt: number): SpringState {
  if (!(dt > 0)) return { value: current, velocity };
  if (!(halflife > 0)) return { value: target, velocity: 0 };
  const omega = omegaFromHalflife(halflife);
  const d0 = current - target;
  const c = velocity + omega * d0;
  const decay = Math.exp(-omega * dt);
  const d = (d0 + c * dt) * decay;
  const v = (velocity - omega * c * dt) * decay;
  return { value: target + d, velocity: v };
}

/** Convenience wrapper holding its own state. */
export class Spring {
  value: number;
  velocity = 0;
  halflife: number;

  constructor(initial: number, halflife: number) {
    this.value = initial;
    this.halflife = halflife;
  }

  /** Step toward `target` by `dt`; returns the new value. */
  to(target: number, dt: number): number {
    const s = springTo(this.value, target, this.velocity, this.halflife, dt);
    this.value = s.value;
    this.velocity = s.velocity;
    return this.value;
  }

  /** Jump without motion. */
  snap(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  /** True once within `epsilon` of `target` and nearly still. */
  settled(target: number, epsilon = 1e-3): boolean {
    return Math.abs(this.value - target) < epsilon && Math.abs(this.velocity) < epsilon;
  }
}
