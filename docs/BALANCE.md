# SpaceFront — Balance Notes

The numbers live in [`src/data/balance.ts`](../src/data/balance.ts), [`src/data/bodies.ts`](../src/data/bodies.ts) and [`src/data/difficulty.ts`](../src/data/difficulty.ts). This file explains what they are meant to produce, so a change can be checked against intent. Time is in ticks: **10 ticks = 1 second**.

Last pass: M4 (combat depth, balance pass 2). Nothing here has been tested with real players yet.

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

| Structure        | Cost   | Build time | Notes                                                     |
| ---------------- | ------ | ---------- | --------------------------------------------------------- |
| Spaceport        | 1,000  | 5 s        | Launches landers; sends a Freighter every 20–30 s         |
| Habitat          | 800    | 4 s        | +3,000 population cap, +2 ☉/tick                          |
| Sun Base         | 5,000  | on arrival | Paid at launch; ships in flight count as owned            |
| Siphon           | 20,000 | 6 s        | Only on your own Corona land                              |
| Shield Generator | 3,000  | 5 s        | Your land within 10 steps costs attackers 200%            |
| Orbital Defense  | 6,000  | 8 s        | Guards its world (300 space units around the body)        |
| Launch Silo      | 8,000  | 10 s       | Fires weapons; reloads 30 s after each                    |
| Warship          | 5,000  | at once    | Bought at a Spaceport or Sun Base; +50% per Warship owned |

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

## Space combat and weapons (M4)

**Intent:** combat structures are mid-game purchases (a few minutes of income each), weapons are late-game tools that need a war chest, and nothing makes a world or the Sun untouchable: one Orbital Defense stops one warhead, not a salvo, and one Warship guards one area.

| Thing              | Numbers                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hit points         | Lander 120, Freighter 60, Sun Base ship 150, Warship 300, Kinetic Strike 40, Antimatter Warhead 80, Solar Siphon 400                                                          |
| Warship            | Speed 9 (landers 8, Freighters 10, so it can chase landers but not Freighters); sees 400, fires within 160; 20 damage every 0.5 s; wanders 250 around its patrol point        |
| Orbital Defense    | Range 300 around its body; one shot per second: 40 damage to weapons, 10 to ships and Warships                                                                                |
| Weapons            | Fly at 14 units per tick (6 tiles per tick across one map); a silo reloads for 30 s                                                                                           |
| Kinetic Strike     | 4,000 ☉; radius 2 (13 tiles); destroys structures; kills 60 + 300% of the owner's troops per tile for each tile hit                                                           |
| Antimatter Warhead | 25,000 ☉; radius 10 (221 tiles); wipes land and structures; kills 200% of the owner's troops per tile for each tile; fallout for 5 minutes (retaking costs 400%, no building) |

- **What one platform can do:** a warhead spends about 21 ticks within range, so one platform gets 2–3 shots and stops a single warhead (2 hits) but not two fired together (`combat.test.ts` checks both). A lander loses about a third of its troops flying past one platform; a Warship patrolling its target's world usually destroys it.
- **Damaged landers** lose troops in proportion to their lost hit points, so defenses thin an invasion instead of being all or nothing.
- **A Warship on a siphon** destroys it in about 10 s (20 shots), so guarding the Sun matters.
- Warheads cost 25,000 (not 40,000 as first tried): at 40,000 no nation fired one in the 5-minute AI test.

### Nation AI

| Difficulty | Defense | Warships | Weapons | Strikes siphons |
| ---------- | ------- | -------- | ------- | --------------- |
| Easy       | 0       | 0        | 0       | no              |
| Normal     | 30      | 15       | 0       | no              |
| Hard       | 50      | 40       | 40      | no              |
| Impossible | 70      | 60       | 60      | yes             |

Tier 3 nations get half the defense and no Warships or weapons. A nation builds a Shield Generator near a border it is attacked across (up to 2 per 1,000 tiles) and an Orbital Defense Platform on a world where it holds 500+ tiles when hostile landers or weapons are on their way (one per world). It buys Warships to guard its first siphon, and on aggressive profiles (Hard, Impossible) up to `warships / 20` of them to hunt enemy siphons, with 90 s between purchases (without the cooldown, Hard nations re-bought about 230 Warships in 5 minutes as they lost them). With a loaded silo it fires Kinetic Strikes at the structures (silos, defenses, Spaceports) of the leader or whoever it holds a big grudge against, and Antimatter Warheads into their land; on Impossible also Kinetic Strikes at enemy siphons. Once it owns a silo it keeps a war chest: no Habitats while that would leave less than a warhead's price. A weapon hit adds a 120 grudge against the shooter.

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
- **Difficulty test** (`tests/ai/difficulty.test.ts`): every difficulty with its nations, 40 bots and a scripted simple player in Uzbekistan for 5 minutes. After M4, nations hold ≈ 7 / 32 / 53 / 39% of all land on Easy / Normal / Hard / Impossible and conquer ≈ 375 / 2,200 / 4,500 / 3,100 tiles each from other factions (M3: 7 / 34 / 71 / 46% and 375 / 1,800 / 6,500 / 3,900: Hard and Impossible nations now spend on defenses, Warships and weapons, and hurt each other with them); the player ends with ≈ 6,400 tiles on Easy and ≈ 190 on Impossible. M4 actions in those 5 minutes: Normal builds ≈ 8 platforms; Hard ≈ 4 shields, 67 platforms, 21 silos, 39 Warships, 19 Kinetic Strikes and 2 warheads; Impossible ≈ 11 shields, 55 platforms, 30 silos, 60 Warships, 61 Kinetic Strikes (50 at siphons) and 3 warheads, with 64 weapons shot down. Impossible costs ≈ 0.6 ms per tick at 5 minutes and ≈ 0.83 ms at 10 minutes (≈ 3,100 structures; the structure index removed the scans over all structures).
- **M2.5 goal test** (`src/core/systems/corona.test.ts`): over 10 minutes, a faction with two inner siphons ends with ≈ 17× the Solars (counting what it spent) of one that stays home, and ≈ 2.7× one with two outer siphons. A lander onto its Sun Base takes everything, and the attacker then earns ≈ 40× the loser's income.
- Siphon income dwarfs worker income on small holdings. That is the design (the Sun is the prize), but it needs a check with real players. Since M4, Warships and Kinetic Strikes can destroy siphons outright; Impossible nations do both.
- **Combat tests** (`src/core/systems/combat.test.ts`): a shield makes attackers pay at least 1.5× the troops per tile (200% on the base cost, before terrain); irradiated land costs more than twice as much to retake; one platform downs a lone warhead but lets one of two through; a Warship guarding Mars cuts a passing lander's troops by more than half; a Warship destroys a siphon; two hostile Warships fight until one is left.
