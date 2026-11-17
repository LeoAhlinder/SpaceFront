import type { Container } from "pixi.js";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 40;

/**
 * Pans and zooms the world container. World units are tiles; the camera's
 * zoom is screen pixels per tile.
 */
export class Camera {
  constructor(private readonly world: Container) {}

  get zoom(): number {
    return this.world.scale.x;
  }

  /** Centers a width × height area of world units on screen, filling `fill` of it. */
  fit(width: number, height: number, screenW: number, screenH: number, fill = 0.96): void {
    const zoom = clamp(Math.min(screenW / width, screenH / height) * fill, MIN_ZOOM, MAX_ZOOM);
    this.world.scale.set(zoom);
    this.world.position.set(screenW / 2, screenH / 2);
  }

  panBy(dx: number, dy: number): void {
    this.world.position.set(this.world.position.x + dx, this.world.position.y + dy);
  }

  /** Zooms by `factor`, keeping the world point under (screenX, screenY) in place. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    const zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.world.scale.set(zoom);
    this.world.position.set(screenX - before.x * zoom, screenY - before.y * zoom);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.world.position.x) / this.zoom,
      y: (screenY - this.world.position.y) / this.zoom,
    };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
