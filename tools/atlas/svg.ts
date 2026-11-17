/**
 * Small helpers for writing SVG by hand in the atlas tool. Every sprite in
 * SpaceFront is drawn by code here: no third-party art.
 */

/** Seeded random numbers (mulberry32), so the atlas is the same on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds to 2 decimals, so the SVG stays short. */
export const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/** A polygon's `points` attribute from flat x, y pairs. */
export function pts(...xy: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push(`${r2(xy[i]!)},${r2(xy[i + 1]!)}`);
  return out.join(" ");
}

/** A regular polygon around (cx, cy), first corner at angle `start` (radians). */
export function regular(cx: number, cy: number, r: number, sides: number, start = 0): string {
  const xy: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides;
    xy.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts(...xy);
}

/** An SVG element string. Attributes with undefined values are left out. */
export function el(
  name: string,
  attrs: Record<string, string | number | undefined>,
  children = "",
): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === "number" ? r2(v) : v}"`)
    .join(" ");
  return children ? `<${name} ${a}>${children}</${name}>` : `<${name} ${a}/>`;
}
