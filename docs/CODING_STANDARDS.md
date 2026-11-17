# SpaceFront — Coding Standards

These rules exist to keep the game **deterministic** (needed for multiplayer and replays), **fast** (big maps, many ships) and **easy to change**. When a rule here conflicts with habit, the rule wins. If a rule turns out to be wrong, change this file in the same PR.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organized.

---

## 1. Language and formatting

- **TypeScript, strict mode:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **No `any`.** Use `unknown` and narrow it. `// @ts-expect-error` needs a comment explaining why.
- **Prettier** formats everything: 2-space indent, double quotes, trailing commas, 100-character lines. Don't argue with the formatter.
- **ESLint** must pass with zero warnings. CI fails on warnings.
- **ES modules only.** Named exports only, no default exports (renames stay consistent and searchable).

## 2. Naming

| Thing                      | Style                  | Example                                              |
| -------------------------- | ---------------------- | ---------------------------------------------------- |
| Files                      | `camelCase.ts`         | `attackSystem.ts`                                    |
| Types, interfaces, classes | `PascalCase`           | `TileGrid`, `AiProfile`                              |
| Functions, variables       | `camelCase`            | `applyCommands`, `troopRatio`                        |
| Constants                  | `SCREAMING_SNAKE_CASE` | `TICK_MS`, `MAX_FACTIONS`                            |
| Ids                        | Branded number types   | `type FactionId = number & { __brand: "FactionId" }` |
| Booleans                   | `is/has/can` prefix    | `isAllied`, `canLaunch`                              |
| Preact components          | `PascalCase.tsx`       | `BuildMenu.tsx`                                      |

Game terms in code match the gameplay plan: `Solars`, `Corona`, `SunBase`, `SolarSiphon`, `TroopLander`, and so on. Don't invent synonyms.

## 3. Simulation rules (`src/core`)

These are the most important rules in the project. Breaking them causes desyncs that are very hard to find later.

### 3.1 Must

- Same seed + same commands ⇒ same state. Every system must keep this true.
- All randomness comes from the world RNG, or the faction's own AI stream: `world.rng.nextInt(n)`.
- Store troops, Solars, positions and timers as **integers**. Use fixed-point (`core/math/fixed.ts`) when fractions are needed.
- Trig goes through `core/math/trig.ts` (lookup tables).
- Iterate entities in **id order**. When sorting, always pass a comparator with a tie-breaker on id.
- Read all tunable numbers from `data/balance.ts`.

### 3.2 Must not (ESLint bans these in `core/`)

