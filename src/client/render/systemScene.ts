import { Container, Graphics, Text } from "pixi.js";
import { SOLAR_SYSTEM } from "../../data/bodies";
import type { MatchInit } from "../../shared/messages";
import { BALANCE } from "../../data/balance";
import type { Quality } from "../settings";
import { mainOwner, ui, view } from "../store/clientStore";
import type { Atlas } from "./atlas";
import type { SpriteName } from "./atlasFrames";
import { ATLAS_FRAMES } from "./atlasFrames";
import { Camera } from "./camera";
import { mix } from "./colors";
import { CoronaLayer, coronaTileAt, coronaTileCenter } from "./coronaLayer";
import { alongPath, bodyPos } from "./orbits";
import { drawFlame } from "./planetScene";
import { SpriteLayer } from "./spriteLayer";

/** Space units the system view frames when opened (Neptune's orbit plus margin). */
const SYSTEM_EXTENT = 20_000;
/** Icons never shrink below this many screen pixels, so small moons stay clickable. */
const MIN_ICON_PX = 5;
const LABEL_STYLE = { fill: 0xc8d2f0, fontSize: 12, fontFamily: "system-ui, sans-serif" };
/** Corona structures are drawn this many space units wide (a ring is about 15). */
const CORONA_STRUCTURE_SIZE = 14;
/** A click this many screen pixels from one of your Warships selects it. */
const WARSHIP_PICK_PX = 12;
const WEAPON_COLOR = 0xff5a3c;

/**
 * The solar-system view: the Sun, the Corona's territory around it, orbits,
 * every body as an icon (tinted toward the faction owning most of it) and
 * ships in flight. Sprites come from the atlas and are pooled; orbits,
 * routes and beams are lines redrawn every frame; the Corona's territory is
 * a texture updated per changed tile.
 */
export class SystemScene {
  readonly container = new Container();
  readonly camera: Camera;
  private readonly world = new Container();
  /** Orbits, routes and beams, under the sprites. */
  private readonly gfx = new Graphics();
  private readonly sprites: SpriteLayer;
  private readonly fx: SpriteLayer;
  /** Selection rings and health bars, over the sprites. */
  private readonly top = new Graphics();
  private readonly labels = new Map<string, Text>();
  /** The last heading of each Warship, so a stopped one keeps facing the same way. */
  private readonly headings = new Map<number, number>();
  private corona: CoronaLayer | null = null;

  constructor(
    atlas: Atlas,
    private readonly quality: Quality,
  ) {
    // From the whole system down to the Corona's tiles.
    this.camera = new Camera(this.world, 0.01, 6);
    this.sprites = new SpriteLayer(atlas);
    this.fx = new SpriteLayer(atlas);
    this.fx.container.blendMode = "add";
    this.world.addChild(this.gfx, this.fx.container, this.sprites.container, this.top);
    for (const body of SOLAR_SYSTEM) {
      const label = new Text({ text: body.name, style: LABEL_STYLE });
      label.anchor.set(0.5, 0);
      this.labels.set(body.id, label);
      this.world.addChild(label);
    }
    this.container.addChild(this.world);
  }

  fit(screenW: number, screenH: number): void {
    this.camera.fit(SYSTEM_EXTENT, SYSTEM_EXTENT, screenW, screenH, 1);
  }

  /** Builds the Corona's territory layer for a new match (below everything else). */
  setMatch(init: MatchInit): void {
    this.corona?.destroy();
    this.corona = null;
    this.headings.clear();
    if (!init.corona) return;
    this.corona = new CoronaLayer(
      init.corona,
      view.owners[init.corona.id]!,
      (owner) => view.factions.get(owner)?.color ?? 0,
    );
    this.world.addChildAt(this.corona.sprite, 0);
  }

