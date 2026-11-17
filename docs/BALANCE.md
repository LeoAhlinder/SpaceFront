# SpaceFront — Balance Notes

The numbers live in [`src/data/balance.ts`](../src/data/balance.ts), [`src/data/bodies.ts`](../src/data/bodies.ts) and [`src/data/difficulty.ts`](../src/data/difficulty.ts). This file explains what they are meant to produce, so a change can be checked against intent. Time is in ticks: **10 ticks = 1 second**.

Last pass: M3 (nations and difficulty). Nothing here has been tested with real players yet.

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
| Solar Siphon    | 50 ☉ per tick × band (inner ×3, middle ×2, outer ×1) | See _The Corona_ below                                         |
| Trade           | 60 + 0.06 per space unit of route, to **both** sides | Earth↔Mars ≈ 60 + 0.06 × 1,500–6,000 ≈ 150–420 ☉ per Freighter |

World income modifiers multiply worker income: Io +50%, Triton +30%, the belt +25%, Titan +15%, Mercury +10%.

## Structures

| Structure | Cost   | Build time | Notes                                             |
| --------- | ------ | ---------- | ------------------------------------------------- |
| Spaceport | 1,000  | 5 s        | Launches landers; sends a Freighter every 20–30 s |
| Habitat   | 800    | 4 s        | +3,000 population cap, +2 ☉/tick                  |
| Sun Base  | 5,000  | on arrival | Paid at launch; ships in flight count as owned    |
| Siphon    | 20,000 | 6 s        | Only on your own Corona land                      |

- Each structure of the same kind you already own makes the next one cost **+50%** (1,000 → 1,500 → 2,000 …). Linear, not doubling, so late-game building stays possible.
- The Moon builds at 70% cost.
- Structures must be at least 6 steps apart on a map.

## Trade

- Every finished Spaceport sends a Freighter every 200–300 ticks to a random Spaceport of **another** faction.
- Both owners are paid on arrival, so trade is never zero-sum. Longer routes pay more, which rewards trading across the solar system.
- A Freighter whose destination was captured by its own side on the way pays nothing.
- Freighters fly at 10 space units per tick (landers: 8).

## The Corona

**Intent:** the Sun is the big prize (GAMEPLAY_PLAN.md §5). One siphon should pay about as much as **a mid-sized planet's worth of workers**. Measured in the solar-system soak (40 bots, 10 minutes), a bot holding about 16,000 tiles (the size of a mid-sized world like Ganymede) earns about **100 ☉ per tick** from workers; most bots earn far less, because they spend troops on expansion. So a **middle-band siphon pays 100 ☉/tick**, an outer one 50 and an inner one 150.

| Number            | Value                                                                    | Effect                                                               |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Grid              | 24 rings × 256 sectors; rings 0–7 inner, 8–15 middle, 16–23 outer        | 6,144 tiles between the heat zone (650) and Mercury (1150)           |
| Sun Base claim    | Neutral tiles within 3 steps                                             | 25 tiles in open space                                               |
| Sun Base training | +20 Corona troops per base every second, up to 1,500 per base            | Slow: landers are the fast way in                                    |
| Heat              | Every second, inner tiles drain 2% and middle 0.8% of the troops on them | One inner base levels off near 1,000 troops; outer at 1,500          |
| Decay             | Cut-off Corona tiles turn neutral, 3 per second per faction              | Losing your base loses the land over a minute or so                  |
| Siphon output     | 50 ☉/tick × band; the n-th best siphon pays max(25%, 100% − 15% × n)     | 1st 100%, 2nd 85%, 3rd 70% … never below 25%                         |
| Siphon cost       | 20,000 ☉, +50% per siphon owned                                          | First outer siphon pays back in 40 s (like a Habitat), inner in 13 s |

- Corona tiles add **no population** and don't count for the win. Attacks there are paid from the separate Corona troop pool (Sun Base ship cargo, landers onto your own Corona land, training), and defense density is Corona troops ÷ Corona tiles.
- A Sun Base ship carries the attack % of your troops; if its tile was taken while it flew, the ship and its troops are lost.
- Bots send a Sun Base with a 2% chance per decision (once they have a finished Spaceport and 5,000 ☉, and no base yet), and build a siphon with a 30% chance when they pick one of their Corona tiles and can afford it.

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
- They never launch landers, but now and then send a Sun Base ship (see _The Corona_).

## Diplomacy

