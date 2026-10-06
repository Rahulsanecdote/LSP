/**
 * The horizon drone (design doc §1): a quiet tone under the read that drops an octave when the
 * hold passes the horizon. Audio here is never the only channel; the field darkens too.
 * Created lazily on the first hold, which is a user gesture, so autoplay policy allows it.
 */
export class HorizonDrone {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private readonly baseHz = 110;

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = this.baseHz;
    this.osc.connect(this.gain);
    this.osc.start();
    return true;
  }

  start(): void {
    if (!this.ensure() || !this.ctx || !this.gain || !this.osc) return;
    void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(this.baseHz, t, 0.05);
    this.gain.gain.setTargetAtTime(0.04, t, 0.3);
  }

  /** Past the horizon: one octave down. */
  setPastHorizon(past: boolean): void {
    if (!this.ctx || !this.osc) return;
    this.osc.frequency.setTargetAtTime(past ? this.baseHz / 2 : this.baseHz, this.ctx.currentTime, 0.4);
  }

  stop(): void {
    if (!this.ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  dispose(): void {
    this.osc?.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.osc = null;
    this.gain = null;
  }
}
