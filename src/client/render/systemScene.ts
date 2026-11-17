import { Container, Graphics, Text } from "pixi.js";
import { SOLAR_SYSTEM } from "../../data/bodies";
import type { MatchInit } from "../../shared/messages";
import { BALANCE } from "../../data/balance";
import { mainOwner, ui, view } from "../store/clientStore";
import { Camera } from "./camera";
import { BODY_COLORS, mix } from "./colors";
import { CoronaLayer, coronaTileAt, coronaTileCenter } from "./coronaLayer";
import { alongPath, bodyPos } from "./orbits";

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
 * every body as an icon (tinted by the faction owning most of it) and ships
 * in flight. The shapes are redrawn every frame (a few dozen, plus Corona
 * structures); the Corona's territory is a texture updated per changed tile.
 */
export class SystemScene {
  readonly container = new Container();
  readonly camera: Camera;
  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private readonly labels = new Map<string, Text>();
  private corona: CoronaLayer | null = null;

  constructor() {
    // From the whole system down to the Corona's tiles.
    this.camera = new Camera(this.world, 0.01, 6);
    this.world.addChild(this.gfx);
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

    // The Sun and its heat zone.
    const sun = SOLAR_SYSTEM[0]!;
    g.circle(0, 0, sun.avoidRadius).fill({ color: 0xff9a30, alpha: 0.08 });
    g.circle(0, 0, sun.radius).fill(BODY_COLORS["sun"] ?? 0xffc94a);

    // Bodies.
    const gridOf = new Map(view.init?.grids.map((gr) => [gr.bodyId, gr.id]) ?? []);
    for (const body of SOLAR_SYSTEM) {
      if (body.kind === "star") continue;
      const p = bodyPos(body.id, t);
      const r = Math.max(body.radius, MIN_ICON_PX * px);
      let color = BODY_COLORS[body.id] ?? 0x999999;
      const grid = gridOf.get(body.id);
      const owned = grid === undefined ? null : mainOwner(grid);
      if (owned) {
        const ownerColor = view.factions.get(owned.owner)?.color ?? color;
        g.circle(p.x, p.y, r + 3 * px).stroke({ width: 2.5 * px, color: ownerColor });
        color = mix(color, ownerColor, Math.min(0.6, owned.share));
      }
      if (body.kind === "gasGiant") {
        g.circle(p.x, p.y, body.avoidRadius).fill({ color: 0xffffff, alpha: 0.03 });
      }
      g.circle(p.x, p.y, r).fill(color);
      const label = this.labels.get(body.id)!;
      label.position.set(p.x, p.y + r + 4 * px);
      label.scale.set(px);
      // Hide moon names when zoomed far out, so planets stay readable.
      label.visible = !body.parent || zoom > 0.25;
    }
    const sunLabel = this.labels.get("sun")!;
    sunLabel.position.set(0, sun.radius + 4 * px);
    sunLabel.scale.set(px);

    this.drawCoronaStructures(g, px);

    this.drawWarships(g, px, t);

    // Ships between worlds.
    for (const ship of view.ships.values()) {
      if (ship.waypoints.length === 0) continue;
      const f = (t - ship.launchTick) / Math.max(1, ship.arriveTick - ship.launchTick);
      const p = alongPath(ship.waypoints, f);
      const color = view.factions.get(ship.owner)?.color ?? 0xffffff;
      if (ship.kind === "kineticStrike" || ship.kind === "antimatterWarhead") {
        // A weapon: a hot streak with a fading trail behind it.
        const big = ship.kind === "antimatterWarhead";
        const back = alongPath(ship.waypoints, Math.max(0, f - 0.12));
        g.moveTo(back.x, back.y)
          .lineTo(p.x, p.y)
          .stroke({ width: (big ? 3 : 2) * px, color: WEAPON_COLOR, alpha: 0.55 });
        g.circle(p.x, p.y, (big ? 5 : 3) * px)
          .fill(0xfff1c0)
          .stroke({ width: px, color: WEAPON_COLOR });
        continue;
      }
      if (ship.owner === view.init?.playerId && ship.kind !== "freighter") {
        // Show the player's own lander and Sun Base ship routes.
        const end = ship.waypoints.length - 2;
        g.moveTo(p.x, p.y)
          .lineTo(ship.waypoints[end]!, ship.waypoints[end + 1]!)
          .stroke({ width: px, color, alpha: 0.35 });
      }
      if (ship.kind === "freighter") {
        // Freighters: small dim squares, so landers stand out.
        g.rect(p.x - 2 * px, p.y - 2 * px, 4 * px, 4 * px).fill({ color, alpha: 0.7 });
      } else if (ship.kind === "sunBaseShip") {
        // Sun Base ships: a diamond carrying the base.
        const r = 6 * px;
        g.poly([p.x, p.y - r, p.x + r, p.y, p.x, p.y + r, p.x - r, p.y])
          .fill(color)
          .stroke({ width: px, color: 0xffe08a });
      } else {
        g.circle(p.x, p.y, 4 * px)
          .fill(color)
          .stroke({ width: px, color: 0x000000 });
      }
    }
  }