  /** Applies Corona tile changes. Runs every frame, even while another view is shown. */
  updateCorona(): void {
    const dirty = view.dirty[view.coronaGrid];
    if (!this.corona || !dirty || dirty.length === 0) return;
    this.corona.redraw(dirty);
    dirty.length = 0;
  }

  /** Draws everything at fractional tick `t`. */
  draw(t: number): void {
    const g = this.gfx.clear();
    const top = this.top.clear();
    const sp = this.sprites;
    const fx = this.fx;
    sp.begin();
    fx.begin();
    const zoom = this.camera.zoom;
    const px = 1 / zoom; // one screen pixel in world units

    // Orbits.
    for (const body of SOLAR_SYSTEM) {
      if (body.orbitTicks === 0) continue;
      const center = body.parent ? bodyPos(body.parent, t) : { x: 0, y: 0 };
      g.circle(center.x, center.y, body.orbitRadius).stroke({
        width: px,
        color: 0x4a5680,
        alpha: body.parent ? 0.35 : 0.5,
      });
    }

    // The Sun, its glow and heat zone.
    const sun = SOLAR_SYSTEM[0]!;
    g.circle(0, 0, sun.avoidRadius).fill({ color: 0xff9a30, alpha: 0.06 });
    fx.add("glow", 0, 0, sun.avoidRadius * 2.4, 0xff9a30, 0.35 + 0.05 * Math.sin(t * 0.05));
    planetSprite(sp, "sun", 0, 0, sun.radius);

    // Bodies: their icon, tinted toward the owner of most of their land, and a ring in its color.
    const gridOf = new Map(view.init?.grids.map((gr) => [gr.bodyId, gr.id]) ?? []);
    for (const body of SOLAR_SYSTEM) {
      if (body.kind === "star") continue;
      const p = bodyPos(body.id, t);
      const r = Math.max(body.radius, MIN_ICON_PX * px);
      const grid = gridOf.get(body.id);
      const owned = grid === undefined ? null : mainOwner(grid);
      let tint = 0xffffff;
      if (owned) {
        const ownerColor = view.factions.get(owned.owner)?.color ?? 0xffffff;
        g.circle(p.x, p.y, r + 3 * px).stroke({ width: 2.5 * px, color: ownerColor });
        tint = mix(0xffffff, ownerColor, Math.min(0.5, owned.share));
      }
      if (body.kind === "gasGiant") {
        g.circle(p.x, p.y, body.avoidRadius).fill({ color: 0xffffff, alpha: 0.03 });
      }
      if (body.id in ATLAS_FRAMES) planetSprite(sp, body.id as SpriteName, p.x, p.y, r, tint);
      const label = this.labels.get(body.id)!;
      label.position.set(p.x, p.y + r + 4 * px);
      label.scale.set(px);
      // Hide moon names when zoomed far out, so planets stay readable.
      label.visible = !body.parent || zoom > 0.25;
    }
    const sunLabel = this.labels.get("sun")!;
    sunLabel.position.set(0, sun.radius + 4 * px);
    sunLabel.scale.set(px);

    this.drawCoronaStructures(sp, px, t);
    this.drawWarships(g, top, sp, fx, px, t);

    // Ships between worlds, pointing where they fly.
    for (const ship of view.ships.values()) {
      if (ship.waypoints.length === 0) continue;
      const f = (t - ship.launchTick) / Math.max(1, ship.arriveTick - ship.launchTick);
      const p = alongPath(ship.waypoints, f);
      const back = alongPath(ship.waypoints, Math.max(0, f - 0.02));
      const heading =
        p.x === back.x && p.y === back.y ? 0 : Math.atan2(p.y - back.y, p.x - back.x) + Math.PI / 2;
      const color = view.factions.get(ship.owner)?.color ?? 0xffffff;
      if (ship.kind === "kineticStrike" || ship.kind === "antimatterWarhead") {
        // A weapon: a hot streak with a fading trail behind it.
        const big = ship.kind === "antimatterWarhead";
        const tail = alongPath(ship.waypoints, Math.max(0, f - 0.12));
        g.moveTo(tail.x, tail.y)
          .lineTo(p.x, p.y)
          .stroke({ width: (big ? 3 : 2) * px, color: WEAPON_COLOR, alpha: 0.55 });
        const size = (big ? 20 : 15) * px;
        fx.add("glow", p.x, p.y, size * 1.6, big ? 0xff60e0 : WEAPON_COLOR, 0.7);
        drawFlame(fx, p.x, p.y, size, heading);
        sp.add(ship.kind, p.x, p.y, size, 0xffffff, 1, heading);
        continue;
      }
      if (ship.owner === view.init?.playerId && ship.kind !== "freighter") {
        // Show the player's own lander and Sun Base ship routes.
        const end = ship.waypoints.length - 2;
        g.moveTo(p.x, p.y)
          .lineTo(ship.waypoints[end]!, ship.waypoints[end + 1]!)
          .stroke({ width: px, color, alpha: 0.35 });
      }
      const size = (ship.kind === "freighter" ? 11 : ship.kind === "sunBaseShip" ? 20 : 16) * px;
      if (ship.kind !== "freighter" || this.quality === "high") {
        drawFlame(fx, p.x, p.y, size, heading);
      }
      sp.add(ship.kind, p.x, p.y, size, color, ship.kind === "freighter" ? 0.85 : 1, heading);
    }
    sp.end();
    fx.end();
  }

