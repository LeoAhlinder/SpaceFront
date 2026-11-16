import { TICK_MS } from "../core";
import type { ClientMessage, WorkerMessage } from "../shared/messages";

/**
 * SimHost placeholder: owns the tick timer. In M0.2+ it will own a World and
 * run the systems each tick; for now it only proves the worker pipeline works.
 */

/** The parts of the worker global scope we use (the DOM lib lacks worker types). */
interface WorkerScope {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ClientMessage>) => void) | null;
}

const scope = self as unknown as WorkerScope;

let tick = 0;
let paused = true;
let timer: ReturnType<typeof setInterval> | undefined;

function post(message: WorkerMessage): void {
  scope.postMessage(message);
}

function step(): void {
  if (paused) return;
  tick += 1;
  post({ type: "tick", tick });
}

scope.onmessage = (event: MessageEvent<ClientMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      paused = false;
      timer ??= setInterval(step, TICK_MS);
      break;
    case "pause":
      paused = message.paused;
      break;
  }
};

post({ type: "ready" });
