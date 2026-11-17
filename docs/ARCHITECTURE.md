# SpaceFront — Architecture

This document explains how the code is organized and why. The gameplay itself is in [GAMEPLAY_PLAN.md](GAMEPLAY_PLAN.md), the rules for writing code are in [CODING_STANDARDS.md](CODING_STANDARDS.md), and the build order is in [CODING_PLAN.md](CODING_PLAN.md).

---

## 1. Goals that shape the architecture

| Goal                                        | What it forces                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs in the browser first                   | Web stack: TypeScript, Vite, WebGL via PixiJS                                                                                                       |
| Desktop/Steam later                         | Platform features (saves, achievements) behind one interface, so Electron can plug in                                                               |
| Online multiplayer later, without a rewrite | The **simulation is deterministic**, gets all input as **commands**, and has **no browser dependencies**, so the same code can run on a Node server |
| Smooth on big maps                          | Simulation runs in a **Web Worker**. Tiles are stored in **typed arrays**. Rendering only updates tiles that changed.                               |
| AI opponents behave like players            | AI produces the **same commands** a human sends. It never edits state directly.                                                                     |

---

## 2. The big picture

```
┌──────────────────────── Main thread ─────────────────────────┐
│                                                               │
│  UI (Preact)  ◄──  ClientStore  ◄──  SimBridge  ◄─────────┐   │
│   HUD, menus        view state        messages            │   │
│      │                                                    │   │
│      ▼                                                    │   │
│  Input ──► Commands ──────────────► SimBridge ──┐         │   │
│                                                 │         │   │
│  Renderer (PixiJS) ◄── ClientStore              │         │   │
│   bodies, territory, ships, sprites, camera     │         │   │
└─────────────────────────────────────────────────┼─────────┼───┘
                                                  │ post    │ deltas
┌──────────────────── Web Worker ─────────────────▼─────────┼───┐
│  SimHost: runs the tick loop on a fixed timer              │  │
│      │                                                     │  │
│      ▼                                                     │  │
│  core/ (pure simulation) ── World state ── produces deltas ┘  │
│      systems: commands → growth → income → attacks →          │
│               ships → combat → construction → corona → AI     │
└───────────────────────────────────────────────────────────────┘

Later:  the same core/ runs in server/ (Node), which relays commands between players.
        desktop/ (Electron) wraps the built web client and adds Steam.
```

---

## 3. Folder layout

```
SpaceFront/
├── docs/                  Plans, architecture, standards
├── src/
│   ├── core/              Pure deterministic simulation. No DOM, no Pixi, no timers.
│   │   ├── math/          Fixed-point helpers, sin/cos lookup table, seeded RNG
│   │   ├── world/         World, Body, Corona, Faction, Unit, Structure types
│   │   ├── grid/          TileGrid interface, DiscGrid (planets), PolarGrid (Corona)
│   │   ├── systems/       One file per system (growth, income, attack, ships, …)
│   │   ├── commands/      Command types, validation, CommandQueue
│   │   ├── ai/            Bot AI, Nation AI, AI profiles
│   │   ├── delta/         Collects changes each tick for the renderer / network
│   │   ├── serialize/     Save/load, state hashing
│   │   └── index.ts       Public API of core (the only file others import from)
│   ├── worker/            SimHost: owns a World, runs ticks, talks to the main thread
│   ├── client/
│   │   ├── bridge/        SimBridge: typed messages to and from the worker
│   │   ├── store/         ClientStore: view state built from deltas
│   │   ├── render/        PixiJS renderer, layers, camera, sprite atlas
│   │   ├── input/         Mouse/keyboard/touch → commands
│   │   ├── ui/            Preact components (HUD, menus, panels)
│   │   ├── platform/      Platform interface + web implementation
│   │   └── main.ts        Entry point
│   ├── data/              Game content as typed TS: bodies, nations, difficulty, balance
│   └── shared/            Message types shared by worker and client (no logic)
├── assets/                Sprites, map images, sounds (source files)
├── tools/                 Build-time scripts (map generation, sin table, atlas packing)
├── tests/                 Cross-module tests (determinism, replays)
├── desktop/               (M5) Electron wrapper
└── server/                (M6) Multiplayer relay
```

### Import rules (enforced by ESLint)

| Folder    | May import from                                             |
| --------- | ----------------------------------------------------------- |
| `core/`   | `core/`, `data/`                                            |
| `worker/` | `core/`, `data/`, `shared/`                                 |
| `client/` | `client/`, `data/`, `shared/`. Only **types** from `core/`. |
| `data/`   | nothing (only types from `core/`)                           |
| `shared/` | only types                                                  |

