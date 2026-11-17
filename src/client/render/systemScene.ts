import { Container, Graphics, Text } from "pixi.js";
import { SOLAR_SYSTEM } from "../../data/bodies";
import { mainOwner, view } from "../store/clientStore";
import { Camera } from "./camera";
import { BODY_COLORS, mix } from "./colors";
import { alongPath, bodyPos } from "./orbits";

/** Space units the system view frames when opened (Neptune's orbit plus margin). */
const SYSTEM_EXTENT = 20_000;
/** Icons never shrink below this many screen pixels, so small moons stay clickable. */
const MIN_ICON_PX = 5;
const LABEL_STYLE = { fill: 0xc8d2f0, fontSize: 12, fontFamily: "system-ui, sans-serif" };

/**
 * The solar-system view: the Sun, orbits, every body as an icon (tinted by the
 * faction owning most of it) and ships in flight. Redrawn every frame; it's
 * only a few dozen shapes.
 */
export class SystemScene {
  readonly container = new Container();
  readonly camera: Camera;
  private readonly world = new Container();
  private readonly gfx = new Graphics();
  private readonly labels = new Map<string, Text>();

  constructor() {
    // From the whole system down to a single moon system.
    this.camera = new Camera(this.world, 0.01, 3);
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

    // Ships between worlds.
    for (const ship of view.ships.values()) {
      if (ship.waypoints.length === 0) continue;
      const f = (t - ship.launchTick) / Math.max(1, ship.arriveTick - ship.launchTick);
      const p = alongPath(ship.waypoints, f);
      const color = view.factions.get(ship.owner)?.color ?? 0xffffff;
      if (ship.owner === view.init?.playerId && ship.kind === "troopLander") {
        // Show the player's own lander routes.
        const end = ship.waypoints.length - 2;
        g.moveTo(p.x, p.y)
          .lineTo(ship.waypoints[end]!, ship.waypoints[end + 1]!)
          .stroke({ width: px, color, alpha: 0.35 });
      }
      if (ship.kind === "freighter") {
        // Freighters: small dim squares, so landers stand out.
        g.rect(p.x - 2 * px, p.y - 2 * px, 4 * px, 4 * px).fill({ color, alpha: 0.7 });
      } else {
        g.circle(p.x, p.y, 4 * px)
          .fill(color)
          .stroke({ width: px, color: 0x000000 });
      }
    }
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
