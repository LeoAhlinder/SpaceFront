/**
 * Seeded deterministic random number generator (xoshiro128**).
 *
 * All randomness in the simulation comes from an `Rng` stored in the World (or a
 * per-faction stream derived from the match seed). The state is four uint32
 * words, so it can be hashed, saved and restored exactly.
 */
export class Rng {
  /** Generator state. Exposed for hashing and save/load. */
  readonly state: Uint32Array;

  private constructor(state: Uint32Array) {
    this.state = state;
  }

  /**
   * Creates a generator from a seed. Different `stream` values give independent
   * sequences for the same seed (e.g. one stream per AI faction), so adding or
   * removing one consumer never shifts the numbers another consumer sees.
   */
  static fromSeed(seed: number, stream = 0): Rng {
    let x = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) | 0;
    const state = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) | 0;
      state[i] = splitmix32(x);
    }
    // xoshiro must never have an all-zero state.
    if ((state[0]! | state[1]! | state[2]! | state[3]!) === 0) state[0] = 1;
    return new Rng(state);
  }

  /** Restores a generator from a saved state (copied, not shared). */
  static fromState(state: ArrayLike<number>): Rng {
    if (state.length !== 4) throw new Error("Rng state must have 4 words");
    return new Rng(Uint32Array.from(state));
  }

  clone(): Rng {
    return Rng.fromState(this.state);
  }

  /** Next raw value in [0, 2^32). */
  nextU32(): number {
    const s = this.state;
    const s0 = s[0]!;
    const s1 = s[1]!;
    const s2 = s[2]!;
    const s3 = s[3]!;

    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;

    const n2 = s2 ^ s0;
    const n3 = s3 ^ s1;
    s[1] = s1 ^ n2;
    s[0] = s0 ^ n3;
    s[2] = n2 ^ t;
    s[3] = rotl(n3, 11);

    return result;
  }

  /** Uniform integer in [0, n). `n` must be an integer in [1, 2^32]. Unbiased. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 0x1_0000_0000) {
      throw new RangeError(`nextInt: invalid bound ${n}`);
    }
    // Reject the top partial bucket so every result is equally likely.
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  /** Uniform integer in [min, max] (both inclusive). */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** True with probability `numerator / denominator`. */
  chance(numerator: number, denominator: number): boolean {
    return this.nextInt(denominator) < numerator;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32 finalizer: turns a counter into a well-mixed uint32. */
function splitmix32(x: number): number {
  let t = x ^ (x >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return t >>> 0;
}
