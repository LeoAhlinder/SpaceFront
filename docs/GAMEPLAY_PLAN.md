# SpaceFront — Gameplay Plan

_A real-time territory-conquest strategy game set in our solar system. It is inspired by the genre of browser .io conquest games like OpenFront, with its own name, art and identity._

Decisions so far:

| Topic     | Decision                                                                                  |
| --------- | ----------------------------------------------------------------------------------------- |
| Platform  | 2D sprites in the browser first, packaged later as a desktop app for Steam                |
| Players   | Single-player vs AI first; the simulation is built so online lobbies can be added later   |
| Map       | One zoomable solar-system map, planets slowly orbit the Sun                               |
| Opponents | Dumb bots on every planet + Earth nations (and their colonies) that scale with difficulty |
| Currency  | **Solars** (☉) — the only currency                                                        |

---

## 1. Design pillars

1. **Readable in 5 seconds.** You see colored territory spreading across planets, and spacecraft streaking between them.
2. **Easy to start, hard to master.** Expanding takes one click. Timing, economy and diplomacy decide who wins.
3. **Space changes the map.** Because planets orbit, the closest route between two planets keeps changing. A target that is far away now may be close in a few minutes.
4. **Short matches.** 20–40 minutes per match.

---

## 2. The map: one solar system

### Layout

- One continuous 2D map with the **Sun** at the center and planets on circular orbits.
- Distances and orbit times are **compressed** so the game stays playable. Distances are roughly log-scaled, and one Earth orbit takes about 15 minutes of game time. Inner planets orbit faster, so Mercury and Venus "sweep" past Earth.
- Every **landable body is a disc of pixel tiles**, like an island. Territory spreads across tiles. Empty space works like the ocean: land troops cannot cross it, only spacecraft can.
- Zooming in shows a planet's terrain. Zooming out shows the whole system with territory colors and ship icons.

### Bodies (first version)

| Body                              | Size    | Terrain feel                            | Modifier                                              |
| --------------------------------- | ------- | --------------------------------------- | ----------------------------------------------------- |
| Mercury                           | S       | Scorched rock                           | Close to the Sun → cheaper Solar Siphons, −pop growth |
| Venus                             | M       | Acid clouds                             | Slow troop growth, strong natural defense             |
| **Earth**                         | L       | Real continents (real-world projection) | Best pop growth, home of the nations                  |
| Moon                              | S       | Regolith                                | Cheap spaceports, low gravity → fast launches         |
| Mars                              | M       | Red desert                              | Balanced, the main "second front"                     |
| Asteroid Belt                     | many XS | Rock clusters                           | Good income, can't hold big armies                    |
| Io / Europa / Ganymede / Callisto | S       | Jupiter moons                           | Europa: +growth (ice), Io: +income (volcanic)         |
| Titan / Enceladus                 | S       | Saturn moons                            | Titan: large, rich                                    |
| Triton                            | XS      | Neptune moon                            | Remote outpost far from everyone                      |

- **Gas giants** (Jupiter, Saturn, Uranus, Neptune) can't be landed on in the first version. They are big obstacles that ships have to fly around. Later idea: gas-skimmer stations.
- **The Sun** can't be inhabited. It has a **heat zone** that damages ships passing too close. Around it lies the **Corona**, a ring of claimable space territory where players build Sun Bases and Solar Siphons (see §5).

---

## 3. Core gameplay loop

1. **Spawn.** At match start, pick a starting spot on any landable body, or get one at random. Earth is crowded and rich. Outer moons are safe but small.
2. **Expand.** Send a percentage of your troops into neighboring empty tiles or into enemy territory using the **attack ratio slider**. Empty land is cheap to take. Enemy land costs troops depending on how strong their defense is.
3. **Grow.** Your population regenerates faster the more land you own, up to a cap. Population is split between **troops** (fight) and **workers** (earn Solars). A second slider sets this split.
4. **Earn and build.** Spend Solars on structures and spacecraft.
5. **Leave the planet.** Build a **Spaceport** and launch **Troop Landers** to invade other bodies.
6. **Go for the Sun.** Send Sun Bases into the Corona, claim territory there, and build Solar Siphons for a much bigger income (§5).
7. **Win.** Control **80% of all landable tiles**, or be the last one standing. Corona tiles don't count toward the 80%: the Sun is an economic prize, not a shortcut to victory.

