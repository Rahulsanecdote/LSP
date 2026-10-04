/**
 * Seeded PRNG. The sim must be reproducible: same seed, same run. No Math.random anywhere.
 * splitmix32 for the stream; Box–Muller for normals.
 */
export class Rng {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = z ^ (z >>> 15);
    return (z >>> 0) / 4294967296;
  }

  /** Normal with the given mean and standard deviation. */
  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mean + sd * v;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * v;
    this.spare = r * Math.sin(theta);
    return mean + sd * r * Math.cos(theta);
  }

  /** Derive an independent stream for a sub-component. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}