| Number           | Value                                     | Effect                                          |
| ---------------- | ----------------------------------------- | ----------------------------------------------- |
| Alliance request | can be accepted for 30 s                  | Asking someone who asked you accepts at once    |
| Traitor mark     | 2 minutes after breaking an alliance      | Your attacks cost 130% troops; nations distrust |
| Gift buttons     | 25% of your Solars or troops, allies only | Any amount through the `gift` command           |

## Nations and difficulty

**Intent:** Easy is beatable by a new player, Impossible beats most strong players (GAMEPLAY_PLAN.md §4).

| Difficulty | Nations (Tier 1 + 2 + 3) | Colonies | Growth / income / build time | Spends troops above | Aggression | Decides every |
| ---------- | ------------------------ | -------- | ---------------------------- | ------------------- | ---------- | ------------- |
| Easy       | 0 + 1 + 5 = 6            | 1        | 75% / 100% / 100%            | 0% of its pop cap   | 15         | 3–4.5 s       |
| Normal     | 2 + 3 + 7 = 12           | 3        | 100% / 100% / 100%           | 8%                  | 35         | 2–3 s         |
| Hard       | 5 + 7 + 8 = 20           | 8        | 115% / 115% / 100%           | 30%                 | 60         | 1.2–1.8 s     |
| Impossible | 5 + 10 + 15 = 30         | 16       | 135% / 135% / 60%            | 35%                 | 80         | 0.8–1.2 s     |

- **Head start by tier:** Tier 1 nations claim 3 extra steps of land at spawn and start with 250% of the normal troops and workers, Tier 2 2 steps and 175%, Tier 3 1 step and 125%. Colonies start like Tier 3.
- **Tier profiles:** Tier 2 has ¾ of Tier 1's spacefaring; Tier 3 builds half as much, has ¼ of the spacefaring and never raids siphons.
- **Spending floor** (`spendAbovePopPct`): a nation only sends troops out (attacks, landers) while its population is above this share of its cap. Growth is fastest a bit below half the cap, so a nation that keeps its population there and spends only the surplus outgrows one that spends everything. This is the strongest difficulty lever: in the AI-vs-AI test, going from 0% to 15% on Normal took the nations from ≈ 25% to ≈ 85% of all land in 10 minutes, so Normal uses 8%.
- **Leader:** whoever holds the most land, at least 3% of it (≈ 13,000 tiles) and 130% of the runner-up. Hard and Impossible nations gang up on it: they won't ally with it, betray it, and prefer attacking it.
- **Grudges:** a betrayal adds 300, every decision under attack adds 4 (up to 60), and grudges fade by 1 per decision. A nation won't ally with someone it holds more than 30 against.
- **Wars:** a nation attacks a neighbor whose troop density is below `attackWeakerThanPct` of its own (50% on Easy up to 110% on Impossible), or a stronger one if it has a reason (grudge, leader, an ally's call). Bots are a little more tempting (+10).
- **Space:** landers need 2,500 troops at home; a nation keeps at most one Sun Base per 30 spacefaring (Impossible Tier 1: 2). Siphon raids need 1,500 troops.

## Checks

- **M2 goal test** (`src/core/systems/economy.test.ts`): over 10 minutes, a faction that builds a Spaceport and three Habitats and trades ends with about 3.6× the Solars (counting what it spent) and 2.3× the population of one that does nothing.
- **Solar-system soak test** (`tests/soak/solarSystem.test.ts`): 40 bots for 5 minutes (with the Corona) build about 42 Spaceports, 237 Habitats and 7 Sun Bases, at about 0.38 ms per tick. That is a lot of Habitats.
- **Difficulty test** (`tests/ai/difficulty.test.ts`): every difficulty with its nations, 40 bots and a scripted simple player in Uzbekistan for 5 minutes. Nations hold ≈ 7 / 34 / 71 / 46% of all land on Easy / Normal / Hard / Impossible and conquer ≈ 375 / 1,800 / 6,500 / 3,900 tiles each from other factions; the player ends with ≈ 6,400 tiles on Easy and 8 on Impossible. Impossible costs ≈ 0.6 ms per tick at 5 minutes and ≈ 0.85–1.1 ms at 10 minutes (46 nations build about 3,000–4,000 Habitats by then, and every structure check scans all structures: the first thing to index if AI cost grows).
- **M2.5 goal test** (`src/core/systems/corona.test.ts`): over 10 minutes, a faction with two inner siphons ends with ≈ 17× the Solars (counting what it spent) of one that stays home, and ≈ 2.7× one with two outer siphons. A lander onto its Sun Base takes everything, and the attacker then earns ≈ 40× the loser's income.
- Siphon income dwarfs worker income on small holdings. That is the design (the Sun is the prize), but it needs a check with real players, and M4's Warships are meant to keep siphons in check.
