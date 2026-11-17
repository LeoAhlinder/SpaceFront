/**
 * Records the committed test replays in tests/replays/ (npm run replays:record).
 *
 * Each replay is a scripted match: a fixed setup and a list of player
 * commands. The file stores the final tick and hash, and the replay test
 * checks that playing it still reaches that hash. Re-record only when a
 * gameplay change is intended (and say so in the commit), as the coding
 * standards ask.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Command, FactionId, GridId, TerrainMap, World } from "../../src/core";
import { loadTerrainMap, queueCommand, runTick } from "../../src/core";
import { LANDABLE_BODIES } from "../../src/data/bodies";
import type { MatchSetup, ReplayCommand } from "../../src/shared/messages";
import { buildMatch } from "../../src/worker/match";
import { replayOf } from "../../src/worker/replay";

const root = new URL("../../", import.meta.url);

export function loadMaps(): Map<string, TerrainMap> {
  return new Map(
    LANDABLE_BODIES.map((b) => {
      const dir = new URL(`public/maps/${b.map!.mapId}/`, root);
      const map = loadTerrainMap(
        new Uint8Array(readFileSync(new URL("terrain.bin", dir))),
        JSON.parse(readFileSync(new URL("regions.json", dir), "utf8")),
      );
      return [map.id, map];
    }),
  );
}

interface Script {
  readonly name: string;
  readonly setup: MatchSetup;
  readonly ticks: number;
  /** The player's commands for a tick (the match's grids are known from the setup). */
  readonly at: (
    tick: number,
    me: FactionId,
    grid: (body: string) => GridId,
    land: (body: string, n: number) => number,
    world: World,
  ) => Command[];
}

const SCRIPTS: readonly Script[] = [
  {
    // A Hard match: spawn in Earth, expand, build a Spaceport and launch a lander to the Moon.
    name: "earth-hard",
    setup: { seed: 90210, mapId: "sol", botCount: 30, playerName: "Recorder", difficulty: "hard" },
    ticks: 1_500,
    at: (tick, me, grid, land, world) => {
      const earth = grid("earth");
      if (tick === 5)
        return [{ type: "spawn", faction: me, grid: earth, tile: land("earth", 60_000) }];
      if (tick === 300) return [{ type: "setRatio", faction: me, troopRatioPct: 55 }];
      if (tick === 600) {
        return [
          {
            type: "build",
            faction: me,
            kind: "spaceport",
            grid: earth,
            tile: land("earth", 60_000),
          },
        ];
      }
      if (tick === 1_100) {
        const port = world.structures.find((s) => s.owner === me && s.kind === "spaceport");
        if (!port) return [];
        const moon = grid("moon");
        return [
          {
            type: "launch",
            faction: me,
            kind: "troopLander",
            from: port.id,
            toGrid: moon,
            toTile: land("moon", 500),
            ratioPct: 30,
          },
        ];
      }
      if (tick > 100 && tick % 60 === 0) {
        return [
          {
            type: "attack",
            faction: me,
            grid: earth,
            tile: land("earth", 60_000 + tick * 11),
            ratioPct: 35,
          },
        ];
      }
      return [];
    },
  },
  {
    // The tutorial setup on Mars.
    name: "tutorial-mars",
    setup: {
      seed: 7,
      mapId: "sol",
      botCount: 0,
      playerName: "Recorder",
      difficulty: "easy",
      tutorial: true,
    },
    ticks: 800,
    at: (tick, me, grid, land) => {
      const mars = grid("mars");
      if (tick === 0)
        return [{ type: "spawn", faction: me, grid: mars, tile: land("mars", 9_000) }];
      if (tick === 30)
        return [
          { type: "build", faction: me, kind: "spaceport", grid: mars, tile: land("mars", 9_000) },
        ];
      if (tick > 20 && tick % 50 === 0) {
        return [
          {
            type: "attack",
            faction: me,
            grid: mars,
            tile: land("mars", 9_000 + tick * 5),
            ratioPct: 50,
          },
        ];
      }
      return [];
    },
  },
];

function record(script: Script, maps: Map<string, TerrainMap>): void {
  const match = buildMatch(script.setup, maps);
  const world = match.world;
  const me = match.playerId as FactionId;
  const grid = (body: string) => world.gridBodies.indexOf(body) as GridId;
  const land = (body: string, n: number) => {
    const terrain = world.grids[grid(body)]!.terrain;
    let seen = 0;
    for (let t = 0; t < terrain.length; t++)
      if (terrain[t]! >= 2 && seen++ === n % 100_000) return t;
    return terrain.findIndex((t) => t >= 2);
  };
  const commands: ReplayCommand[] = [];
  for (let tick = 0; tick < script.ticks; tick++) {
    for (const command of script.at(tick, me, grid, land, world)) {
      queueCommand(world, command);
      commands.push({ tick: world.tick, command });
    }
    runTick(world);
  }
  const log = replayOf(match, commands);
  writeFileSync(
    new URL(`tests/replays/${script.name}.replay.json`, root),
    `${JSON.stringify(log, null, 1)}\n`,
  );
  console.log(
    `${script.name}: ${commands.length} commands, ${log.endTick} ticks, hash ${log.endHash}`,
  );
}

const maps = loadMaps();
for (const script of SCRIPTS) record(script, maps);
