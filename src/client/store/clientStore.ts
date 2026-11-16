import { signal } from "@preact/signals";
import type { WorkerMessage } from "../../shared/messages";

/** View state built from worker messages. UI and renderer read from here. */
export const clientStore = {
  ready: signal(false),
  tick: signal(0),
};

export function applyWorkerMessage(message: WorkerMessage): void {
  switch (message.type) {
    case "ready":
      clientStore.ready.value = true;
      break;
    case "tick":
      clientStore.tick.value = message.tick;
      break;
  }
}
