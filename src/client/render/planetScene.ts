import { Container, Graphics } from "pixi.js";
import type { StructureView } from "../../core";
import type { MatchInit } from "../../shared/messages";
import { BALANCE } from "../../data/balance";
import { view } from "../store/clientStore";
import type { Atlas } from "./atlas";
import type { SpriteName } from "./atlasFrames";
import { Camera } from "./camera";
import { terrainPalette } from "./colors";
import { SpriteLayer } from "./spriteLayer";
import { TerritoryLayer } from "./territoryLayer";

/** Structures are drawn this many tiles wide (their sprite frame, with a little margin). */
const STRUCTURE_TILES = 6.5;
/** …but never smaller than this many screen pixels, so they stay visible zoomed out. */
const MIN_STRUCTURE_PX = 12;
const SHIP_PX = 16;
/** Zooming out below this share of the "fit" zoom leaves for the system view. */
const EXIT_ZOOM_SHARE = 0.55;

const STRUCTURE_SPRITES: Record<string, SpriteName> = {
  spaceport: "spaceport",
  habitat: "habitat",
  shieldGenerator: "shieldGenerator",
  orbitalDefense: "orbitalDefense",
  launchSilo: "launchSilo",
  sunBase: "sunBase",
  solarSiphon: "solarSiphon",
};

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
  /** Areas (shields, fallout, impact zones) under the sprites. */
  private readonly under = new Graphics();
  private readonly sprites: SpriteLayer;
  /** Glows and flashes, added on top. */
  private readonly fx: SpriteLayer;
  private active = -1;
  private fitZoom = 1;
  /** Structures per grid, rebuilt only when structures change (thousands late in a match). */
  private structuresByGrid: StructureView[][] = [];
  private structuresVersion = -1;

  constructor(atlas: Atlas) {
    this.camera = new Camera(this.world);
    this.container.addChild(this.world);
    this.sprites = new SpriteLayer(atlas);
    this.fx = new SpriteLayer(atlas);
    this.fx.container.blendMode = "add";
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
    this.world.addChild(this.under, this.sprites.container, this.fx.container);
    this.active = -1;
  }

  /** Shows a world's map, framed to fit the screen. */
  show(grid: number, screenW: number, screenH: number): void {
    this.layers.forEach((layer, i) => (layer.sprite.visible = i === grid));
    this.active = grid;
    const layer = this.layers[grid];
    layer?.flush();
    if (layer) {
      this.camera.fit(layer.width, layer.height, screenW, screenH);
      this.fitZoom = this.camera.zoom;
    }
  }

  /** True once the player has zoomed far enough out to leave this map. */
  get zoomedOut(): boolean {
    return this.camera.zoom < this.fitZoom * EXIT_ZOOM_SHARE;
  }

  private screenW = 0;
  private screenH = 0;

  /** The screen size, for culling sprites outside it. */
  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
  }

  /** Updates changed tiles on every map and redraws structures and ships at tick `t`. */
  draw(t: number, visible: boolean): void {
    this.layers.forEach((layer, i) => {
      const dirty = view.dirty[i];
      if (dirty && dirty.length > 0) {
        layer.redraw(dirty);
        dirty.length = 0;
      }
    });
    if (!visible) return;
    const layer = this.layers[this.active];
    // Only the map on screen goes to the GPU; the others upload when shown.
    layer?.flush();
    const g = this.under.clear();
    const sp = this.sprites;
    const fx = this.fx;
    sp.begin();
    fx.begin();
    if (layer) this.drawMap(layer, g, sp, fx, t);
    sp.end();
    fx.end();
  }

  private drawMap(
    layer: TerritoryLayer,
    g: Graphics,
    sp: SpriteLayer,
    fx: SpriteLayer,
    t: number,
  ): void {
    const w = layer.width;
    const h = layer.height;
    const toX = (tile: number) => (tile % w) + 0.5 - w / 2;
    const toY = (tile: number) => Math.floor(tile / w) + 0.5 - h / 2;
    const px = 1 / this.camera.zoom;
    const size = Math.max(STRUCTURE_TILES, MIN_STRUCTURE_PX * px);
    // The part of the map on screen (plus a margin): sprites outside it are skipped.
    const a = this.camera.screenToWorld(-size / px, -size / px);
    const b = this.camera.screenToWorld(this.screenW + size / px, this.screenH + size / px);
    const onScreen = (x: number, y: number) => x >= a.x && x <= b.x && y >= a.y && y <= b.y;

    if (this.structuresVersion !== view.structuresVersion) {
      this.structuresVersion = view.structuresVersion;
      this.structuresByGrid = this.layers.map(() => []);
      for (const st of view.structures.values()) this.structuresByGrid[st.grid]?.push(st);
    }
    for (const s of this.structuresByGrid[this.active] ?? []) {
      const x = toX(s.tile);
      const y = toY(s.tile);
      if (!onScreen(x, y)) continue;
      const color = view.factions.get(s.owner)?.color ?? 0xffffff;
      const building = s.buildTicksLeft > 0;
      sp.add(STRUCTURE_SPRITES[s.kind] ?? "habitat", x, y, size, color, building ? 0.5 : 1);
      if (building) continue;
      if (s.kind === "shieldGenerator") {
        diamond(g, x, y, BALANCE.shield.radius + 0.5);
        g.fill({ color: 0x8fd8ff, alpha: 0.05 }).stroke({ width: px, color: 0x8fd8ff, alpha: 0.5 });
        sp.add("shieldGlow", x, y, size);
      } else if (s.kind === "launchSilo" && s.readyTick <= t) {
        sp.add("siloGlow", x, y, size, 0xffffff, 0.75 + 0.25 * Math.sin(t * 0.8));
      }
    }

    // Irradiated land, faded by how long it has left.
    for (const f of view.fallout) {
      if (f.grid !== this.active) continue;
      const left = Math.min(1, (f.untilTick - t) / BALANCE.weapons.antimatterWarhead.falloutTicks);
      diamond(g, toX(f.tile), toY(f.tile), f.radius + 0.5);
      g.fill({ color: 0x9cff3c, alpha: 0.1 + 0.2 * left }).stroke({
        width: px,
        color: 0x9cff3c,
        alpha: 0.6 * left,
      });
    }

    // Weapon impacts: a flash that grows to the blast radius, a shock ring and a fading glow.
    for (const e of view.effects) {
      const effect = e.effect;
      if (effect.kind !== "impact" || effect.grid !== this.active) continue;
      const age = (t - e.tick) / Math.max(1, e.untilTick - e.tick);
      if (age < 0 || age > 1) continue;
      const x = toX(effect.tile);
      const y = toY(effect.tile);
      const r = effect.radius + 0.5;
      diamond(g, x, y, r * Math.min(1, age * 3) + 1);
      g.fill({ color: 0xfff1c0, alpha: 0.6 * (1 - age) });
      const big = effect.weapon === "antimatterWarhead";
      fx.add("glow", x, y, r * 4 * (0.6 + age), big ? 0xff60e0 : 0xffa040, 1 - age);
      fx.add("ring", x, y, r * 2.4 * Math.min(1, age * 2) + 2, 0xfff1c0, 1 - age);
      if (age < 0.3) fx.add("spark", x, y, r * 2, 0xffffff, 1 - age / 0.3, age * 2);
    }

    // Landers hopping across this map, landers arriving from space, incoming weapons.
    for (const ship of view.ships.values()) {
      if (ship.toGrid !== this.active) continue;
      const color = view.factions.get(ship.owner)?.color ?? 0xffffff;
      const tx = toX(ship.toTile);
      const ty = toY(ship.toTile);
      const isWeapon = ship.kind === "kineticStrike" || ship.kind === "antimatterWarhead";
      if (isWeapon) {
        // The area it will hit, pulsing, with a target marker.
        const radius = BALANCE.weapons[ship.kind].radius + 0.5;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
        diamond(g, tx, ty, radius);
        g.fill({ color: 0xff3c3c, alpha: 0.08 + 0.1 * pulse }).stroke({
          width: 1.5 * px,
          color: 0xff3c3c,
          alpha: 0.6 + 0.4 * pulse,
        });
        sp.add("reticle", tx, ty, Math.max(radius * 1.2, 20 * px), 0xff3c3c, 0.6 + 0.4 * pulse);
      }
      if (ship.fromGrid === this.active) {
        const fx0 = toX(ship.fromTile);
        const fy0 = toY(ship.fromTile);
        const f = Math.min(
          1,
          Math.max(0, (t - ship.launchTick) / (ship.arriveTick - ship.launchTick)),
        );
        const x = fx0 + (tx - fx0) * f;
        const y = fy0 + (ty - fy0) * f;
        const heading = Math.atan2(ty - fy0, tx - fx0) + Math.PI / 2;
        const shipSize = SHIP_PX * px * (ship.kind === "freighter" ? 0.8 : 1);
        if (isWeapon) {
          g.moveTo(
            fx0 + (tx - fx0) * Math.max(0, f - 0.15),
            fy0 + (ty - fy0) * Math.max(0, f - 0.15),
          )
            .lineTo(x, y)
            .stroke({ width: 2 * px, color: 0xff5a3c, alpha: 0.7 });
        } else if (ship.kind !== "freighter") {
          g.moveTo(x, y).lineTo(tx, ty).stroke({ width: px, color, alpha: 0.5 });
        }
        drawFlame(fx, x, y, shipSize, heading);
        sp.add(ship.kind, x, y, shipSize, isWeapon ? 0xffffff : color, 1, heading);
      } else if (ship.kind === "troopLander") {
        // Incoming from another world: mark the landing spot.
        sp.add("landing", tx, ty, Math.max(4, 22 * px), color, 0.9, t * 0.05);
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

/** An engine flame behind a ship pointing along `heading` (0 = up). */
export function drawFlame(
  fx: SpriteLayer,
  x: number,
  y: number,
  size: number,
  heading: number,
): void {
  const back = size * 0.55;
  fx.add(
    "flame",
    x - Math.sin(heading) * back,
    y + Math.cos(heading) * back,
    size * 0.7,
    0xffffff,
    0.8,
    heading, // the flame's tip points down in the atlas, behind an up-pointing ship
  );
}

/** Starts a diamond path (a Manhattan circle, the shape of a radius on a map) of half-size r. */
function diamond(g: Graphics, x: number, y: number, r: number): Graphics {
  return g.poly([x, y - r, x + r, y, x, y + r, x - r, y]);
}
