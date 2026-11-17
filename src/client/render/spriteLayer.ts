import { Container, Sprite } from "pixi.js";
import type { Atlas } from "./atlas";
import type { SpriteName } from "./atlasFrames";
import { ATLAS_FRAMES } from "./atlasFrames";

/**
 * A pool of atlas sprites redrawn every frame (CODING_STANDARDS.md §5: Pixi
 * objects are created once and reused). Call `begin()`, then `add()` once per
 * sprite to show, then `end()` to hide whatever wasn't used this frame.
 */
export class SpriteLayer {
  readonly container = new Container();
  private readonly pool: Sprite[] = [];
  private used = 0;

  constructor(private readonly atlas: Atlas) {}

  begin(): void {
    this.used = 0;
  }

  /**
   * Shows a sprite centered at (x, y), `size` world units across (the
   * frame's full width), tinted, rotated (radians, 0 = pointing up) and
   * faded. Returns the sprite for rare extra tweaks.
   */
  add(
    name: SpriteName,
    x: number,
    y: number,
    size: number,
    tint = 0xffffff,
    alpha = 1,
    rotation = 0,
  ): Sprite {
    let s = this.pool[this.used];
    if (!s) {
      s = new Sprite();
      s.anchor.set(0.5);
      this.pool.push(s);
      this.container.addChild(s);
    }
    this.used++;
    s.texture = this.atlas.texture(name);
    s.visible = true;
    s.position.set(x, y);
    const scale = size / ATLAS_FRAMES[name].size;
    s.scale.set(scale);
    s.tint = tint;
    s.alpha = alpha;
    s.rotation = rotation;
    return s;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) {
      const s = this.pool[i]!;
      if (!s.visible) break;
      s.visible = false;
    }
  }
}
