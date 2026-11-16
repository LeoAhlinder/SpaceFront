/**
 * Every message between the client (main thread) and the simulation worker.
 * Types only: no logic lives in shared/.
 */

/** Client → worker. */
export type ClientMessage = { type: "start" } | { type: "pause"; paused: boolean };

/** Worker → client. */
export type WorkerMessage = { type: "ready" } | { type: "tick"; tick: number };
