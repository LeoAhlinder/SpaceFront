/**
 * Worker entry point: forwards messages to the SimHost and posts its output.
 */
import type { ClientMessage, WorkerMessage } from "../shared/messages";
import { SimHost } from "./simHost";

/** The parts of the worker global scope we use (the DOM lib lacks worker types). */
interface WorkerScope {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ClientMessage>) => void) | null;
}

const scope = self as unknown as WorkerScope;

const host = new SimHost({
  post: (message, transfer) => scope.postMessage(message, transfer),
  loadFile: async (path) => {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
});

scope.onmessage = (event) => host.handle(event.data);
