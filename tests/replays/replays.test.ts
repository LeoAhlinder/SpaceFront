/**
 * Committed replays (CODING_STANDARDS.md §8): each must still reach the hash
 * it was recorded with. A failure means the simulation changed; re-record
 * with `npm run replays:record` only when that change is intended.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coronaTiles } from "../../src/core";
import { decodeReplay, runReplay } from "../../src/worker/replay";
import { SOLAR_MAPS } from "../support/solarMatch";

const dir = new URL("./", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".replay.json"));

describe("committed replays", () => {
  it("there are some", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of files) {
    it(`${file} reaches its recorded hash`, () => {
      const log = decodeReplay(new Uint8Array(readFileSync(new URL(file, dir))));
      const { finalHash, match } = runReplay(log, SOLAR_MAPS);
      expect(match.world.tick).toBe(log.endTick);
      expect(finalHash).toBe(log.endHash);
      // The recorded player did something worth replaying.
      const player = match.world.factions[match.playerId]!;
      expect(player.tileCount - coronaTiles(match.world, player)).toBeGreaterThan(100);
    }, 60_000);
  }
});