  /** Warships (pointing where they move), the selected one's patrol area, and combat effects. */
  private drawWarships(
    g: Graphics,
    top: Graphics,
    sp: SpriteLayer,
    fx: SpriteLayer,
    px: number,
    t: number,
  ): void {
    const frac = Math.min(1, Math.max(0, t - ui.tick.value));
    const me = view.init?.playerId;
    const selected = ui.selectedWarship.value;
    for (const w of view.warships.values()) {
      const x = w.prevX + (w.x - w.prevX) * frac;
      const y = w.prevY + (w.y - w.prevY) * frac;
      const color = view.factions.get(w.owner)?.color ?? 0xffffff;
      const dx = w.x - w.prevX;
      const dy = w.y - w.prevY;
      const moving = dx !== 0 || dy !== 0;
      const heading = moving ? Math.atan2(dy, dx) + Math.PI / 2 : (this.headings.get(w.id) ?? 0);
      this.headings.set(w.id, heading);
      const size = 22 * px;
      if (moving) drawFlame(fx, x, y, size * 0.8, heading);
      sp.add("warship", x, y, size, color, 1, heading);
      if (w.owner === me) {
        top.circle(x, y, size * 0.62).stroke({ width: px, color: 0xffffff, alpha: 0.5 });
      }
      if (w.hp < BALANCE.hp.warship) {
        const share = Math.max(0, w.hp / BALANCE.hp.warship);
        const r = size / 2;
        top.rect(x - r, y + r * 1.1, 2 * r, 2.5 * px).fill({ color: 0x000000, alpha: 0.6 });
        top.rect(x - r, y + r * 1.1, 2 * r * share, 2.5 * px).fill(0x6be37a);
      }
      if (w.id === selected) {
        top.circle(x, y, size).stroke({ width: 1.5 * px, color: 0xffffff });
        g.circle(x, y, BALANCE.warship.detectRange).stroke({ width: px, color, alpha: 0.4 });
      }
    }
    if (this.headings.size > view.warships.size * 2 + 16) {
      for (const id of this.headings.keys()) if (!view.warships.has(id)) this.headings.delete(id);
    }
    for (const e of view.effects) {
      const age = (t - e.tick) / Math.max(1, e.untilTick - e.tick);
      if (age < 0 || age > 1) continue;
      const effect = e.effect;
      if (effect.kind === "beam") {
        const color = mix(view.factions.get(effect.owner)?.color ?? 0xffffff, 0xffffff, 0.5);
        g.moveTo(effect.fromX, effect.fromY)
          .lineTo(effect.toX, effect.toY)
          .stroke({ width: 2 * px, color, alpha: 1 - age });
        fx.add("glow", effect.toX, effect.toY, 10 * px, color, 1 - age);
      } else if (effect.kind === "blast") {
        const s = (14 + 30 * effect.size * age) * px;
        fx.add("glow", effect.x, effect.y, s * 1.6, 0xffa040, 1 - age);
        fx.add("ring", effect.x, effect.y, s, 0xfff1c0, 0.8 * (1 - age));
        if (age < 0.4 && this.quality === "high") {
          fx.add("spark", effect.x, effect.y, s * 0.9, 0xffffff, 1 - age / 0.4, age * 3);
        }
      }
    }
  }

