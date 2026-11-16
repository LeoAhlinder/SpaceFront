# SpaceFront — Coding Plan

The build order, broken into milestones and tasks. Every milestone ends with something **playable in the browser**. Gameplay is defined in [GAMEPLAY_PLAN.md](GAMEPLAY_PLAN.md), structure in [ARCHITECTURE.md](ARCHITECTURE.md), and rules in [CODING_STANDARDS.md](CODING_STANDARDS.md).

How to read the tasks: each one is roughly one PR. `☐` = not started.

---

## M0 — Prototype: Earth only

**Goal:** a single Earth disc in the browser. You pick a spawn, expand with the attack slider and fight dumb bots.

### M0.1 Project setup

- ☑ Give SpaceFront its own git repository
- ☑ Vite + TypeScript (strict) project, folder layout from the architecture doc
- ☑ ESLint (import boundaries and banned APIs in `core/`), Prettier, Vitest
- ☑ `npm run check` script; GitHub Actions CI running it on every push (runs once a GitHub remote is added)
- ☑ `CLAUDE.md` and docs in place

### M0.2 Core foundations

- ☐ `core/math`: seeded RNG, fixed-point helpers, trig lookup table + `tools/gen-trig.ts`
- ☐ `core/world`: `World`, `Faction`, `MatchConfig` types; `createWorld(config)`
- ☐ `core/grid`: `TileGrid` interface + `DiscGrid` with neighbors and tests
- ☐ Tick runner: runs systems in order, increments `tick`
- ☐ `hashWorld` + the first determinism test (empty world, 1,000 ticks, two runs, same hash)

### M0.3 Territory gameplay

- ☐ Commands: `spawn`, `attack`, `setRatio`; `CommandQueue`; `validateCommand`
- ☐ `populationSystem`: growth based on territory size, population cap, troops/workers split
- ☐ `attackSystem`: frontier-based spreading into neutral land and enemy land, troop costs, attack end conditions
- ☐ Terrain types with different expansion costs (plains, mountains, ice, ocean). On Earth, oceans can't be owned.
- ☐ Unit tests for each system + a determinism test with scripted attacks

### M0.4 Earth map

- ☐ `tools/mapgen`: public-domain world data → disc projection → terrain PNG + spawn regions JSON
- ☐ Map loader in core, from the generated data into `DiscGrid`
- ☐ `assets/CREDITS.md` with the map data source and its license

### M0.5 Bots

- ☐ `core/ai/bot.ts`: spawn on random land, expand into neutral land, attack weaker neighbors only
- ☐ `aiSystem` with staggered decision ticks
- ☐ Test: 50 bots for 5,000 ticks with no errors and stable hashes

### M0.6 Worker and client

- ☐ `shared/messages.ts`; `worker/simHost.ts` with the fixed tick timer and pause
- ☐ `core/delta`: tile-owner changes + faction stats
- ☐ `client/bridge` + `client/store`
- ☐ Renderer: territory texture updated from deltas, borders, camera pan/zoom
- ☐ Input: click to spawn, click to attack; attack ratio slider
- ☐ Minimal HUD: troops, workers, tile count, a leaderboard

**Done when:** you can play a full match on Earth against ~40 bots in Chrome and Firefox at 60 FPS, and win by reaching 80% of the land.

---

## M1 — The solar system

**Goal:** all bodies on orbits, and invading other bodies with Troop Landers.

- ☐ `data/bodies.ts`: every body from the gameplay plan with radius, orbit, terrain profile, modifiers
- ☐ Procedural terrain generator for non-Earth bodies (seeded noise → same PNG format as Earth)
- ☐ `orbitSystem`: positions from the tick number; compressed distances and orbit times
- ☐ The Sun and its heat zone; gas giants as obstacles
- ☐ Multiple grids in the world, render layer per body, zoomed-out level of detail
- ☐ Structures, part 1: `StructureStore`, `build` command, construction timers, **Spaceport**
- ☐ Ships, part 1: `UnitStore`, `launch` command, path planning around the Sun and gas giants, aiming at where the target will be, **Troop Lander** landing → attack at the landing tile
- ☐ Ship rendering with interpolation, icons when zoomed out
- ☐ Spawn on any landable body; bots on every body
- ☐ Playwright smoke test

**Done when:** you can start on Mars, build a Spaceport, send a Troop Lander and take territory on Earth while the planets move.

---

## M2 — Economy

**Goal:** Solars and a reason to build.

