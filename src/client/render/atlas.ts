import { CanvasSource, Rectangle, Texture } from "pixi.js";
import type { SpriteName } from "./atlasFrames";
import { ATLAS_FRAMES, ATLAS_HEIGHT, ATLAS_WIDTH } from "./atlasFrames";

/**
 * The sprite atlas (CODING_STANDARDS.md §5: every sprite comes from it): one
 * SVG sheet made by `npm run atlas`, rasterized once at start-up at a scale
 * that depends on the graphics quality, with mipmaps so zoomed-out sprites
 * stay smooth.
 */
export class Atlas {
  private constructor(private readonly textures: ReadonlyMap<SpriteName, Texture>) {}

  /** Loads and rasterizes the atlas; `scale` 1 = the SVG's own pixel size. */
  static async load(scale: number): Promise<Atlas> {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}atlas/atlas.svg`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(ATLAS_WIDTH * scale);
    canvas.height = Math.round(ATLAS_HEIGHT * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas for the sprite atlas");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const source = new CanvasSource({
      resource: canvas,
      autoGenerateMipmaps: true,
      scaleMode: "linear",
      resolution: scale,
    });
    const textures = new Map<SpriteName, Texture>();
    for (const [name, f] of Object.entries(ATLAS_FRAMES) as [
      SpriteName,
      { x: number; y: number; size: number },
    ][]) {
      textures.set(name, new Texture({ source, frame: new Rectangle(f.x, f.y, f.size, f.size) }));
    }
    return new Atlas(textures);
  }

  texture(name: SpriteName): Texture {
    return this.textures.get(name)!;
  }
}
