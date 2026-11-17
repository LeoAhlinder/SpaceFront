import { Application, Graphics } from "pixi.js";
import type { MatchInit } from "../../shared/messages";
import type { ViewState } from "../store/clientStore";
import { ui, view } from "../store/clientStore";
import type { Camera } from "./camera";
import { PlanetScene } from "./planetScene";
import { SystemScene } from "./systemScene";

export interface TileHit {
  readonly grid: number;
  readonly tile: number;
}

/**
 * Draws the match in one of two views (GAMEPLAY_PLAN.md §2): the solar
 * system, or one world's flat map. Follows `ui.view`; reads `view`; never
 * touches the simulation.
 */
export class GameRenderer {
  readonly system = new SystemScene();
  readonly planet = new PlanetScene();
  private shown: ViewState | null = null;

  private constructor(readonly app: Application) {
    app.stage.addChild(starfield(), this.system.container, this.planet.container);
    app.ticker.add(() => this.frame());
  }

  static async create(container: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    await app.init({ resizeTo: window, background: "#05060f", antialias: true });
    container.appendChild(app.canvas);
    return new GameRenderer(app);
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
    const since = (performance.now() - view.lastTickAt) / 100;
    return ui.tick.value + Math.min(1, Math.max(0, since));
  }

  private frame(): void {
    const target = ui.view.value;
    if (target !== this.shown) {
      this.shown = target;
      const { width, height } = this.app.screen;
      if (target.kind === "planet") this.planet.show(target.grid, width, height);
    }
    const inSystem = target.kind === "system";
    this.system.container.visible = inSystem;
    this.planet.container.visible = !inSystem;
    const t = this.now();
    this.planet.draw(t); // keeps every map's territory current even when hidden
    this.system.updateCorona();
    if (inSystem) this.system.draw(t);
  }
}

/** Static background stars. The client may use Math.random; only core must not. */
function starfield(): Graphics {
  const stars = new Graphics();
  for (let i = 0; i < 400; i++) {
    stars.circle(Math.random() * 4000, Math.random() * 2500, Math.random() * 1.1 + 0.3);
  }
  return stars.fill({ color: 0xffffff, alpha: 0.6 });
}
