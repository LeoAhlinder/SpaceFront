import { Application, Container, Graphics } from "pixi.js";
import type { MatchInit } from "../../shared/messages";
import type { Quality } from "../settings";
import type { ViewState } from "../store/clientStore";
import { ui, view } from "../store/clientStore";
import { Atlas } from "./atlas";
import type { Camera } from "./camera";
import { PlanetScene } from "./planetScene";
import { SystemScene } from "./systemScene";

export interface TileHit {
  readonly grid: number;
  readonly tile: number;
}

/** Per graphics quality: atlas resolution, antialiasing, device-pixel cap and star count. */
const QUALITY = {
  low: { atlasScale: 1, antialias: false, maxResolution: 1, stars: 250 },
  high: { atlasScale: 2, antialias: true, maxResolution: 2, stars: 700 },
} as const;

/**
 * Draws the match in one of two views (GAMEPLAY_PLAN.md §2): the solar
 * system, or one world's flat map. Follows `ui.view`; reads `view`; never
 * touches the simulation.
 */
export class GameRenderer {
  readonly system: SystemScene;
  readonly planet: PlanetScene;
  private shown: ViewState | null = null;
  /** Frame time statistics for the performance overlay (`?perf` in the URL). */
  readonly frameStats = { frames: 0, worstMs: 0, totalMs: 0 };

  private constructor(
    readonly app: Application,
    atlas: Atlas,
    quality: Quality,
  ) {
    this.system = new SystemScene(atlas, quality);
    this.planet = new PlanetScene(atlas);
    app.stage.addChild(
      starfield(QUALITY[quality].stars),
      this.system.container,
      this.planet.container,
    );
    app.ticker.add(() => this.frame());
  }

  static async create(container: HTMLElement, quality: Quality): Promise<GameRenderer> {
    const q = QUALITY[quality];
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: "#05060f",
      antialias: q.antialias,
      resolution: Math.min(q.maxResolution, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    container.appendChild(app.canvas);
    const atlas = await Atlas.load(q.atlasScale);
    return new GameRenderer(app, atlas, quality);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** The camera of the view on screen. */
  get camera(): Camera {
    return ui.view.value.kind === "system" ? this.system.camera : this.planet.camera;
  }

  setMatch(init: MatchInit): void {
    this.planet.setMatch(init);
    this.system.setMatch(init);
    this.system.fit(this.app.screen.width, this.app.screen.height);
    this.shown = null;
  }

  /** Simulation time right now, with a fraction for smooth motion between ticks. */
  now(): number {
    const since = (performance.now() - view.lastTickAt) / view.tickMs;
    return ui.tick.value + Math.min(1, Math.max(0, since));
  }

  private frame(): void {
    const started = performance.now();
    const target = ui.view.value;
    const inMatch = view.init !== null && ui.phase.value !== "menu";
    if (target !== this.shown) {
      this.shown = target;
      const { width, height } = this.app.screen;
      if (target.kind === "planet") this.planet.show(target.grid, width, height);
    }
    const inSystem = target.kind === "system";
    this.system.container.visible = inMatch && inSystem;
    this.planet.container.visible = inMatch && !inSystem;
    if (inMatch) {
      const t = this.now();
      this.planet.draw(t, !inSystem); // keeps every map's territory current even when hidden
      this.system.updateCorona();
      if (inSystem) this.system.draw(t);
    }
    const ms = performance.now() - started;
    this.frameStats.frames++;
    this.frameStats.totalMs += ms;
    this.frameStats.worstMs = Math.max(this.frameStats.worstMs, ms);
  }
}

/**
 * The background: a few thousand stars in three depths and a faint band of
 * dust, drawn once. The client may use Math.random; only core must not.
 */
function starfield(count: number): Container {
  const sky = new Container();
  const dust = new Graphics();
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 4000;
    const y = 900 + (x - 2000) * 0.25 + (Math.random() - 0.5) * 700;
    dust.circle(x, y, 80 + Math.random() * 220);
  }
  dust.fill({ color: 0x3a3a8a, alpha: 0.025 });
  const stars = new Graphics();
  for (let i = 0; i < count; i++) {
    const big = Math.random() < 0.06;
    stars.circle(Math.random() * 4000, Math.random() * 2500, big ? 1.4 : Math.random() * 0.9 + 0.3);
  }
  stars.fill({ color: 0xffffff, alpha: 0.65 });
  const tinted = new Graphics();
  for (let i = 0; i < count / 10; i++) {
    tinted.circle(Math.random() * 4000, Math.random() * 2500, Math.random() * 1.2 + 0.5);
  }
  tinted.fill({ color: 0x9cc8ff, alpha: 0.7 });
  sky.addChild(dust, stars, tinted);
  return sky;
}
