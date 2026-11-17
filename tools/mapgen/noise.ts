/**
 * Seeded 3D value noise. Sampled on the unit sphere so there are no seams at
 * the date line. Build-time only (the output is committed), so floats are fine.
 */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

/** Fractal noise in [0, 1) at a point on the unit sphere. */
export function sphereNoise(
  lonDeg: number,
  latDeg: number,
  seed: number,
  baseFrequency = 3,
  octaves = 5,
): number {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const px = Math.cos(lat) * Math.cos(lon);
  const py = Math.cos(lat) * Math.sin(lon);
  const pz = Math.sin(lat);
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = baseFrequency;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(px * f, py * f, pz * f, seed + o * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    f *= 2;
  }
  return sum / total;
}