---

## 4. Factions

### Players

You, at first. Later, online human players.

### Bots ("Drifters")

- Spawn as many small factions on **every** body, filling the map like the dumb bots in the genre.
- They are intentionally dumb: they expand randomly, never build spacecraft, rarely attack anyone bigger, and never ally.
- They act as early-game food and padding between the stronger factions.

### Nations

- **On Earth:** real countries spawn in their real-world locations on the Earth map.
- **On other bodies:** colonies of Earth nations spawn there, e.g. _USA Mars Colony_, _China Lunar Base_, _ESA Europa Station_, _Japan Titan Outpost_.
- A colony is a separate AI faction that starts **allied with its home nation**. Breaking that alliance (or the home nation dying) turns it independent.
- Nations build structures and spacecraft, form alliances, betray players, and gang up on whoever is leading.

### Difficulty scaling

Difficulty controls **which** countries show up, **how many**, and **how smart and strong** they are.

| Difficulty | Nations present                                                               | AI behavior                                                           | Bonuses                            |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| Easy       | ~6 smaller nations, few colonies                                              | Passive, slow to build, rarely launch ships                           | −25% growth                        |
| Normal     | ~12 nations incl. 1–2 major powers                                            | Expands steadily, defends, builds spaceports                          | none                               |
| Hard       | ~20 nations, all major space powers, colonies on Mars, Moon and Jupiter moons | Targets the weakest neighbor, uses weapons, allies against the leader | +15% growth, +income               |
| Impossible | ~30 nations, colonies everywhere                                              | Coordinated invasions, attacks Solar Siphons, uses Kinetic Strikes    | +35% growth, +income, faster build |

Country "tiers" decide when a country appears and how strong its AI is:

- **Tier 1 (space superpowers):** USA, China, Russia, EU/ESA, India.
- **Tier 2:** Japan, UK, France, Germany, Brazil, South Korea, Canada, Australia, Israel, UAE.
- **Tier 3:** everyone else on Earth. These act like stronger bots with a name and a flag.

Higher difficulty adds more Tier 1 and Tier 2 countries, gives them more colonies off Earth, and uses smarter AI profiles.

---

## 5. Economy — Solars (☉)

Solars are the **only** currency.

### Normal income (no Sun needed)

Every faction earns Solars the same way as in OpenFront, **with no siphon at all**:

| Source          | Notes                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workers         | Base income, scales with workers × land quality. The more land and population you have, the more you earn.                                                                           |
| Habitats        | Raise the population cap → more workers                                                                                                                                              |
| Freighter trade | Freighters fly automatically between your Spaceport and **another faction's** Spaceport. Both sides earn Solars, and longer trips pay more. Orbits change the trip length over time. |

You can play and win a whole match on normal income alone.

### Solar income: the big prize

The Sun is where the **big money** is. One Solar Siphon should pay about **as much as a mid-sized planet's worth of workers**, so a player holding the Sun pulls ahead fast. That makes the Sun something every serious player aims for, and something everyone else must fight over.

### The Corona: territory around the Sun

- Around the Sun lies the **Corona**, a ring of space tiles that can be **claimed like land**. The Sun itself still can't be inhabited.
- The Corona has **three bands**:

  | Band   | Siphon output | Downside                                    |
  | ------ | ------------- | ------------------------------------------- |
  | Inner  | ×3            | Heat drains troops on these tiles over time |
  | Middle | ×2            | Mild heat drain                             |
  | Outer  | ×1            | None, but low output                        |

