/**
 * Flat world map: Miller cylindrical projection (a softened Mercator), cropped
 * to NORTH…SOUTH latitude. It looks like a familiar world map. Countries are
 * not shown at their true size: land far from the equator is enlarged, which
 * is fine for a game and gives Europe and North America more room.
 *
 * Map coordinates: px from the left edge (longitude −180°) and py from the top
 * edge (latitude NORTH), both in tiles (fractional).
 */
const DEG = Math.PI / 180;

export const NORTH = 80;
export const SOUTH = -60;

function millerY(latDeg: number): number {
  return 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * latDeg * DEG));
}

const Y_TOP = millerY(NORTH);
const Y_BOTTOM = millerY(SOUTH);
const Y_RANGE = Y_TOP - Y_BOTTOM;

/** Map height (in tiles) that keeps the projection's proportions for a given width. */
export function heightForWidth(width: number): number {
  return Math.round((width * Y_RANGE) / (2 * Math.PI));
}

export function project(
  lonDeg: number,
  latDeg: number,
  width: number,
  height: number,
): { px: number; py: number } {
  return {
    px: ((lonDeg + 180) / 360) * width,
    py: ((Y_TOP - millerY(latDeg)) / Y_RANGE) * height,
  };
}

export function unproject(
  px: number,
  py: number,
  width: number,
  height: number,
): { lon: number; lat: number } {
  const y = Y_TOP - (py / height) * Y_RANGE;
  const lat = (Math.atan(Math.exp(y / 1.25)) - Math.PI / 4) / 0.4 / DEG;
  return { lon: (px / width) * 360 - 180, lat };
}
