import { Terrain } from "../../src/core/grid/terrain";

/** Preview image colors per terrain (RGB). */
export const TERRAIN_RGB: Record<number, [number, number, number]> = {
  [Terrain.Space]: [5, 6, 15],
  [Terrain.Ocean]: [22, 52, 96],
  [Terrain.Plains]: [96, 140, 70],
  [Terrain.Highlands]: [150, 140, 90],
  [Terrain.Mountains]: [120, 110, 105],
  [Terrain.Ice]: [225, 235, 240],
};
