import { Application, Graphics } from "pixi.js";

/** Creates the PixiJS app and draws a placeholder scene (Sun + starfield). */
export async function createRenderer(container: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: window, background: "#05060f", antialias: true });
  container.appendChild(app.canvas);

  const stars = new Graphics();
  // Placeholder starfield. The client may use Math.random; only core must not.
  for (let i = 0; i < 300; i++) {
    stars.circle(Math.random() * 4000, Math.random() * 3000, Math.random() * 1.2 + 0.3);
  }
  stars.fill({ color: 0xffffff, alpha: 0.7 });
  app.stage.addChild(stars);

  const sun = new Graphics().circle(0, 0, 40).fill(0xffc94a);
  app.stage.addChild(sun);

  const center = (): void => {
    sun.position.set(app.screen.width / 2, app.screen.height / 2);
  };
  center();
  app.renderer.on("resize", center);

  return app;
}
