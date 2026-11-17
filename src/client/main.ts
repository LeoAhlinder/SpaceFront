import { h, render } from "preact";
import { log } from "../shared/log";
import { createActions } from "./actions";
import { SimBridge } from "./bridge/simBridge";
import { attachPointer } from "./input/pointer";
import { GameRenderer } from "./render/renderer";
import { applyWorkerMessage } from "./store/clientStore";
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
    if (message.type === "init") renderer.showMatch(message.init);
  });

  attachPointer(renderer.canvas, renderer.camera, (x, y) => {
    const hit = renderer.tileAt(x, y);
    if (hit) actions.clickTile(hit);
  });

  render(h(App, { actions }), element("ui"));
}

main().catch((error: unknown) => log.error("SpaceFront failed to start", error));