  /** The id of one of the player's Warships under a screen point, or null. */
  ownWarshipAt(screenX: number, screenY: number): number | null {
    const p = this.camera.screenToWorld(screenX, screenY);
    const reach = WARSHIP_PICK_PX / this.camera.zoom;
    let best: number | null = null;
    let bestD = reach;
    for (const w of view.warships.values()) {
      if (w.owner !== view.init?.playerId) continue;
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      if (d <= bestD) {
        best = w.id;
        bestD = d;
      }
    }
    return best;
  }

  /** Sun Bases and Solar Siphons, drawn on their Corona tiles. */
  private drawCoronaStructures(sp: SpriteLayer, px: number, t: number): void {
    const info = view.init?.corona;
    if (!info) return;
    const size = Math.max(CORONA_STRUCTURE_SIZE, 12 * px);
    for (const s of view.structures.values()) {
      if (s.grid !== info.id) continue;
      const p = coronaTileCenter(info, s.tile);
      const color = view.factions.get(s.owner)?.color ?? 0x888888;
      const alpha = s.buildTicksLeft > 0 ? 0.5 : 1;
      if (s.kind === "sunBase") {
        sp.add("sunBase", p.x, p.y, size * 1.2, color, alpha, t * 0.01);
        sp.add("sunBaseGlow", p.x, p.y, size * 1.2);
      } else {
        // The dish faces the Sun.
        const facing = Math.atan2(-p.y, -p.x) + Math.PI / 2;
        sp.add("solarSiphon", p.x, p.y, size, color, alpha, facing);
      }
    }
  }

  /** The Corona tile under a screen point, as a hit (or null). */
  coronaTileAt(screenX: number, screenY: number): { grid: number; tile: number } | null {
    const info = view.init?.corona;
    if (!info) return null;
    const p = this.camera.screenToWorld(screenX, screenY);
    const tile = coronaTileAt(info, p.x, p.y);
    return tile < 0 ? null : { grid: info.id, tile };
  }

  /** The landable body under a screen point, as a grid id (or null). */
  gridAt(screenX: number, screenY: number, t: number): number | null {
    const p = this.camera.screenToWorld(screenX, screenY);
    const px = 1 / this.camera.zoom;
    let best: { grid: number; d: number } | null = null;
    for (const grid of view.init?.grids ?? []) {
      const body = SOLAR_SYSTEM.find((b) => b.id === grid.bodyId);
      if (!body) continue;
      const c = bodyPos(body.id, t);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const reach = Math.max(body.radius, MIN_ICON_PX * px) + 8 * px;
      if (d <= reach && (!best || d < best.d)) best = { grid: grid.id, d };
    }
    return best?.grid ?? null;
  }
}

/** A planet icon whose disc has radius `r` in world units. */
function planetSprite(
  sp: SpriteLayer,
  name: SpriteName,
  x: number,
  y: number,
  r: number,
  tint = 0xffffff,
): void {
  const frame: { size: number; radius?: number } = ATLAS_FRAMES[name];
  sp.add(name, x, y, (r * frame.size) / (frame.radius ?? frame.size / 2), tint);
}
