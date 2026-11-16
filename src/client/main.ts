import { h, render } from "preact";
import { log } from "../shared/log";
import { SimBridge } from "./bridge/simBridge";
import { createRenderer } from "./render/renderer";
import { applyWorkerMessage } from "./store/clientStore";
import { Hud } from "./ui/Hud";

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

async function main(): Promise<void> {
  await createRenderer(element("game"));
  render(h(Hud, {}), element("ui"));

  const bridge = new SimBridge();
  bridge.onMessage((message) => {
    applyWorkerMessage(message);
    if (message.type === "ready") bridge.send({ type: "start" });
  });
}

main().catch((error: unknown) => log.error("SpaceFront failed to start", error));
