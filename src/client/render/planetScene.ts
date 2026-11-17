import { Container, Graphics } from "pixi.js";
import type { MatchInit } from "../../shared/messages";
import { view } from "../store/clientStore";
import { Camera } from "./camera";
import { terrainPalette } from "./colors";
import { TerritoryLayer } from "./territoryLayer";

/** Spaceports are drawn this many tiles wide. */
const PORT_SIZE = 5;
/** Zooming out below this share of the "fit" zoom leaves for the system view. */
const EXIT_ZOOM_SHARE = 0.55;

/**
 * One world's flat map: its territory, structures and ships hopping across
 * it. Every world's territory layer is kept up to date; only the open one
 * is visible.
 */
export class PlanetScene {
  readonly container = new Container();
  readonly camera: Camera;
  private readonly world = new Container();
  private layers: TerritoryLayer[] = [];
  private readonly overlay = new Graphics();
  private active = -1;
  private fitZoom = 1;

  constructor() {
    this.camera = new Camera(this.world);
    this.container.addChild(this.world);
  }

  setMatch(init: MatchInit): void {
    for (const layer of this.layers) layer.destroy();
    this.world.removeChildren();
    this.layers = init.grids.map(
      (grid, i) =>
        new TerritoryLayer(
          grid,
          view.owners[i]!,
          (owner) => view.factions.get(owner)?.color ?? 0,
          terrainPalette(grid.bodyId),
        ),
    );
    for (const layer of this.layers) {
      layer.sprite.visible = false;
      this.world.addChild(layer.sprite);
    }
    this.world.addChild(this.overlay);
    this.active = -1;
  }

  /** Shows a world's map, framed to fit the screen. */
  show(grid: number, screenW: number, screenH: number): void {
    this.layers.forEach((layer, i) => (layer.sprite.visible = i === grid));
    this.active = grid;
    const layer = this.layers[grid];
    if (layer) {
      this.camera.fit(layer.width, layer.height, screenW, screenH);
      this.fitZoom = this.camera.zoom;
    }
  }

  /** True once the player has zoomed far enough out to leave this map. */
  get zoomedOut(): boolean {
    return this.camera.zoom < this.fitZoom * EXIT_ZOOM_SHARE;
  }

  /** Updates changed tiles on every map and redraws structures and ships at tick `t`. */
  draw(t: number): void {
    this.layers.forEach((layer, i) => {
      const dirty = view.dirty[i];
      if (dirty && dirty.length > 0) {
        layer.redraw(dirty);
        dirty.length = 0;
      }
    });
    const layer = this.layers[this.active];
    const g = this.overlay.clear();
    if (!layer) return;
    const toWorld = (tile: number) => ({
      x: (tile % layer.width) + 0.5 - layer.width / 2,
      y: Math.floor(tile / layer.width) + 0.5 - layer.height / 2,
    });
    const px = 1 / this.camera.zoom;

    for (const s of view.structures.values()) {
      if (s.grid !== this.active) continue;
      const p = toWorld(s.tile);
      const color = view.factions.get(s.owner)?.color ?? 0xffffff;
      const alpha = s.buildTicksLeft > 0 ? 0.45 : 1;
      const outline = { width: Math.max(0.3, 1.5 * px), color: 0xffffff };
      if (s.kind === "spaceport") {
        // A square with a dot: the launch pad.
        const half = PORT_SIZE / 2;
        g.rect(p.x - half, p.y - half, PORT_SIZE, PORT_SIZE)
          .fill({ color, alpha })
          .stroke(outline);
        g.circle(p.x, p.y, PORT_SIZE / 5).fill(0xffffff);
      } else {
        // A dome: the Habitat.
        g.circle(p.x, p.y, PORT_SIZE / 2.2)
          .fill({ color, alpha })
          .stroke(outline);
        g.rect(p.x - PORT_SIZE / 4, p.y, PORT_SIZE / 2, PORT_SIZE / 10).fill(0xffffff);
      }
    }

    // Landers hopping across this map, and landers arriving from space.
    for (const ship of view.ships.values()) {
      if (ship.toGrid !== this.active) continue;
      const color = view.factions.get(ship.owner)?.color ?? 0xffffff;
      const target = toWorld(ship.toTile);
      if (ship.fromGrid === this.active) {
        const from = toWorld(ship.fromTile);
        const f = Math.min(
          1,
          Math.max(0, (t - ship.launchTick) / (ship.arriveTick - ship.launchTick)),
        );
        const x = from.x + (target.x - from.x) * f;
        const y = from.y + (target.y - from.y) * f;
        if (ship.kind === "freighter") {
          // Freighters: small squares, no route line.
          const r = Math.max(0.8, 3 * px);
          g.rect(x - r, y - r, 2 * r, 2 * r).fill({ color, alpha: 0.8 });
          continue;
        }
        g.moveTo(x, y).lineTo(target.x, target.y).stroke({ width: px, color, alpha: 0.5 });
        g.circle(x, y, Math.max(1.2, 4 * px))
          .fill(color)
          .stroke({ width: px, color: 0x000000 });
      } else if (ship.kind === "troopLander") {
        // Incoming from another world: mark the landing spot.
        g.circle(target.x, target.y, Math.max(2, 7 * px)).stroke({ width: 1.5 * px, color });
      }
    }
  }

  /** The tile under a screen point on the open map, or null. */
  tileAt(screenX: number, screenY: number): { grid: number; tile: number } | null {
    const layer = this.layers[this.active];
    if (!layer) return null;
    const p = this.camera.screenToWorld(screenX, screenY);
    const tile = layer.tileAt(p.x, p.y);
    return tile < 0 ? null : { grid: this.active, tile };
  }
}
