/** Minimal discrete-event scheduler. Virtual time only; nothing here reads a real clock. */

export interface Handle {
  readonly id: number;
}

interface Event {
  at: number;
  id: number;
  fn: () => void;
}

export class Sim {
  private queue: Event[] = [];
  private cancelled = new Set<number>();
  private seq = 0;
  private _now = 0;

  get now(): number {
    return this._now;
  }

  /** Schedule `fn` at absolute virtual time `at` (clamped to now). Events at equal times run in insertion order. */
  schedule(at: number, fn: () => void): Handle {
    const ev: Event = { at: Math.max(at, this._now), id: this.seq++, fn };
    // binary search for insertion point: after all events with at <= ev.at
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.queue[mid] as Event).at <= ev.at) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, ev);
    return { id: ev.id };
  }

  cancel(handle: Handle | null | undefined): void {
    if (handle) this.cancelled.add(handle.id);
  }

  /** Run every event with at <= until, then set now = until. */
  run(until: number): void {
    while (this.queue.length > 0 && (this.queue[0] as Event).at <= until) {
      const ev = this.queue.shift() as Event;
      if (this.cancelled.delete(ev.id)) continue;
      this._now = ev.at;
      ev.fn();
    }
    this._now = Math.max(this._now, until);
  }

  get pending(): number {
    return this.queue.length - this.cancelled.size;
  }
}
