import { h, render } from "preact";
import { log } from "../shared/log";
import { createActions } from "./actions";
import { SimBridge } from "./bridge/simBridge";
import { attachKeys } from "./input/keymap";
import { attachPointer } from "./input/pointer";
import { GameRenderer } from "./render/renderer";
import { applyWorkerMessage, ui } from "./store/clientStore";
import { App } from "./ui/App";

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

async function main(): Promise<void> {
  const renderer = await GameRenderer.create(element("game"));
  const bridge = new SimBridge();
  const actions = createActions(bridge);

  bridge.onMessage((message) => {
    applyWorkerMessage(message);
    if (message.type === "init") renderer.setMatch(message.init);
  });

  attachPointer(
    renderer.canvas,
    () => renderer.camera,
    (x, y) => {
      if (ui.view.value.kind === "system") {
        const grid = renderer.system.gridAt(x, y, renderer.now());
        if (grid !== null) actions.openPlanet(grid);
      } else {
        const hit = renderer.planet.tileAt(x, y);
        if (hit) actions.clickTile(hit);
      }
    },
    () => {
      // Zooming far out of a world's map goes back to the solar system.
      if (ui.view.value.kind === "planet" && renderer.planet.zoomedOut) actions.openSystem();
    },
  );

  attachKeys({
    cancel: actions.cancel,
    toggleSystemView: actions.toggleSystemView,
    buildSpaceport: () => actions.toggleMode("spaceport"),
    buildHabitat: () => actions.toggleMode("habitat"),
    launchLander: () => actions.toggleMode("launch"),
  });

  render(h(App, { actions }), element("ui"));
}

main().catch((error: unknown) => log.error("SpaceFront failed to start", error));