This keeps the simulation portable to a server and stops rendering code from reaching into game state.

---

## 4. The simulation (`core/`)

### 4.1 Tick loop

- Fixed rate: **10 ticks per second** (`TICK_MS = 100`).
- Each tick runs the systems **in a fixed order**:

  1. `applyCommands`: validate and apply this tick's commands
  2. `orbitSystem`: update body positions (computed from the tick number)
  3. `populationSystem`: population growth, troop/worker split
  4. `incomeSystem`: Solars from workers, trade, siphons
  5. `attackSystem`: territory spreading
  6. `shipSystem`: ship movement, arrivals, landings
  7. `combatSystem`: Warships, orbital defense, weapons
  8. `constructionSystem`: build timers, structure effects
  9. `coronaSystem`: heat drain, decay of territory cut off from a Sun Base
  10. `aiSystem`: bots and nations queue commands for **next** tick (only every N ticks, staggered per faction)
  11. `victorySystem`: win/loss checks

- A system is a plain function: `(world: World, ctx: TickContext) => void`. Systems don't call each other. They share data only through `World`.

### 4.2 Determinism

The rule: **same seed + same commands ⇒ identical state, on every machine.**

- **RNG:** one seeded generator (`core/math/rng.ts`, e.g. a PCG or xorshift variant) stored in `World`. AI gets its own seeded stream per faction, so adding AI logic doesn't change other random results.
- **No floats in saved state where results would differ between machines.** Positions, troops and Solars are **integers** (Solars in whole units, troops in whole units, positions in fixed-point "space units").
- **No `Math.sin/cos/atan2/exp/log/pow`** in core: browsers may compute these slightly differently. Use the integer lookup tables in `core/math/trig.ts`, which are generated by `tools/gen-trig.ts` and committed.
- **No `Date`, `performance.now`, `Math.random`, `setTimeout`** in core.
- **Stable iteration order:** entities live in arrays sorted by id. No iterating over object keys with numeric ids in hot paths.
- **State hash:** `hashWorld(world)` runs every 50 ticks in debug builds and in tests. Later, multiplayer clients compare these hashes to detect desyncs.

### 4.3 World state

```ts
interface World {
  tick: number;
  seed: number;
  rng: Rng;
  config: MatchConfig; // difficulty, map, player count
  bodies: Body[]; // planets, moons, asteroids
  corona: Corona; // ring around the Sun
  factions: Faction[]; // index 0 = neutral
  units: UnitStore; // ships (struct-of-arrays)
  structures: StructureStore; // buildings (struct-of-arrays)
  attacks: Attack[];
  alliances: AllianceTable;
  pending: CommandQueue;
}
```

- **Faction ids are `uint16`.** 0 = neutral/unowned.
- **Entity stores** (units, structures) use struct-of-arrays with typed arrays and a free list for reuse, because thousands of ships may exist.

### 4.4 Tile grids

Every territory surface implements one interface, so attack, growth and rendering code don't care what shape the surface is:

```ts
interface TileGrid {
  readonly size: number; // number of tiles
  readonly owner: Uint16Array; // faction id per tile
  readonly terrain: Uint8Array; // terrain type per tile
  readonly maxNeighbors: number; // size of the `out` buffer for neighbors()
  isUsable(tile: number): boolean; // false for space/padding slots
  neighbors(tile: number, out: Int32Array): number; // writes neighbors, returns count
}
```

| Grid        | Used for                  | Shape                                                                                     |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `DiscGrid`  | Planets, moons, asteroids | Square grid cut into a circle. Tiles outside the circle are space and can't be owned.     |
| `PolarGrid` | The Corona                | `rings × sectors`. Sectors wrap around. Each ring belongs to a band (inner/middle/outer). |

A tile is identified by `(gridId, index)`. Code in hot loops only works with plain `number` indexes.

### 4.5 Territory spreading (attacks)

- An `Attack` has an attacker, a defender (or neutral), a troop pool, and a **frontier**: the attacker's tiles that border the target.
- Each tick it conquers tiles from the frontier in priority order (closest to the click target, then lowest defense). Each tile costs troops depending on the defender's density, terrain and Shield Generators.
- The attack ends when its troops run out, the frontier is empty, or the two sides become allies. Leftover troops go back to the attacker.
- The frontier is updated incrementally, never rebuilt by scanning the whole map.