- **Sun Bases** are how you get in (§7). You fly a **Sun Base** to an empty Corona tile. It claims a small area around itself and becomes your foothold.
- From there, your Corona territory **spreads like normal territory**, using the attack slider. There are two differences:
  - **Troops don't grow in the Corona.** Troops must be shipped in by Troop Landers from your planets, or come from Sun Bases.
  - **You can only expand from tiles connected to a Sun Base.** If an enemy destroys or captures the base, the territory cut off from it slowly decays back to neutral.
- Several players can hold different parts of the Corona at once, so the border fights spill around the Sun.

### The Solar Siphon (energy drainer)

- Can only be built **inside your own Corona territory**.
- Its output depends on the **band** it sits in, and each extra siphon you own pays a bit less than the previous one (diminishing returns). That stops a single player from owning the whole Sun economy forever.
- **Capturing Corona tiles with a siphon on them captures the siphon.** Taking enemy Sun territory pays off directly.
- Warships and weapons can also destroy siphons from space.
- Factions near the Sun (Mercury, Venus) get there fast. Factions in the outer system must commit to long, risky trips.
- Later idea: _Solar Flare_ events that temporarily boost output or burn troops in the inner band.

### What you spend Solars on

Structures, spacecraft and weapons (below). Prices rise with how many of that thing you already own, which keeps spamming in check.

---

## 6. Spacecraft (instead of naval ships)

| Ship              | Role     | Behavior                                                                                                                      |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Troop Lander**  | Invasion | Carries a chunk of your troops to a target body. Lands and starts an attack at the landing spot. Can be shot down on the way. |
| **Freighter**     | Trade    | Flies automatically between Spaceports and earns Solars. A prime target for Warships.                                         |
| **Warship**       | Combat   | Patrols an area of space and attacks enemy Landers, Freighters and Siphons.                                                   |
| **Sun Base ship** | Builder  | Carries a Sun Base to an empty Corona tile. It becomes a base on arrival.                                                     |

Movement rules:

- Ships fly between bodies on **curved transfer paths**. The game picks the route, and players only choose the destination.
- The **Sun's heat zone** and **gas giants** block straight-line paths, so routes bend around them.
- Since bodies keep moving, the game aims at **where the target will be** when the ship arrives, and the UI shows the arrival time.

---

## 7. Structures

| Structure                    | Effect                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spaceport**                | Required to launch any spacecraft. Also the endpoint for trade.                                                                                                                                                     |
| **Habitat**                  | +population cap, +income                                                                                                                                                                                            |
| **Shield Generator**         | Boosts defense in a radius, so attackers lose more troops                                                                                                                                                           |
| **Orbital Defense Platform** | Shoots down incoming ships and warheads near the body                                                                                                                                                               |
| **Launch Silo**              | Fires weapons (below)                                                                                                                                                                                               |
| **Mass Driver** _(later)_    | Fast transport link between your own bodies                                                                                                                                                                         |
| **Sun Base**                 | Corona only. Claims territory around itself, lets your Corona territory spread, slowly trains a few troops on the spot, and works as a Spaceport for Landers. Expensive, and the price rises with each one you own. |
| **Solar Siphon**             | Corona only. Drains Solars from the Sun, with output set by its band (§5)                                                                                                                                           |

---

## 8. Weapons (late game)

| Weapon                       | Effect                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kinetic Strike**           | A cheap tungsten rod. Destroys structures and kills troops in a small radius.                                                              |
| **Antimatter Warhead**       | Big radius. Wipes out territory and leaves it "irradiated", so it grows slowly for a while.                                                |
| **Planet Cracker** _(maybe)_ | Very expensive, slow to charge, and visible to everyone. Scars a large part of a body for good. A dramatic late-game comeback or finisher. |

Orbital Defense Platforms can shoot down warheads in flight. Big weapons are announced to everyone, so players can react.

---

## 9. Diplomacy

- **Alliances:** request, accept, break. Allies can't attack each other and share a win.
- **Betrayal:** breaking an alliance marks you as a _traitor_ for a while. Nations distrust you, and you get a combat penalty.
- **Quick signals:** emoji/icon messages ("Help!", "Attack them", "Peace?").
- **Gifting:** send Solars or troops to an ally.
- **Embargo:** stop trade with a faction.
- Nation AI remembers betrayals and holds grudges.

