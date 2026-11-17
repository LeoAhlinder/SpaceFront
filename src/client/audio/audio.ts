/**
 * Every sound in SpaceFront is synthesized here with the Web Audio API: no
 * recorded samples or third-party audio. Effects are short envelopes on
 * oscillators and filtered noise; the music is generated on the fly (see
 * music.ts). Volumes come from the settings (0–100).
 */
import { MusicPlayer } from "./music";

export type SoundName =
  | "click"
  | "build"
  | "finished"
  | "launch"
  | "land"
  | "explosion"
  | "warhead"
  | "laser"
  | "alert"
  | "notice"
  | "spawn"
  | "conquer"
  | "victory"
  | "defeat";

/** The shortest gap between two plays of the same sound, in seconds (stops noisy pile-ups). */
const MIN_GAP: Record<SoundName, number> = {
  click: 0.03,
  build: 0.1,
  finished: 0.2,
  launch: 0.15,
  land: 0.2,
  explosion: 0.12,
  warhead: 0.5,
  laser: 0.08,
  alert: 1.5,
  notice: 0.6,
  spawn: 0.5,
  conquer: 0.4,
  victory: 2,
  defeat: 2,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  private volumes = { master: 0.7, music: 0.5, sfx: 0.8 };
  private wantMusic: "menu" | "game" | null = null;

  /** Creates the audio graph. Browsers allow this only after a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.noise = makeNoise(ctx);
    this.music = new MusicPlayer(ctx, this.musicGain);
    this.applyVolumes();
    if (this.wantMusic) this.music.play(this.wantMusic);
  }

  /** Volumes in percent (0–100). */
  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master: master / 100, music: music / 100, sfx: sfx / 100 };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfx || !this.musicGain) return;
    const now = ctx.currentTime;
    // Squared, so the slider feels even to the ear.
    this.master.gain.setTargetAtTime(this.volumes.master ** 2, now, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx ** 2, now, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music ** 2 * 0.6, now, 0.05);
  }

  /** Starts (or switches) the generated music; null stops it. */
  playMusic(mood: "menu" | "game" | null): void {
    this.wantMusic = mood;
    if (!this.music) return;
    if (mood) this.music.play(mood);
    else this.music.stop();
  }

  /** Plays a sound effect; `gain` scales it (0–1), e.g. by distance. */
  play(name: SoundName, gain = 1): void {
    const ctx = this.ctx;
    const out = this.sfx;
    if (!ctx || !out || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < MIN_GAP[name]) return;
    this.lastPlayed.set(name, now);
    const bus = ctx.createGain();
    bus.gain.value = gain;
    bus.connect(out);
    SOUNDS[name](ctx, bus, now, this.noise!);
    // Disconnect the bus once the sound is surely over, so nodes can be collected.
    setTimeout(() => bus.disconnect(), 4000);
  }
}

type Synth = (ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer) => void;

/** Two seconds of white noise, shared by every noisy effect. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** An oscillator note with an attack/decay envelope, optionally gliding to `toFreq`. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  freq: number,
  dur: number,
  peak: number,
  toFreq?: number,
  attack = 0.005,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Filtered noise with an envelope; the filter can sweep from `from` to `to` Hz. */
function hiss(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  noise: AudioBuffer,
  type: BiquadFilterType,
  from: number,
  to: number,
  dur: number,
  peak: number,
  attack = 0.005,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

const SOUNDS: Record<SoundName, Synth> = {
  click: (ctx, out, t) => tone(ctx, out, t, "triangle", 880, 0.06, 0.15, 660),
  build: (ctx, out, t) => {
    tone(ctx, out, t, "triangle", 392, 0.12, 0.2);
    tone(ctx, out, t + 0.08, "triangle", 587, 0.18, 0.2);
  },
  finished: (ctx, out, t) => {
    for (const [i, f] of [523, 659, 784].entries()) {
      tone(ctx, out, t + i * 0.07, "sine", f, 0.5, 0.12);
    }
  },
  launch: (ctx, out, t, noise) => {
    hiss(ctx, out, t, noise, "bandpass", 300, 2400, 0.7, 0.35, 0.15);
    tone(ctx, out, t, "sawtooth", 70, 0.5, 0.12, 140, 0.05);
  },
  land: (ctx, out, t, noise) => {
    tone(ctx, out, t, "sine", 120, 0.35, 0.4, 50);
    hiss(ctx, out, t, noise, "lowpass", 900, 200, 0.3, 0.2);
  },
  explosion: (ctx, out, t, noise) => {
    hiss(ctx, out, t, noise, "lowpass", 2400, 120, 0.8, 0.5);
    tone(ctx, out, t, "sine", 90, 0.6, 0.35, 35);
  },
  warhead: (ctx, out, t, noise) => {
    hiss(ctx, out, t, noise, "lowpass", 3000, 60, 2.8, 0.7, 0.01);
    tone(ctx, out, t, "sine", 60, 2.5, 0.6, 22);
    tone(ctx, out, t + 0.05, "sawtooth", 110, 1.2, 0.12, 30);
  },
  laser: (ctx, out, t) => tone(ctx, out, t, "square", 1800, 0.12, 0.05, 300),
  alert: (ctx, out, t) => {
    for (let i = 0; i < 2; i++) {
      tone(ctx, out, t + i * 0.32, "square", 740, 0.14, 0.08);
      tone(ctx, out, t + i * 0.32 + 0.15, "square", 554, 0.14, 0.08);
    }
  },
  notice: (ctx, out, t) => {
    tone(ctx, out, t, "sine", 988, 0.3, 0.12);
    tone(ctx, out, t + 0.1, "sine", 1319, 0.4, 0.08);
  },
  spawn: (ctx, out, t, noise) => {
    hiss(ctx, out, t, noise, "bandpass", 200, 3000, 0.6, 0.15, 0.2);
    for (const [i, f] of [262, 330, 392, 523].entries()) {
      tone(ctx, out, t + 0.1 + i * 0.06, "triangle", f, 0.7, 0.12);
    }
  },
  conquer: (ctx, out, t) => {
    tone(ctx, out, t, "triangle", 330, 0.2, 0.15);
    tone(ctx, out, t + 0.12, "triangle", 494, 0.35, 0.15);
  },
  victory: (ctx, out, t) => {
    const notes = [392, 494, 587, 784, 988];
    notes.forEach((f, i) => tone(ctx, out, t + i * 0.12, "triangle", f, 1.6 - i * 0.1, 0.16));
    tone(ctx, out, t, "sawtooth", 98, 2, 0.06);
  },
  defeat: (ctx, out, t) => {
    const notes = [392, 349, 311, 262];
    notes.forEach((f, i) => tone(ctx, out, t + i * 0.3, "triangle", f, 0.9, 0.14));
    tone(ctx, out, t, "sawtooth", 65, 2.2, 0.06, 49);
  },
};

/** The game's one audio engine. */
export const audio = new AudioEngine();
