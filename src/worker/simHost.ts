import { BALANCE } from "../data/balance";
import { LANDABLE_BODIES } from "../data/bodies";
import type { GridId, MatchConfig, TerrainMap, World } from "../core";
import {
  addBot,
  addFaction,
  createWorld,
  drainDelta,
  isOwnableTerrain,
  loadTerrainMap,
  queueCommand,
  Rng,
  runTick,
  TICK_MS,
  trackChanges,
} from "../core";
import type { ClientMessage, MatchInit, MatchSetup, WorkerMessage } from "../shared/messages";
import { log } from "../shared/log";

/** What the host needs from its environment (the worker, or a test). */
export interface HostEnv {
  post(message: WorkerMessage, transfer?: Transferable[]): void;
  /** Loads a file from the site root, e.g. "maps/earth/terrain.bin". */
  loadFile(path: string): Promise<Uint8Array>;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/**
 * Owns the World in single-player: builds the match, runs ticks on a fixed
 * timer, applies the player's commands and posts a delta after every tick.
 * In multiplayer (M6) commands will come from the server instead.
 */
export class SimHost {
  private world: World | null = null;
  private playerId = 0;
  private paused = false;
  private timer: unknown = null;

  constructor(private readonly env: HostEnv) {}

  handle(message: ClientMessage): void {
    switch (message.type) {
      case "start":
        this.start(message.setup).catch((error: unknown) => {
          log.error("Match failed to start", error);
          this.env.post({ type: "error", message: String(error) });
        });
        break;
      case "pause":
        this.paused = message.paused;
        break;
      case "command":
        // In single-player the client may only command its own faction.
        if (this.world && message.command.faction === this.playerId) {
          queueCommand(this.world, message.command);
        }
        break;
    }
  }

  /** Runs one tick and posts its delta. Public for tests. */
  step(): void {
    const world = this.world;
    if (!world || this.paused) return;
    const ctx = runTick(world);
    for (const r of ctx.rejected) {
      if (r.command.faction === this.playerId) log.debug("Command rejected:", r.reason, r.command);
    }
    const delta = drainDelta(world);
    this.env.post({ type: "tick", delta }, [delta.tiles.buffer, delta.stats.buffer]);
    if (world.winner !== null) this.stop();
  }

  private async start(setup: MatchSetup): Promise<void> {
    this.stop();
    // Every landable body of the solar system, grid i = LANDABLE_BODIES[i].
    const maps = await Promise.all(LANDABLE_BODIES.map((b) => this.loadMap(b.map!.mapId)));
    const config: MatchConfig = {
      seed: setup.seed,
      difficulty: "normal",
      bodies: LANDABLE_BODIES.map((b) => ({
        width: b.map!.width,
        height: b.map!.height,
        mapId: b.map!.mapId,
        bodyId: b.id,
      })),
      spawnPhaseTicks: BALANCE.match.spawnPhaseTicks,
    };
    const world = createWorld(config, new Map(maps.map((m) => [m.id, m])));
    trackChanges(world);
    this.playerId = addFaction(world, setup.playerName, "player").id;
    const homes = botHomes(world, setup.botCount, setup.seed);
    homes.forEach((grid, i) => addBot(world, `Bot ${i + 1}`, grid));
    this.world = world;
    this.paused = false;

    const init: MatchInit = {
      playerId: this.playerId,
      spawnPhaseTicks: config.spawnPhaseTicks ?? 0,
      ownableTiles: world.ownableTiles,
      winLandPct: BALANCE.match.winLandPct,
      grids: world.grids.map((g) => ({
        id: g.id,
        bodyId: world.gridBodies[g.id] ?? "",
        width: g.width,
        height: g.height,
        terrain: g.terrain.slice(),
        owner: g.owner.slice(),
      })),
      factions: world.factions.slice(1).map((f) => ({ id: f.id, name: f.name, kind: f.kind })),
    };
    this.env.post({ type: "init", init });
    this.timer = this.env.setInterval(() => this.step(), TICK_MS);
  }

  private async loadMap(id: string): Promise<TerrainMap> {
    const [terrain, info] = await Promise.all([
      this.env.loadFile(`maps/${id}/terrain.bin`),
      this.env.loadFile(`maps/${id}/regions.json`),
    ]);
    return loadTerrainMap(terrain, JSON.parse(new TextDecoder().decode(info)));
  }

  private stop(): void {
    if (this.timer !== null) this.env.clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Home maps for `count` bots: one on every body first, so no world starts
 * empty, then the rest spread by how much land each body has.
 */
export function botHomes(world: World, count: number, seed: number): GridId[] {
  const rng = Rng.fromSeed(seed, 7);
  const land = world.grids.map((g) => {
    let n = 0;
    for (let t = 0; t < g.size; t++) if (isOwnableTerrain(g.terrain[t]!)) n++;
    return n;
  });
  const total = land.reduce((a, b) => a + b, 0);
  const homes: GridId[] = [];
  for (let i = 0; i < count; i++) {
    if (i < world.grids.length) {
      homes.push(world.grids[i]!.id);
      continue;
    }
    let pick = rng.nextInt(total);
    let g = 0;
    while (pick >= land[g]!) pick -= land[g++]!;
    homes.push(world.grids[g]!.id);
  }
  return homes;
}