- ☐ `incomeSystem`: worker income × land quality and body modifiers
- ☐ Solars in HUD; build menu with costs that rise with how many you own
- ☐ **Habitat** (+population cap, +income)
- ☐ **Freighter** trade: auto-launch between Spaceports of different factions, pay by distance, both sides earn
- ☐ Balance pass 1: put every number in `data/balance.ts` and write a short balance notes file

**Done when:** a player who builds and trades clearly beats one who doesn't.

---

## M2.5 — The Corona

**Goal:** the Sun as the big prize.

- ☐ `PolarGrid` with rings, sectors, and three bands; tests for its neighbors (wrap-around)
- ☐ Corona render layer: polar texture on a ring mesh
- ☐ **Sun Base ship** + **Sun Base** structure: claims an area on arrival, acts as a Spaceport
- ☐ Corona territory spread: troops don't grow there; troops come from Landers and Sun Bases
- ☐ `coronaSystem`: heat drain per band; decay of territory cut off from a Sun Base
- ☐ **Solar Siphon**: built only in your own Corona territory, output by band, diminishing returns, captured along with its tile
- ☐ Corona tiles excluded from the 80% win goal
- ☐ Balance: one siphon ≈ a mid-sized planet's worker income

**Done when:** holding the inner Corona gives a clear economic lead, and you can take it away from an opponent.

---

## M3 — Nations and difficulty

**Goal:** the real-world countries and their colonies as smart opponents.

- ☐ `data/nations.ts`: countries with tier, flag, colors, Earth spawn region, colony options
- ☐ `data/difficulty.ts`: Easy/Normal/Hard/Impossible from the gameplay plan
- ☐ Colonies: spawn on other bodies, start allied with their home nation, become independent when that breaks
- ☐ Diplomacy: `ally`, `gift`, `embargo` commands; traitor penalty; UI for requests and quick signals
- ☐ `core/ai/nation.ts`: utility AI, `AiProfile`, every action type from M0–M2.5 (including Sun Bases and siphons)
- ☐ AI memory (grudges after betrayal), ganging up on the leader at higher difficulties
- ☐ Match setup screen: difficulty, spawn choice
- ☐ AI-vs-AI test runs for each difficulty in CI (short tick limit)

**Done when:** Easy is beatable by a new player, and Impossible beats most strong players.

---

## M4 — Combat depth

- ☐ **Warship**: patrol orders, spatial hash, attacks Landers, Freighters and siphons
- ☐ **Shield Generator**, **Orbital Defense Platform**
- ☐ **Launch Silo**, **Kinetic Strike**, **Antimatter Warhead** (with lasting irradiation); warnings to everyone
- ☐ Effects: explosions, beams, weapon trails
- ☐ Nation AI uses all of the above
- ☐ Balance pass 2

---

## M5 — Polish and desktop build

- ☐ Final sprites and atlas, sound effects, music
- ☐ Main menu, settings (keys, volume, graphics), tutorial match
- ☐ Save/load + replays (`Platform` with IndexedDB)
- ☐ Performance pass on low-end laptops
- ☐ `desktop/`: Electron wrapper, file-system saves, Windows/macOS/Linux builds
- ☐ Steamworks via steamworks.js: achievements, cloud saves (needs a Steamworks partner account and app id, which you set up)

---

## M6 — Steam release and online play

- ☐ Steam store page, trailer, screenshots
- ☐ `server/`: Node lockstep relay, lobbies, reconnect
- ☐ Network mode in `SimHost`; desync detection by hash
- ☐ Matchmaking/lobby UI; human players + AI in the same match

---

## Working order and risks

**Order inside a milestone:** core + tests first → worker/delta → render → UI. Core features are always playable through the debug UI before they get polished.

| Risk                                           | Mitigation                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Desyncs appear later when multiplayer is added | Determinism tests and replay hashes from M0, banned APIs enforced by lint      |
| Performance with many tiles, ships and AI      | Typed arrays, incremental frontiers, benchmarks from M0, staggered AI          |
| Planet orbits make routes confusing            | Show arrival time and predicted target position when choosing a destination    |
| A disc projection of Earth looks odd           | Test the mapgen early (M0.4). Tweak the projection before building more on it. |
| Nation AI takes longer than expected           | Bots ship first; nations reuse the bot code and only add scoring               |
| Steam needs an Electron-specific setup         | `Platform` interface from M0, so only one module changes                       |
