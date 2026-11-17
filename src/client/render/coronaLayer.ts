import { BufferImageSource, Sprite, Texture } from "pixi.js";
import { BALANCE } from "../../data/balance";
import type { CoronaInit } from "../../shared/messages";
import { mix } from "./colors";

/** Neutral Corona colors per band (inner, middle, outer): hotter toward the Sun. */
const BAND_COLORS = [0xffb040, 0xd8702a, 0x8a3c22];
/** How strongly an owner's color tints its Corona tiles (0–1). */
const TINT = 0.65;
const BORDER_DARKEN = 0.35;
const TURN = Math.PI * 2;

/** Radius of the Corona's inner and outer edge in space units (matches core). */
export const CORONA_INNER = BALANCE.corona.innerRadius;
export const CORONA_OUTER = BALANCE.corona.outerRadius;

/** The Corona tile at a point in space, or -1 outside the ring. */
export function coronaTileAt(info: CoronaInit, x: number, y: number): number {
  const r = Math.hypot(x, y);
  const ring = Math.floor(((r - CORONA_INNER) / (CORONA_OUTER - CORONA_INNER)) * info.rings);
  if (ring < 0 || ring >= info.rings) return -1;
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += TURN;
  const sector = Math.floor((angle / TURN) * info.sectors) % info.sectors;
  return ring * info.sectors + sector;
}

/** Center of a Corona tile in space units (core's coronaTilePoint, in floats). */
export function coronaTileCenter(info: CoronaInit, tile: number): { x: number; y: number } {
  const ring = Math.floor(tile / info.sectors);
  const sector = tile % info.sectors;
  const r = CORONA_INNER + ((ring + 0.5) * (CORONA_OUTER - CORONA_INNER)) / info.rings;
  const a = ((sector + 0.5) / info.sectors) * TURN;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** Band of a ring: 0 inner, 1 middle, 2 outer. */
export function coronaBand(info: CoronaInit, tile: number): number {
  const ring = Math.floor(tile / info.sectors);
  if (ring < info.innerRings) return 0;
  return ring < info.innerRings + info.middleRings ? 1 : 2;
}

/**
 * The Corona's polar territory drawn as a ring around the Sun. The polar
 * grid is rendered into a square texture through a lookup made once (pixel →
 * tile, and tile → its pixels), so a changed tile only repaints its own
 * pixels, like the flat maps' TerritoryLayer.
 */
export class CoronaLayer {
  readonly sprite: Sprite;
  private readonly pixels: Uint8Array;
  private readonly source: BufferImageSource;
  /** Pixels of tile t are pixelList[pixelStart[t] .. pixelStart[t + 1]). */
  private readonly pixelStart: Int32Array;
  private readonly pixelList: Int32Array;
  /** Pixels changed since the last upload to the GPU. */
  private stale = false;

  constructor(
    private readonly info: CoronaInit,
    private readonly owners: Uint16Array,
    private readonly colorOf: (owner: number) => number,
    /** Texture side in pixels (it spans the Corona's outer diameter); lower on low quality. */
    texturePx: number,
  ) {
    const n = texturePx;
    const size = info.rings * info.sectors;
    const units = (2 * CORONA_OUTER) / n;
    const tileOf = new Int32Array(n * n);
    const counts = new Int32Array(size + 1);
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const tile = coronaTileAt(
          info,
          (px + 0.5) * units - CORONA_OUTER,
          (py + 0.5) * units - CORONA_OUTER,
        );
        tileOf[py * n + px] = tile;
        if (tile >= 0) counts[tile + 1]! += 1;
      }
    }
    for (let t = 0; t < size; t++) counts[t + 1]! += counts[t]!;
    this.pixelStart = counts;
    this.pixelList = new Int32Array(counts[size]!);
    const fill = counts.slice(0, size);
    for (let p = 0; p < tileOf.length; p++) {
      const tile = tileOf[p]!;
      if (tile >= 0) this.pixelList[fill[tile]!++] = p;
    }

    this.pixels = new Uint8Array(n * n * 4);
    this.source = new BufferImageSource({
      resource: this.pixels,
      width: n,
      height: n,
      scaleMode: "linear",
    });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    this.sprite.position.set(-CORONA_OUTER, -CORONA_OUTER);
    this.sprite.scale.set(units);
    this.sprite.alpha = 0.85;
    for (let tile = 0; tile < size; tile++) this.paint(tile);
    this.source.update();
  }

  /**
   * Redraws the given tiles and their neighbors (whose borders may have
   * changed) in memory; `flush()` uploads the texture, only while it's seen.
   */
  redraw(tiles: readonly number[]): void {
    const s = this.info.sectors;
    for (const tile of tiles) {
      const sector = tile % s;
      const base = tile - sector;
      this.paint(tile);
      this.paint(base + ((sector + s - 1) % s));
      this.paint(base + ((sector + 1) % s));
      if (tile >= s) this.paint(tile - s);
      if (tile + s < this.owners.length) this.paint(tile + s);
    }
    this.stale = true;
  }

  /** Uploads the texture if any pixels changed since the last upload. */
  flush(): void {
    if (!this.stale) return;
    this.stale = false;
    this.source.update();
  }

  destroy(): void {
    this.sprite.destroy({ texture: true, textureSource: true });
  }

  private paint(tile: number): void {
    const owner = this.owners[tile]!;
    let color = BAND_COLORS[coronaBand(this.info, tile)]!;
    if (owner !== 0) {
      const ownerColor = this.colorOf(owner);
      color = this.isBorder(tile, owner)
        ? mix(ownerColor, 0x000000, BORDER_DARKEN)
        : mix(color, ownerColor, TINT);
    }
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    for (let i = this.pixelStart[tile]!; i < this.pixelStart[tile + 1]!; i++) {
      const p = this.pixelList[i]! * 4;
      this.pixels[p] = r;
      this.pixels[p + 1] = g;
      this.pixels[p + 2] = b;
      this.pixels[p + 3] = 0xff;
    }
  }

  private isBorder(tile: number, owner: number): boolean {
    const s = this.info.sectors;
    const sector = tile % s;
    const base = tile - sector;
    const o = this.owners;
    return (
      o[base + ((sector + s - 1) % s)] !== owner ||
      o[base + ((sector + 1) % s)] !== owner ||
      (tile >= s && o[tile - s] !== owner) ||
      (tile + s < o.length && o[tile + s] !== owner)
    );
  }
}
