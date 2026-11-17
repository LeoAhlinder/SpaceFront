/**
 * Generated ambient music: slow pad chords, a low drone and sparse bell
 * notes from the chord's scale, scheduled a little ahead of time. Nothing is
 * recorded; every run plays a different variation of the same progression.
 */

/** Chords as semitones above the root (A2 = 110 Hz), four bars each. */
const PROGRESSIONS = {
  // Calm and wide for the menu.
  menu: [
    [0, 7, 12, 16],
    [-4, 3, 8, 15],
    [-2, 5, 10, 14],
    [-7, 0, 5, 12],
  ],
  // A little darker and busier in a match.
  game: [
    [0, 7, 12, 15],
    [-4, 3, 8, 12],
    [-7, 0, 5, 12],
    [-2, 5, 10, 14],
  ],
} as const;

/** Notes the bells pick from (A natural minor, two octaves). */
const BELL_SCALE = [12, 14, 15, 17, 19, 20, 22, 24, 26, 27, 29, 31];
const ROOT_HZ = 110;
const BAR_SECONDS = 4.8;
const BARS_PER_CHORD = 2;
const LOOKAHEAD_S = 0.6;

const hz = (semitones: number) => ROOT_HZ * 2 ** (semitones / 12);

export class MusicPlayer {
  private mood: keyof typeof PROGRESSIONS | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBarAt = 0;
  private bar = 0;
  private readonly out: GainNode;
  private readonly echo: DelayNode;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    // A soft feedback echo gives the bells some space.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    this.echo.connect(tone).connect(feedback).connect(this.echo);
    tone.connect(this.out);
  }

  play(mood: keyof typeof PROGRESSIONS): void {
    if (this.mood === mood && this.timer !== null) return;
    this.mood = mood;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(1, now, 1.5);
    if (this.timer === null) {
      this.nextBarAt = now + 0.1;
      this.timer = setInterval(() => this.schedule(), 200);
      this.schedule();
    }
  }

  stop(): void {
    this.mood = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedules every bar that starts within the lookahead window. */
  private schedule(): void {
    if (!this.mood) return;
    while (this.nextBarAt < this.ctx.currentTime + LOOKAHEAD_S) {
      this.playBar(this.nextBarAt, this.mood);
      this.nextBarAt += BAR_SECONDS;
      this.bar++;
    }
  }

  private playBar(t: number, mood: keyof typeof PROGRESSIONS): void {
    const chords = PROGRESSIONS[mood];
    const chord = chords[Math.floor(this.bar / BARS_PER_CHORD) % chords.length]!;
    const newChord = this.bar % BARS_PER_CHORD === 0;
    if (newChord) {
      const length = BAR_SECONDS * BARS_PER_CHORD;
      for (const n of chord) this.pad(t, hz(n), length);
      this.drone(t, hz(chord[0] - 12), length);
    }
    // Sparse bells: a few notes per bar, more in a match.
    const notes = mood === "game" ? 4 : 2;
    for (let i = 0; i < notes; i++) {
      if (Math.random() < 0.35) continue;
      const step = Math.floor(Math.random() * 8);
      const pick = BELL_SCALE[Math.floor(Math.random() * BELL_SCALE.length)]!;
      this.bell(t + (step * BAR_SECONDS) / 8, hz(pick + 12));
    }
  }

  /** Two detuned saws through a slowly opening low-pass filter. */
  private pad(t: number, freq: number, dur: number): void {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.linearRampToValueAtTime(900, t + dur / 2);
    filter.frequency.linearRampToValueAtTime(350, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.035, t + dur * 0.3);
    env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    filter.connect(env).connect(this.out);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 1);
    }
  }

  private drone(t: number, freq: number, dur: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.09, t + 1.5);
    env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.6);
  }

  /** A soft bell: a sine with a quiet fifth above, decaying fast. */
  private bell(t: number, freq: number): void {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    env.connect(this.out);
    env.connect(this.echo);
    for (const [mult, level] of [
      [1, 1],
      [3, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + 2.3);
    }
  }
}
