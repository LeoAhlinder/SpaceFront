# SpaceFront — Coding Plan

The build order, broken into milestones and tasks. Every milestone ends with something **playable in the browser**. Gameplay is defined in [GAMEPLAY_PLAN.md](GAMEPLAY_PLAN.md), structure in [ARCHITECTURE.md](ARCHITECTURE.md), and rules in [CODING_STANDARDS.md](CODING_STANDARDS.md).

How to read the tasks: each one is roughly one PR. `☐` = not started.

---

## M0 — Prototype: Earth only

**Goal:** a single flat Earth map in the browser. You pick a spawn, expand with the attack slider and fight dumb bots.

### M0.1 Project setup

- ☑ Give SpaceFront its own git repository
- ☑ Vite + TypeScript (strict) project, folder layout from the architecture doc
- ☑ ESLint (import boundaries and banned APIs in `core/`), Prettier, Vitest
- ☑ `npm run check` script; GitHub Actions CI running it on every push (runs once a GitHub remote is added)
- ☑ `CLAUDE.md` and docs in place

### M0.2 Core foundations

- ☑ `core/math`: seeded RNG, fixed-point helpers, trig lookup table + `tools/gen-trig.ts`
- ☑ `core/world`: `World`, `Faction`, `MatchConfig` types; `createWorld(config)`
- ☑ `core/grid`: `TileGrid` interface + a grid with neighbors and tests (now `RectGrid`: flat maps)
- ☑ Tick runner: runs systems in order, increments `tick`
- ☑ `hashWorld` + the first determinism test (empty world, 1,000 ticks, two runs, same hash)

### M0.3 Territory gameplay

- ☑ Commands: `spawn`, `attack`, `setRatio`; `CommandQueue`; `validateCommand`
- ☑ `populationSystem`: growth based on territory size, population cap, troops/workers split
- ☑ `attackSystem`: frontier-based spreading into neutral land and enemy land, troop costs, attack end conditions
- ☑ Terrain types with different expansion costs (plains, mountains, ice, ocean). On Earth, oceans can't be owned.
- ☑ Unit tests for each system + a determinism test with scripted attacks

### M0.4 Earth map

- ☑ `tools/mapgen`: public-domain world data → flat world map (Miller projection) → run-length-encoded terrain + spawn regions JSON (+ preview PNG)
- ☑ Map loader in core, from the generated data into the grid
- ☑ `assets/CREDITS.md` with the map data source and its license

### M0.5 Bots

- ☑ `core/ai/bot.ts`: spawn on random land, expand into neutral land, attack weaker neighbors only
- ☑ `aiSystem` with staggered decision ticks
- ☑ Test: 50 bots for 5,000 ticks with no errors and stable hashes

### M0.6 Worker and client

- ☑ `shared/messages.ts`; `worker/simHost.ts` with the fixed tick timer and pause
- ☑ `core/delta`: tile-owner changes + faction stats
- ☑ `client/bridge` + `client/store`
- ☑ Renderer: territory texture updated from deltas, borders, camera pan/zoom
- ☑ Input: click to spawn, click to attack; attack ratio slider
- ☑ Minimal HUD: troops, workers, tile count, a leaderboard
- ☑ Spawn phase and victory (80% of the land or last one standing), with an end screen

**Done when:** you can play a full match on Earth against ~40 bots in Chrome and Firefox at 60 FPS, and win by reaching 80% of the land.

Status: playable in the browser against 40 bots. Checked in the desktop app's built-in browser (Chromium) at the display's refresh rate (120 FPS, no frame over 16.6 ms). Still to check by hand: Firefox, and playing a full match to the win screen (the win logic is unit-tested).

---

## M1 — The solar system

**Goal:** all bodies on orbits, and invading other bodies with Troop Landers.

