import type { ClientMessage, WorkerMessage } from "../../shared/messages";

type Listener = (message: WorkerMessage) => void;

/** The client's only connection to the simulation worker. */
export class SimBridge {
  private readonly worker: Worker;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.worker = new Worker(new URL("../../worker/simWorker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      for (const listener of this.listeners) listener(event.data);
    };
  }

  send(message: ClientMessage): void {
    this.worker.postMessage(message);
  }

  /** Subscribe to worker messages; returns an unsubscribe function. */
  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
