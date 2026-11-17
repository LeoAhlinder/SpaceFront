import { Application, Container, Graphics } from "pixi.js";
import type { MatchInit } from "../../shared/messages";
import { view } from "../store/clientStore";
import { Camera } from "./camera";
import { TerritoryLayer } from "./territoryLayer";

export interface TileHit {
  readonly grid: number;
  readonly tile: number;
}

/**
 * Draws the match: a static starfield, and one territory layer per body
 * inside a camera-controlled world container. Reads `view`; never touches
 * the simulation.
 */
export class GameRenderer {
  readonly camera: Camera;
  private readonly world = new Container();
  private layers: TerritoryLayer[] = [];

  private constructor(readonly app: Application) {
    this.camera = new Camera(this.world);
    app.stage.addChild(starfield(), this.world);
    app.ticker.add(() => this.frame());
  }

  static async create(container: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    await app.init({ resizeTo: window, background: "#05060f", antialias: false });
    container.appendChild(app.canvas);
    return new GameRenderer(app);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Builds the layers for a new match and frames the first body. */
  showMatch(init: MatchInit): void {
    for (const layer of this.layers) layer.destroy();
    this.layers = init.grids.map(
      (grid, i) =>
        new TerritoryLayer(grid, view.owners[i]!, (owner) => view.factions.get(owner)?.color ?? 0),
    );
    for (const layer of this.layers) this.world.addChild(layer.sprite);
    const first = this.layers[0];
    if (first) {
      this.camera.fit(first.width, first.height, this.app.screen.width, this.app.screen.height);
    }
  }

  /** The tile under a screen point, if any. */
  tileAt(screenX: number, screenY: number): TileHit | null {
    const p = this.camera.screenToWorld(screenX, screenY);
    for (let grid = 0; grid < this.layers.length; grid++) {
      const tile = this.layers[grid]!.tileAt(p.x, p.y);
      if (tile >= 0) return { grid, tile };
    }
    return null;
  }

  private frame(): void {
    this.layers.forEach((layer, i) => {
      const dirty = view.dirty[i];
      if (dirty && dirty.length > 0) {
        layer.redraw(dirty);
        dirty.length = 0;
      }
    });
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