### 4.6 Space and ships

- Body positions are **computed, not stored**: `angle = phase + tick × angularSpeed`, then converted to a position with the trig table. Any tick's position can be computed directly, which is how ships aim at where a target will be.
- When launched, a ship gets a **precomputed path**: a few waypoints that bend around the Sun's heat zone and the gas giants. Each tick it moves along the path. Planning happens once at launch, not every tick.
- Combat checks use a **spatial hash** (grid buckets in space) so nearby ships are found without comparing every pair.

### 4.7 Commands

All input, from the human, the AI or (later) the network, is a command:

```ts
type Command =
  | { type: "spawn"; faction: FactionId; grid: GridId; tile: number }
  // Attacks whoever owns `tile` when the command applies (neutral land included).
  | { type: "attack"; faction: FactionId; grid: GridId; tile: number; ratioPct: number }
  | { type: "setRatio"; faction: FactionId; troopRatioPct: number }
  | { type: "build"; faction: FactionId; kind: StructureKind; grid: GridId; tile: number }
  | {
      type: "launch";
      faction: FactionId;
      kind: ShipKind;
      from: StructureId;
      toGrid: GridId;
      toTile: number;
      troops?: number;
    }
  | { type: "ally"; faction: FactionId; other: FactionId; action: "request" | "accept" | "break" }
  | { type: "gift"; faction: FactionId; to: FactionId; solars?: number; troops?: number }
  | { type: "embargo"; faction: FactionId; other: FactionId; on: boolean }
  | {
      type: "fireWeapon";
      faction: FactionId;
      from: StructureId;
      kind: WeaponKind;
      grid: GridId;
      tile: number;
    };
```

- Commands are **plain JSON**, so they can be saved, replayed and sent over a network.
- Each command is scheduled for a specific tick. In single-player that is `currentTick + 1`. In multiplayer the server will assign the tick.
- `validateCommand` checks the command against the state at the moment it applies. Invalid commands are dropped silently in release builds and logged in debug builds.

### 4.8 AI

- Lives in `core/ai/` and runs inside the simulation, so it is deterministic and can later run on the server.
- **Bots:** a few rules (expand into neutral land, attack only weaker neighbors, otherwise idle). Cheap enough for hundreds of bots.
- **Nations:** utility-based. Every decision interval, each nation scores candidate actions (expand, attack neighbor X, build Y, launch to body Z, send a Sun Base, ally/betray) and picks the best one. How it scores them comes from an `AiProfile`:

  ```ts
  interface AiProfile {
    aggression: number; // 0–100
    builder: number; // preference for structures
    spacefaring: number; // preference for leaving home and going for the Sun
    loyalty: number; // chance to keep alliances
    reactionTicks: number; // how often it decides
    bonus: { growth: number; income: number; buildSpeed: number };
  }
  ```

  A profile is picked from the nation's **tier** and the match **difficulty** (`data/difficulty.ts`).

- AI decisions are spread across ticks (each faction decides on a different tick), so the CPU load stays flat.

### 4.9 Deltas

After each tick, `core/delta` collects what changed:

- Tiles whose owner changed: `(gridId, index, newOwner)` packed into a `Uint32Array`
- Faction stats: troops, workers, Solars, tile count
- Ships spawned, moved or destroyed, and structures built or destroyed
- Events for the UI: "alliance requested", "nuke incoming", "siphon captured"

Deltas are the only thing that leaves the worker each tick.

---

## 5. Worker ↔ client

- `src/shared/messages.ts` defines every message as a discriminated union.
- **Client → worker:** `start(matchConfig)`, `command(cmd)`, `pause`, `setSpeed`, `save`, `load`.
- **Worker → client:**
  - `init`: static data (grid sizes, terrain arrays, faction names and colors). Sent once.
  - `tick`: delta and tick number. Sent every tick. Typed arrays are **transferred**, not copied.
  - `event`: messages for the UI
  - `saveData`: a finished save
- The client never sees the `World` object, only deltas. The same split works later when the deltas come from a server.

---

## 6. Rendering (`client/render`)

- **PixiJS** (WebGL, with WebGPU when available). Layers from back to front:
  1. Starfield background (static)
  2. Orbits, the Sun, the Corona rings
  3. **Territory layer:** one texture per grid, where each pixel is one tile, tinted by owner color. Only changed tiles are rewritten, and the texture is re-uploaded once per frame at most.
  4. Borders (shader edge detection on the owner texture), terrain detail
  5. Structures (sprites from a texture atlas)
  6. Ships (sprites; batched; shown as icons when zoomed out)
  7. Effects (explosions, beams, weapon trails)
  8. Selection, hover and target markers