- ☑ `data/bodies.ts`: every body from the gameplay plan with map size, orbit, terrain profile (gameplay modifiers come with M2's economy)
- ☑ Procedural terrain generator for non-Earth bodies (seeded noise → same map file format as Earth)
- ☑ Orbits: positions computed from the tick number (`core/space`, no system needed); compressed distances and orbit times
- ☑ The Sun and its heat zone; gas giants as obstacles (ships route around them)
- ☑ Multiple grids in the world, a territory layer per body (with a color palette per world)
- ☑ System view (Sun, orbits, body icons tinted by main owner) and planet view (one flat map); click an icon to open its map, zoom out or "System view" (M) to go back
- ☑ Structures, part 1: `build` command, construction timers, capture with the tile, **Spaceport** (free until M2)
- ☑ Ships, part 1: `launch` command, path planning around the Sun and gas giants, aiming at where the target will be, **Troop Lander** landing → attack at the landing tile; same-map hops across oceans
- ☑ Ship rendering with interpolation in the system view; incoming landing spots marked on the target's map; alerts for enemy landers heading to your worlds (click to jump there)
- ☑ Spawn on any landable body; bots on every body (one each first, the rest by land size)
- ☑ Playwright smoke test (`npm run e2e`; Edge locally, Chromium in CI)

**Done when:** you can start on Mars, build a Spaceport, send a Troop Lander and take territory on Earth while the planets move.

---

## M2 — Economy

**Goal:** Solars and a reason to build.

- ☑ `incomeSystem`: worker income × the worlds' income modifiers (averaged over the faction's land)
- ☑ World modifiers (income, growth, defense, build cost) per body, shown in the view bar
- ☑ Solars in HUD; build menu with costs that rise with how many you own
- ☑ **Habitat** (+population cap, +income)
- ☑ **Freighter** trade: auto-launch between Spaceports of different factions, pay by distance, both sides earn
- ☑ Bots build a Spaceport and Habitats, so there are trade partners
- ☑ Balance pass 1: every number in `data/balance.ts`; notes in [BALANCE.md](BALANCE.md)

**Done when:** a player who builds and trades clearly beats one who doesn't. ✔ Checked by a test: over 10 minutes, builder ≈ 3.6× the Solars and 2.3× the population of an idle faction.

---

## M2.5 — The Corona

**Goal:** the Sun as the big prize.

- ☑ `PolarGrid` with rings, sectors, and three bands; tests for its neighbors (wrap-around)
- ☑ Corona render layer: the polar grid drawn into a ring-shaped texture around the Sun (pixel → tile lookup made once), clickable in the system view
- ☑ **Sun Base ship** + **Sun Base** structure: claims an area on arrival, acts as a Spaceport
- ☑ Corona territory spread: troops don't grow there; troops come from Landers and Sun Bases (a separate Corona troop pool)
- ☑ `coronaSystem`: heat drain per band; decay of territory cut off from a Sun Base
- ☑ **Solar Siphon**: built only in your own Corona territory, output by band, diminishing returns, captured along with its tile
- ☑ Corona tiles excluded from the 80% win goal
- ☑ Balance: one siphon ≈ a mid-sized planet's worker income
- ☑ HUD: Sun Base (U) and Siphon (S) buttons with live costs; Corona tiles and troops in the stats
- ☑ Bots send a Sun Base now and then and build siphons on their Corona land

**Done when:** holding the inner Corona gives a clear economic lead, and you can take it away from an opponent. ✔ Checked by a test (`corona.test.ts`, "M2.5 goal"): over 10 minutes, a faction with two inner siphons ends with ≈ 17× the Solars of one that stays home and ≈ 2.7× one with two outer siphons; a lander onto its Sun Base then takes the base, the siphons and all its Corona land, and the attacker's income becomes ≈ 40× the loser's.

---

## M3 — Nations and difficulty

**Goal:** the real-world countries and their colonies as smart opponents.

