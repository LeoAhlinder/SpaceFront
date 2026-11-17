import { BufferImageSource, Sprite, Texture } from "pixi.js";
import type { GridInit } from "../../shared/messages";
import { mix, TERRAIN_COLORS } from "./colors";

const SPACE = 0;
/** How strongly an owner's color tints its land (0–1). */
const TINT = 0.6;
/** How much darker border tiles are than the owner color. */
const BORDER_DARKEN = 0.3;

/**
 * One body's surface as a texture: one pixel per tile, colored by terrain and
 * owner, with darker pixels along territory borders. Only tiles whose owner
 * changed (and their neighbors, whose border state may have changed) are redrawn.
 */
export class TerritoryLayer {
  readonly sprite: Sprite;
  readonly side: number;
  private readonly pixels: Uint8Array;
  private readonly source: BufferImageSource;

  constructor(
    private readonly grid: GridInit,
    private readonly owners: Uint16Array,
    private readonly colorOf: (owner: number) => number,
  ) {
    this.side = grid.radius * 2;
    this.pixels = new Uint8Array(this.side * this.side * 4);
    this.source = new BufferImageSource({
      resource: this.pixels,
      width: this.side,
      height: this.side,
      scaleMode: "nearest",
    });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    // Center the disc on the origin; one world unit = one tile.
    this.sprite.position.set(-this.side / 2, -this.side / 2);
    for (let tile = 0; tile < this.owners.length; tile++) this.paint(tile);
    this.source.update();
  }

  /** Redraws the given tiles and their neighbors, then re-uploads the texture. */
  redraw(tiles: readonly number[]): void {
    const side = this.side;
    for (const tile of tiles) {
      this.paint(tile);
      const x = tile % side;
      if (tile >= side) this.paint(tile - side);
      if (tile + side < this.owners.length) this.paint(tile + side);
      if (x > 0) this.paint(tile - 1);
      if (x < side - 1) this.paint(tile + 1);
    }
    this.source.update();
  }

  /** Tile under a world-space point, or -1 if outside the body. */
  tileAt(worldX: number, worldY: number): number {
    const x = Math.floor(worldX + this.side / 2);
    const y = Math.floor(worldY + this.side / 2);
    if (x < 0 || y < 0 || x >= this.side || y >= this.side) return -1;
    const tile = y * this.side + x;
    return this.grid.terrain[tile] === SPACE ? -1 : tile;
  }

  destroy(): void {
    this.sprite.destroy({ texture: true, textureSource: true });
  }

  private paint(tile: number): void {
    const terrain = this.grid.terrain[tile]! as keyof typeof TERRAIN_COLORS;
    const p = tile * 4;
    if (terrain === SPACE) {
      this.pixels[p + 3] = 0;
      return;
    }
    const owner = this.owners[tile]!;
    let color = TERRAIN_COLORS[terrain];
    if (owner !== 0) {
      const ownerColor = this.colorOf(owner);
      color = this.isBorder(tile, owner)
        ? mix(ownerColor, 0x000000, BORDER_DARKEN)
        : mix(color, ownerColor, TINT);
    }
    this.pixels[p] = (color >> 16) & 0xff;
    this.pixels[p + 1] = (color >> 8) & 0xff;
    this.pixels[p + 2] = color & 0xff;
    this.pixels[p + 3] = 0xff;
  }

  /** True if any edge neighbor on the body has a different owner. */
  private isBorder(tile: number, owner: number): boolean {
    const side = this.side;
    const x = tile % side;
    const differs = (t: number) => this.grid.terrain[t] !== SPACE && this.owners[t] !== owner;
    return (
      (tile >= side && differs(tile - side)) ||
      (tile + side < this.owners.length && differs(tile + side)) ||
      (x > 0 && differs(tile - 1)) ||
      (x < side - 1 && differs(tile + 1))
    );
  }
}