- **Corona:** its `PolarGrid` texture is drawn onto a ring mesh, so polar tiles appear as curved segments.
- **Interpolation:** the renderer runs at the display frame rate. It moves body and ship positions smoothly between the last two ticks.
- **Level of detail:** zoomed out, planets become discs colored by their main owner, and ships are grouped into counters.
- **Camera:** pan, zoom toward the cursor, follow a body (the camera moves along with its orbit).

---

## 7. UI (`client/ui`)

- **Preact** for HUD and menus (small and fast). The UI sits as normal DOM on top of the canvas.
- Reads from `ClientStore` via signals. It never touches the renderer or worker directly. It sends commands through `SimBridge`.
- Screens: Main menu → Match setup (difficulty, spawn) → In-game HUD → End screen.
- HUD: Solars, troops/workers slider, attack ratio slider, build menu, faction list/leaderboard, event feed, minimap.

---

## 8. Data and content (`src/data`, `assets`, `tools`)

- **Balance constants** (costs, growth rates, siphon output) live in `data/balance.ts`. There are no magic numbers in systems.
- **Bodies** (`data/bodies.ts`): radius, orbit, terrain profile, modifiers.
- **Nations** (`data/nations.ts`): name, flag, tier, colors, Earth spawn region, which colonies they may have.
- **Difficulty** (`data/difficulty.ts`): which tiers appear, how many colonies, which AI profiles.
- **Maps** live in `public/maps/<id>/` as two committed files:
  - `terrain.bin`: terrain per tile, run-length encoded (format in `core/map/terrainMap.ts`). A binary file instead of a PNG because browsers may color-correct images, which would change terrain values.
  - `regions.json`: map id, radius, and named regions (countries) with a spawn tile each.
  - `loadTerrainMap` in core validates both files. `createWorld(config, maps)` copies the terrain into the body's `DiscGrid`. Loading the files from disk or network is the host's job (worker or tests), not core's.
  - **Earth** (`npm run mapgen`, `tools/mapgen/earth.ts`): Natural Earth countries, rasterized and projected onto the disc with an **oblique Lambert azimuthal equal-area** projection centered on 10°E 15°N. Every tile covers the same real area, Africa sits in the middle, and the mid-Pacific is stretched around the rim. Highlands and mountains come from seeded noise, not real elevation. A preview image goes to `docs/maps/earth-preview.png`.
  - **Other bodies** (M1): generated procedurally from a seed with noise, in the same file format.
- Sprites are packed into an atlas by `tools/atlas`.

---

## 9. Saves, replays, platforms

- **Save** = serialized `World` (binary: typed arrays + a JSON header with a version number).
- **Replay** = seed + config + command log. Running it again gives the same game, which also makes it a strong test (see standards).
- **Platform interface** (`client/platform`):
  ```ts
  interface Platform {
    saveFile(name: string, data: Uint8Array): Promise<void>;
    loadFile(name: string): Promise<Uint8Array | null>;
    unlockAchievement(id: string): void;
    readonly kind: "web" | "desktop";
  }
  ```
  The web version uses IndexedDB. The desktop version (M5) uses the file system and Steamworks through Electron's preload bridge.

---

## 10. Multiplayer later (M6)

Prepared now, built later:

- `server/` runs on Node. It collects commands from clients, assigns each a tick number and broadcasts them (**lockstep**). Each client runs its own `core/` in its worker.
- Clients send their state hash periodically, and a mismatch is reported as a desync.
- Because core is deterministic and command-driven, no simulation code changes are needed. Only `SimHost` gets a "network" mode where commands come from the server instead of the local queue.

---

## 11. Tooling

| Tool                     | Use                                                                     |
| ------------------------ | ----------------------------------------------------------------------- |
| TypeScript (strict)      | Language                                                                |
| Vite                     | Dev server and build. Supports workers out of the box.                  |
| PixiJS                   | Rendering                                                               |
| Preact + @preact/signals | UI                                                                      |
| Vitest                   | Unit and determinism tests                                              |
| Playwright               | Browser smoke tests (from M1)                                           |
| ESLint + Prettier        | Linting (including import rules and banned APIs in core) and formatting |
| Electron + steamworks.js | Desktop/Steam build (M5)                                                |

Versions: pick the latest stable release of each when the project is set up, and pin exact versions in `package.json`.