- ☑ `data/nations.ts`: 43 countries with tier, colors, Earth spawn region, colony options (flags come with the M5 sprites)
- ☑ `data/difficulty.ts`: Easy/Normal/Hard/Impossible from the gameplay plan, with an `AiProfile` per tier
- ☑ Colonies: spawn on other bodies, start allied with their home nation, become independent when that breaks (or the home nation dies)
- ☑ Diplomacy: `ally`, `gift`, `embargo` and `signal` commands; traitor penalty; shared victory for allies; UI for requests, gifts, embargoes and quick signals
- ☑ `core/ai/nation.ts`: utility AI, `AiProfile`, every action type from M0–M2.5 (expand, attack, Spaceports, Habitats, landers, Sun Bases, siphons, siphon raids, ally/betray)
- ☑ AI memory (grudges after betrayal or attacks), ganging up on the leader at higher difficulties, coordinated wars on Impossible
- ☑ Match setup screen: difficulty, spawn choice (the spawn phase as before)
- ☑ AI-vs-AI test runs for each difficulty in CI (3,000 ticks, `tests/ai/difficulty.test.ts`)

**Done when:** Easy is beatable by a new player, and Impossible beats most strong players.

Status: checked as far as tests can (`tests/ai/difficulty.test.ts`, seed 42, 5 minutes of game time). Nations hold ≈ 7% of the land on Easy, 34% on Normal, 71% on Hard and 46% on Impossible (46 nations there split it, and fight each other more); they conquer ≈ 375, 1,800, 6,500 and 3,900 tiles from other factions per nation. Betrayals start on Hard, siphon raids and coordinated wars only on Impossible. A scripted simple player (expands, keeps a troop per tile, builds, never launches or uses diplomacy) spawned in Uzbekistan grows to ≈ 6,400 tiles on Easy and is down to a handful of tiles on Impossible; at 4,000 ticks the same held for three other seeds and spawn regions (Easy 8–11K tiles; Impossible ≤ 1K or dead). Play-tested in the browser on Hard (requests, alliances, gifts, breaking with the traitor notice, right-click diplomacy). Still to check by hand: whether real new players beat Easy and strong players lose on Impossible.

---

## M4 — Combat depth

- ☑ **Warship**: patrol orders (a point in space, or guarding a world), spatial hash, attacks Landers, Freighters, Sun Base ships, other Warships and siphons
- ☑ **Shield Generator**, **Orbital Defense Platform**
- ☑ **Launch Silo**, **Kinetic Strike**, **Antimatter Warhead** (with lasting irradiation); warnings to everyone
- ☑ Effects: explosions, beams, weapon trails
- ☑ Nation AI uses all of the above
- ☑ Balance pass 2
- ☑ Structure index (per grid and kind, plus per-faction counts), so structure checks no longer scan every structure

Status: every feature is covered by core tests (`systems/combat.test.ts`: shields, Kinetic Strikes, warheads and fallout, interception and salvos, Warships against landers, siphons and each other, determinism) and by the difficulty test (`tests/ai/difficulty.test.ts`): Easy uses none of it, Normal builds defenses, Hard and Impossible also build silos, buy Warships and fire both weapons, and only Impossible strikes siphons. Impossible costs ≈ 0.83 ms per tick at 10 minutes (≈ 3,100 structures), down from 0.85–1.1 ms before the structure index despite the new AI. Play-tested in the browser (Hard and Easy, with the dev-only `?solars=N` start): building all three structures, a Kinetic Strike and an Antimatter Warhead with their trails, target markers, impact and fallout, buying a Warship to guard Earth, selecting it (P) and sending it on patrol. Still to check by hand: how the weapons feel against real players, and whether warheads are too cheap or too dear.

---

## M5 — Polish and desktop build

- ☐ Final sprites and atlas, sound effects, music
- ☐ Real relief for Earth from public-domain elevation data, replacing the noise-based highlands and mountains
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

| Risk                                           | Mitigation                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Desyncs appear later when multiplayer is added | Determinism tests and replay hashes from M0, banned APIs enforced by lint               |
| Performance with many tiles, ships and AI      | Typed arrays, incremental frontiers, benchmarks from M0, staggered AI                   |
| Planet orbits make routes confusing            | Show arrival time and predicted target position when choosing a destination             |
| Earth map looks odd                            | Resolved: bodies are flat rectangular maps, and Earth uses a familiar Miller world map. |
| Nation AI takes longer than expected           | Bots ship first; nations reuse the bot code and only add scoring                        |
| Steam needs an Electron-specific setup         | `Platform` interface from M0, so only one module changes                                |