---

## 10. Match flow

| Phase          | Time      | What happens                                                                       |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| Spawn          | 0:00–0:30 | Pick a starting spot                                                               |
| Land grab      | 0:30–5:00 | Expand across your home body, eat bots                                             |
| Planetary wars | 5–15 min  | Fight neighbors, build the first Spaceport and trade                               |
| Space race     | 10–25 min | Invade other bodies, send the first Sun Bases, build siphons, Warship battles      |
| Corona wars    | 20 min+   | Fight over Sun territory. Whoever holds the inner bands has the strongest economy. |
| Endgame        | 25 min+   | Weapons, big alliances against the leader, push to 80%                             |

---

## 11. Technical plan

### Stack (browser first)

| Layer      | Choice                                       | Why                                                           |
| ---------- | -------------------------------------------- | ------------------------------------------------------------- |
| Language   | **TypeScript**                               | One codebase for browser, desktop, and a future server        |
| Build      | **Vite**                                     | Fast dev server, simple builds                                |
| Rendering  | **PixiJS** (WebGL 2D)                        | Fast sprites, handles a big zoomable tile map                 |
| Simulation | Pure TS in a **Web Worker**                  | Keeps the UI smooth. The same code can run on a server later. |
| UI         | Plain DOM or a small framework (e.g. Preact) | Menus, sliders and panels sit on top of the canvas            |

### Simulation rules that keep multiplayer possible later

- **Fixed tick rate** (e.g. 10 ticks/second), with rendering interpolated between ticks.
- **Deterministic:** seeded random numbers only, integer or fixed-point math in the simulation, no `Math.random()` and no timers inside the sim.
- All player actions are **commands** (`attack`, `build`, `launch`, …) that go into the simulation. In single-player they come from the local UI. Later they arrive over the network (lockstep) with no rewrite.
- Territory is stored in typed arrays per body, which is fast and easy to send over the network.

### Desktop / Steam

- **Electron + steamworks.js** is the most proven route to Steam for a web game (achievements, overlay, cloud saves). Many web-based Steam games ship this way.
- **Tauri** is a lighter option (smaller download), but Steam overlay support is weaker.
- Recommendation: build for the browser, and add an Electron wrapper at the polish milestone.

### Licensing note

OpenFront's code is open source under a copyleft license (AGPL, as far as I know; check their repo). Copying its code would force SpaceFront to use the same license and publish its source. The plan assumes **SpaceFront is written from scratch** with its own name, sprites and UI, and only borrows _genre mechanics_. That keeps every licensing and Steam option open.

---

## 12. Milestones

| #    | Milestone          | Done when                                                                                     |
| ---- | ------------------ | --------------------------------------------------------------------------------------------- |
| M0   | **Prototype**      | Earth only: tile map, territory spreading, attack slider, dumb bots, rendering in the browser |
| M1   | **Solar system**   | All bodies on orbits, zoom/pan, Spaceports + Troop Landers between bodies                     |
| M2   | **Economy**        | Solars, workers/troops split, Habitats, Freighter trade                                       |
| M2.5 | **The Corona**     | Corona tiles and bands, Sun Bases, Corona territory spread and decay, **Solar Siphons**       |
| M3   | **Nations**        | Earth countries + colonies, AI profiles, difficulty levels, alliances                         |
| M4   | **Combat depth**   | Warships, Shield Generators, Orbital Defense, Kinetic Strike, Antimatter Warhead              |
| M5   | **Polish**         | Sprites, sound, menus, tutorial, save/load, balance pass, Electron build                      |
| M6   | **Steam + online** | Steamworks integration, store page, then online lobbies                                       |

---

## 13. Open questions (for later)

- Should players be able to colonize gas giants with floating stations?
- Random events (solar flares, meteor showers, comets passing through)?
- Custom maps: other star systems, or fictional ones?
- Monetization for the Steam version: one-time purchase vs free with cosmetics?
