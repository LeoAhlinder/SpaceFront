/**
 * Oblique Lambert azimuthal equal-area projection, scaled so the whole globe
 * fits a unit disc. The center point sits in the middle of the disc and its
 * antipode (in the mid-Pacific) is stretched around the rim.
 *
 * Equal-area keeps territory fair: every tile covers the same real area, so a
 * country's tile count matches its real size. Shapes stretch toward the rim,
 * which is why the center is chosen so the rim is almost all ocean.
 *
 * Disc coordinates: u to the right (east), v downward (south), both in [-1, 1].
 */
const DEG = Math.PI / 180;

/** Center of the disc: west Africa, so the Americas sit left and Asia right. */
export const CENTER_LON = 10;
export const CENTER_LAT = 15;

const lon0 = CENTER_LON * DEG;
const sinLat0 = Math.sin(CENTER_LAT * DEG);
const cosLat0 = Math.cos(CENTER_LAT * DEG);

export function project(lonDeg: number, latDeg: number): { u: number; v: number } {
  const lat = latDeg * DEG;
  const dLon = lonDeg * DEG - lon0;
  const cosC = sinLat0 * Math.sin(lat) + cosLat0 * Math.cos(lat) * Math.cos(dLon);
  const k = Math.sqrt(2 / Math.max(1e-12, 1 + cosC));
  const x = k * Math.cos(lat) * Math.sin(dLon);
  const y = k * (cosLat0 * Math.sin(lat) - sinLat0 * Math.cos(lat) * Math.cos(dLon));
  return { u: x / 2, v: -y / 2 };
}

/** Inverse of `project`. Returns null outside the unit disc. */
export function unproject(u: number, v: number): { lon: number; lat: number } | null {
  const x = u * 2;
  const y = -v * 2;
  const rho = Math.hypot(x, y);
  if (rho > 2) return null;
  if (rho < 1e-12) return { lon: CENTER_LON, lat: CENTER_LAT };
  const c = 2 * Math.asin(rho / 2);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const lat = Math.asin(Math.max(-1, Math.min(1, cosC * sinLat0 + (y * sinC * cosLat0) / rho)));
  const lon = lon0 + Math.atan2(x * sinC, rho * cosLat0 * cosC - y * sinLat0 * sinC);
  return { lon: normalizeLon(lon / DEG), lat: lat / DEG };
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Disc coordinates of the center of tile (x, y) on a grid with the given side. */
export function tileCenter(x: number, y: number, side: number): { u: number; v: number } {
  return { u: (2 * x + 1 - side) / side, v: (2 * y + 1 - side) / side };
}

/** The tile (x, y) containing disc point (u, v). */
export function tileAt(u: number, v: number, side: number): { x: number; y: number } {
  return {
    x: Math.min(side - 1, Math.max(0, Math.floor(((u + 1) * side) / 2))),
    y: Math.min(side - 1, Math.max(0, Math.floor(((v + 1) * side) / 2))),
  };
}