- `Math.random`, `Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`
- `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `cbrt`, `hypot`. (`Math.sqrt`, `floor`, `ceil`, `round`, `abs`, `min`, `max`, `imul` are fine.) Tests (`*.test.ts`) may use them to check results against the lookup tables, but not `Math.random`.
- `for…in`, and iterating objects whose keys are numeric ids
- Any import from `client/`, `worker/`, PixiJS, Preact or DOM types
- `async` code. The simulation is fully synchronous.

### 3.3 State and systems

- `World` is the single source of truth. No module-level mutable state in core (no caches outside `World`). The one exception is scratch buffers (e.g. the `out` array for `neighbors`), which are overwritten on every use and never carry data between calls.
- A system is a function `(world, ctx) => void` in its own file under `core/systems/`. It does one job.
- State changes only happen inside systems or `applyCommands`. AI only **queues commands**.
- Every state change that the client must see is recorded in the delta (`ctx.delta`). A missing delta record shows up as a rendering bug, so the delta tests check for it.

## 4. Performance rules

These apply to hot paths: anything called per tile, per ship or per tick.

- **No allocation in hot loops.** Reuse scratch arrays (e.g. the `out` parameter of `neighbors`). No `map/filter/reduce`, spread or closures inside per-tile loops.
- Use **typed arrays** for anything per tile or per entity.
- **No full-map scans per tick.** Keep incremental structures instead: frontiers, border sets, spatial hashes.
- Use **numbers, not objects**, as keys and ids in hot code.
- Measure before optimizing anything that isn't on this list. `tests/bench/` has benchmarks for the attack system and ship movement. Don't merge something that makes them more than 10% slower without a reason.

Outside hot paths (UI, setup, tools), write the clearest code. Readability wins there.

## 5. Client rules (`src/client`)

- **The client never mutates game state.** It sends commands through `SimBridge` and draws what deltas say.
- The renderer reads `ClientStore`, and the UI reads `ClientStore` signals. The UI and the renderer don't call each other.
- Pixi objects are created once and reused (pooling for ships and effects). Never create sprites per frame.
- Every texture and sprite comes from the atlas. No loose images loaded at runtime in-game.
- All user-facing text goes through `client/ui/strings.ts`, to make translation possible later.
- Keyboard shortcuts are defined in one table (`client/input/keymap.ts`), so they can be remapped later.

## 6. Data and content

- Content (bodies, nations, difficulties, costs) lives in `src/data` as typed `const` objects with `satisfies` checks, not in JSON files without types.
- Changing a balance number is a one-line change in `data/balance.ts`. If it isn't, the code needs refactoring.
- Art, sounds and map sources must have a license that allows commercial use on Steam. Record the source and license of every third-party asset in `assets/CREDITS.md`.
- No assets, names or code copied from OpenFront or other games.

## 7. Errors and logging

- Validate **at the edges** (commands, loaded saves, worker messages). Inside core, trust the types and the validated state.
- Invalid commands: dropped in release, logged with the reason in debug.
- Use `assert(cond, msg)` from `core/debug.ts` for "can't happen" invariants. It is active in dev and tests, and stripped in release builds.
- No `console.log` left in committed code. Use `log.debug/info/warn/error` from `shared/log.ts`.

## 8. Testing

| What         | How                                                                                               | Required                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Core systems | Vitest unit tests with small hand-built worlds                                                    | For every system, and every bug fix gets a test                                 |
| Determinism  | Run a match twice with the same seed and scripted commands. Hashes must match at every 50th tick. | Always on in CI                                                                 |
| Replays      | Committed replay files in `tests/replays/`. Each must reach its recorded final hash.              | Update the hashes only when a gameplay change is intended, and say so in the PR |
| Commands     | Valid and invalid cases for each command type                                                     | For every command                                                               |
| AI           | Bot-vs-bot matches finish without errors and end with a winner within a tick limit                | From M3                                                                         |
| Client       | Playwright smoke test: load page, start match, place spawn, see territory grow                    | From M1                                                                         |
| Benchmarks   | `tests/bench/`                                                                                    | Run before merging perf-sensitive changes                                       |

Tests live next to the code as `*.test.ts`, except cross-module tests in `tests/`.

## 9. Git workflow

- `main` is always playable. Do work on branches: `feat/…`, `fix/…`, `refactor/…`, `docs/…`.
- **Conventional Commits:** `feat(core): add corona decay`, `fix(render): border flicker on zoom`.
- Scopes: `core`, `ai`, `worker`, `render`, `ui`, `input`, `data`, `tools`, `desktop`, `server`, `docs`.
- Keep pull requests small and focused, ideally one feature or one fix. A PR must:
  - pass `npm run check` (types, lint, tests)
  - include tests for core changes
  - mention any balance changes and replay-hash updates in the description
  - update docs when architecture or rules change

## 10. Scripts (target)

| Script             | Does                                                        |
| ------------------ | ----------------------------------------------------------- |
| `npm run dev`      | Vite dev server                                             |
| `npm run build`    | Production build into `dist/`                               |
| `npm run check`    | `typecheck` + `lint` + `test`. Run before every commit.     |
| `npm run test`     | Vitest                                                      |
| `npm run bench`    | Benchmarks                                                  |
| `npm run e2e`      | Playwright smoke tests                                      |
| `npm run mapgen`   | Regenerate the Earth map (`public/maps/earth`, `docs/maps`) |
| `npm run gen:trig` | Regenerate the sine lookup table                            |

## 11. Documentation

- Every exported function or type in core gets a short doc comment saying **what** it does and anything surprising. Don't restate the type signature.
- Comments explain **why**, not what.
- Gameplay rules belong in `GAMEPLAY_PLAN.md`, structure in `ARCHITECTURE.md`, rules in this file. Keep them in sync with the code.
