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
        // Warships: pick one of yours, or give the picked one (or a new one) its patrol.
        const warship = renderer.system.ownWarshipAt(x, y);
        if (warship !== null && ui.mode.value === "none") {
          actions.selectWarship(warship === ui.selectedWarship.value ? null : warship);
          return;
        }
        // A world's icon opens its map; the Corona is played right here.
        const grid = renderer.system.gridAt(x, y, renderer.now());
        if (actions.clickSpace(renderer.system.camera.screenToWorld(x, y), grid)) return;
        const corona = grid === null ? renderer.system.coronaTileAt(x, y) : null;
        if (grid !== null) actions.openPlanet(grid);
        else if (corona) actions.clickTile(corona);
      } else {
        const hit = renderer.planet.tileAt(x, y);
        if (hit) actions.clickTile(hit);
      }
    },
    () => {
      // Zooming far out of a world's map goes back to the solar system.
      if (ui.view.value.kind === "planet" && renderer.planet.zoomedOut) actions.openSystem();
    },
    (x, y) => {
      // Right click: diplomacy with whoever owns the territory.
      const hit =
        ui.view.value.kind === "system"
          ? renderer.system.coronaTileAt(x, y)
          : renderer.planet.tileAt(x, y);
      if (hit) actions.inspectTile(hit);
    },
  );

  attachKeys({
    cancel: () => {
      actions.cancel();
      actions.select(null);
    },
    toggleSystemView: actions.toggleSystemView,
    buildSpaceport: () => actions.toggleMode("spaceport"),
    buildHabitat: () => actions.toggleMode("habitat"),
    launchLander: () => actions.toggleMode("launch"),
    launchSunBase: () => actions.toggleMode("sunBase"),
    buildSolarSiphon: () => actions.toggleMode("solarSiphon"),
    buildShield: () => actions.toggleMode("shieldGenerator"),
    buildOrbitalDefense: () => actions.toggleMode("orbitalDefense"),
    buildLaunchSilo: () => actions.toggleMode("launchSilo"),
    launchWarship: () => actions.toggleMode("warship"),
    nextWarship: actions.nextWarship,
    fireKinetic: () => actions.toggleMode("kineticStrike"),
    fireAntimatter: () => actions.toggleMode("antimatterWarhead"),
  });

  render(h(App, { actions }), element("ui"));
}

main().catch((error: unknown) => log.error("SpaceFront failed to start", error));
