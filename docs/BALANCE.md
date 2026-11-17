# SpaceFront — Balance Notes

The numbers live in [`src/data/balance.ts`](../src/data/balance.ts) and [`src/data/bodies.ts`](../src/data/bodies.ts). This file explains what they are meant to produce, so a change can be checked against intent. Time is in ticks: **10 ticks = 1 second**.

Last pass: M2 (economy). Nothing here has been tested with real players yet.

---

## Population

| Number            | Value                                                                  | Effect                                        |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| Cap               | 5,000 + 50 per tile + 3,000 per Habitat                                | A fresh spawn (41 tiles) caps at about 7,000  |
| Growth            | (10 + 0.3% of population) × room left under the cap, per tick          | Fast when small, slows near the cap           |
| Over the cap      | shrinks by 1% of the surplus per tick                                  | Losing land drains people slowly, not at once |
| Troops vs workers | default 60% troops; shifts 1% of population per tick toward the slider |                                               |

World growth modifiers multiply growth: Earth +20%, Europa +30%, Titan +10%; Mercury −20%, Venus −25%, the belt and Io −15%, Triton −20%.

## Solars (☉)

**Intended pacing:** a new player can afford a first Spaceport or Habitat within about 30–60 seconds after the spawn phase, and builds something every minute or so in the early game.

| Source          | Value                                                | Example                                                        |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Starting Solars | 500                                                  |                                                                |
| Workers         | workers × 2 / 1000 per tick                          | 1,000 workers ≈ 20 ☉/s; 20,000 ≈ 400 ☉/s                       |
| Habitat         | +2 ☉ per tick each (20 ☉/s)                          | Pays back its 800 ☉ in 40 s on income alone                    |
| Trade           | 60 + 0.06 per space unit of route, to **both** sides | Earth↔Mars ≈ 60 + 0.06 × 1,500–6,000 ≈ 150–420 ☉ per Freighter |

World income modifiers multiply worker income: Io +50%, Triton +30%, the belt +25%, Titan +15%, Mercury +10%.

## Structures

| Structure | Cost  | Build time | Notes                                             |
| --------- | ----- | ---------- | ------------------------------------------------- |
| Spaceport | 1,000 | 5 s        | Launches landers; sends a Freighter every 20–30 s |
| Habitat   | 800   | 4 s        | +3,000 population cap, +2 ☉/tick                  |

- Each structure of the same kind you already own makes the next one cost **+50%** (1,000 → 1,500 → 2,000 …). Linear, not doubling, so late-game building stays possible.
- The Moon builds at 70% cost.
- Structures must be at least 6 steps apart on a map.

## Trade

- Every finished Spaceport sends a Freighter every 200–300 ticks to a random Spaceport of **another** faction.
- Both owners are paid on arrival, so trade is never zero-sum. Longer routes pay more, which rewards trading across the solar system.
- A Freighter whose destination was captured by its own side on the way pays nothing.
- Freighters fly at 10 space units per tick (landers: 8).

## Combat

| Number         | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Neutral tile   | 8 troops (× terrain: plains 100%, highlands 150%, ice 175%, mountains 250%)               |
| Enemy tile     | 12 + 120% of the defender's troops per tile (× terrain × the world's defense: Venus 140%) |
| Defender loses | 80% of their troops per tile, for each tile taken                                         |
| Landing        | 10 troops to take the landing tile                                                        |

## Bots

- Decide every 1–1.5 s. Mostly expand; sometimes attack neighbors with under 70% of their troops.
- Build: a first Spaceport with a 10% chance per decision when they can afford it, and Habitats with a 5% chance. This gives the player trade partners.
- They never launch landers.

## Checks

- **M2 goal test** (`src/core/systems/economy.test.ts`): over 10 minutes, a faction that builds a Spaceport and three Habitats and trades ends with about 3.6× the Solars (counting what it spent) and 2.3× the population of one that does nothing.
- **Solar-system soak test** (`tests/soak/solarSystem.test.ts`): 40 bots for 5 minutes build about 45 Spaceports and 250 Habitats. That is a lot of Habitats; watch it when nations arrive (M3).