  /** Warships (triangles heading where they move), the selected one's patrol area, and effects. */
  private drawWarships(g: Graphics, px: number, t: number): void {
    const frac = Math.min(1, Math.max(0, t - ui.tick.value));
    const me = view.init?.playerId;
    const selected = ui.selectedWarship.value;
    for (const w of view.warships.values()) {
      const x = w.prevX + (w.x - w.prevX) * frac;
      const y = w.prevY + (w.y - w.prevY) * frac;
      const color = view.factions.get(w.owner)?.color ?? 0xffffff;
      let dx = w.x - w.prevX;
      let dy = w.y - w.prevY;
      const len = Math.hypot(dx, dy) || 1;
      dx = len === 1 && dx === 0 ? 1 : dx / len;
      dy /= len;
      const r = 7 * px;
      g.poly([
        x + dx * r * 1.4,
        y + dy * r * 1.4,
        x - dx * r - dy * r * 0.8,
        y - dy * r + dx * r * 0.8,
        x - dx * r + dy * r * 0.8,
        y - dy * r - dx * r * 0.8,
      ])
        .fill(color)
        .stroke({ width: px, color: w.owner === me ? 0xffffff : 0x000000 });
      if (w.hp < BALANCE.hp.warship) {
        const share = Math.max(0, w.hp / BALANCE.hp.warship);
        g.rect(x - r, y + r * 1.3, 2 * r * share, 2 * px).fill(0x6be37a);
      }
      if (w.id === selected) {
        g.circle(x, y, r * 2).stroke({ width: 1.5 * px, color: 0xffffff });
        g.circle(x, y, BALANCE.warship.detectRange).stroke({ width: px, color, alpha: 0.4 });
      }
    }
    for (const e of view.effects) {
      const age = (t - e.tick) / Math.max(1, e.untilTick - e.tick);
      if (age < 0 || age > 1) continue;
      const fx = e.effect;
      if (fx.kind === "beam") {
        const color = view.factions.get(fx.owner)?.color ?? 0xffffff;
        g.moveTo(fx.fromX, fx.fromY)
          .lineTo(fx.toX, fx.toY)
          .stroke({ width: 2 * px, color: mix(color, 0xffffff, 0.5), alpha: 1 - age });
      } else if (fx.kind === "blast") {
        g.circle(fx.x, fx.y, (6 + 14 * fx.size * age) * px).fill({
          color: 0xffb040,
          alpha: 0.8 * (1 - age),
        });
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
  private drawCoronaStructures(g: Graphics, px: number): void {
    const info = view.init?.corona;
    if (!info) return;
    const size = Math.max(CORONA_STRUCTURE_SIZE, 7 * px);
    const half = size / 2;
    const outline = { width: Math.max(1, 1.5 * px), color: 0xffffff };
    for (const s of view.structures.values()) {
      if (s.grid !== info.id) continue;
      const p = coronaTileCenter(info, s.tile);
      const color = view.factions.get(s.owner)?.color ?? 0x888888;
      const alpha = s.buildTicksLeft > 0 ? 0.45 : 1;
      if (s.kind === "sunBase") {
        // A square with a sun-colored core: the base.
        g.rect(p.x - half, p.y - half, size, size)
          .fill({ color, alpha })
          .stroke(outline);
        g.circle(p.x, p.y, size / 5).fill(0xffd040);
      } else {
        // A triangle pointing at the Sun: the siphon.
        const len = Math.hypot(p.x, p.y) || 1;
        const ux = -p.x / len;
        const uy = -p.y / len;
        g.poly([
          p.x + ux * half,
          p.y + uy * half,
          p.x - ux * half - uy * half,
          p.y - uy * half + ux * half,
          p.x - ux * half + uy * half,
          p.y - uy * half - ux * half,
        ])
          .fill({ color, alpha })
          .stroke(outline);
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
