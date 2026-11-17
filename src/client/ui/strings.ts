/** All user-facing text (CODING_STANDARDS.md §5), so the game can be translated later. */
export const strings = {
  title: "SpaceFront",
  tagline: "Conquer the solar system, one world at a time.",
  play: "Play",
  playAgain: "Play again",
  menuHelp:
    "Click land to spawn · click to attack · build a Spaceport to launch landers · claim the Corona around the Sun with a Sun Base · drag to pan · scroll to zoom",
  loading: "Loading the solar system…",
  solarSystem: "Solar System",
  systemView: (key: string) => `System view (${key})`,
  systemHint: "Click a world to open its map · click the Corona to play it here",
  corona: "Corona",
  coronaStat: (tiles: string, troops: string) => `${tiles} tiles · ${troops} troops`,
  launchSunBase: (key: string) => `Sun Base (${key})`,
  sunBaseInfo:
    "Fly a Sun Base to an empty Corona tile: it claims the area, trains Corona troops and works as a Spaceport",
  sunBaseHint:
    "Click an empty tile in the Corona ring around the Sun · carries the attack % of your troops · Esc to cancel",
  buildSolarSiphon: (key: string) => `Siphon (${key})`,
  solarSiphonInfo:
    "Drains Solars from the Sun: ×3 in the inner band, ×2 middle, ×1 outer · each extra siphon pays a bit less",
  solarSiphonHint: "Click your own Corona land (inner band pays most) · Esc to cancel",
  buildSpaceport: (key: string) => `Spaceport (${key})`,
  buildHabitat: (key: string) => `Habitat (${key})`,
  cost: (solars: string) => `${solars} ☉`,
  solars: "Solars",
  spaceportInfo: "Launches landers and trades with other factions' Spaceports",
  habitatInfo: "+3K population cap and +2 ☉ per tick",
  habitatHint: "Click your own land to place a Habitat · Esc to cancel",
  launchLander: (key: string) => `Lander (${key})`,
  needSpaceport: "Build a Spaceport and wait for it to finish",
  buildHint: "Click your own land to place a Spaceport · Esc to cancel",
  modifier: (name: string, pct: number) => `${pct > 100 ? "+" : ""}${pct - 100}% ${name}`,
  modifierNames: {
    incomePct: "income",
    growthPct: "growth",
    defensePct: "defense",
    buildCostPct: "build cost",
  },
  launchHint:
    "Click a target on any world (open the System view to pick one) · uses the attack % · Esc to cancel",
  troops: "Troops",
  workers: "Workers",
  land: "Land",
  attackRatio: "Attack with",
  troopRatio: "Troops vs workers",
  leaderboard: "Leaderboard",
  you: "You",
  spawnPhase: (seconds: number) =>
    `Click on land to choose your start · any world works (System view: M) · ${seconds}s`,
  spawnNow: "Click on land to spawn",
  landGoal: (pct: number, goal: number) => `${pct.toFixed(1)}% of ${goal}%`,
  victory: "Victory!",
  victoryText: (goal: number) => `You control ${goal}% of the solar system's land.`,
  defeat: "Defeated",
  defeatText: "Your territory has fallen.",
  winnerText: (name: string, goal: number) =>
    `${name} controls ${goal}% of the solar system's land.`,
  error: (message: string) => `Something went wrong: ${message}`,
  sharedVictory: "Shared victory!",
  sharedVictoryText: (name: string) => `You and your ally ${name} hold the solar system together.`,

  // Match setup
  difficulty: "Difficulty",

  // Diplomacy
  diplomacyHint: "Click a name on the leaderboard (or right-click territory) for diplomacy",
  allies: "Allies",
  noAllies: "No allies yet",
  nation: (tier: number) => `Nation · Tier ${tier}`,
  colonyOf: (home: string) => `Colony of ${home}`,
  bot: "Drifter (bot)",
  traitor: "Traitor",
  allied: "Allied",
  embargoed: "Embargo",
  askAlliance: "Ask to ally",
  asked: "Asked…",
  acceptAlliance: "Accept alliance",
  decline: "Ignore",
  breakAlliance: "Break alliance",
  breakWarning: "You'll be a traitor for 2 minutes: attacks cost more and nations distrust you",
  giftSolars: (amount: string) => `Gift ${amount} ☉`,
  giftTroops: (amount: string) => `Gift ${amount} troops`,
  embargo: "Embargo",
  liftEmbargo: "Lift embargo",
  signalPeace: "Peace?",
  signalAttack: "Allies: attack them!",
  signalHelp: "Help!",
  close: "Close",
  botsNeverAlly: "Drifters never ally",
  noticeAllyRequest: (name: string) => `${name} asks for an alliance`,
  noticeAllied: (name: string) => `You and ${name} are now allies`,
  noticeBetrayed: (name: string) => `${name} broke your alliance!`,
  noticeYouBroke: (name: string) => `You broke your alliance with ${name}: traitor for 2 minutes`,
  noticeGift: (name: string, solars: number, troops: number) =>
    `${name} sent you ${[solars > 0 ? `${solars} ☉` : "", troops > 0 ? `${troops} troops` : ""]
      .filter(Boolean)
      .join(" and ")}`,
  noticeEmbargo: (name: string, on: boolean) =>
    on ? `${name} stopped trading with you` : `${name} lifted its embargo`,
  noticeSignal: (name: string, signal: "help" | "attack" | "peace", about: string) =>
    signal === "help"
      ? `${name}: Help!`
      : signal === "attack"
        ? `${name}: Attack ${about}!`
        : `${name}: Peace?`,
  noticeIndependent: (name: string) => `${name} declared independence`,

  // Combat (M4)
  buildShield: (key: string) => `Shield (${key})`,
  shieldInfo: "Attacks on your land within 10 steps cost the attacker twice the troops",
  shieldHint: "Click your own land near a border to place a Shield Generator · Esc to cancel",
  buildOrbitalDefense: (key: string) => `Orbital Def. (${key})`,
  orbitalDefenseInfo:
    "Shoots down incoming warheads near this world and damages enemy landers and Warships",
  orbitalDefenseHint: "Click your own land on the world to defend · Esc to cancel",
  buildLaunchSilo: (key: string) => `Silo (${key})`,
  launchSiloInfo: "Fires Kinetic Strikes and Antimatter Warheads; reloads for 30 s after each",
  launchSiloHint: "Click your own land to place a Launch Silo · Esc to cancel",
  launchWarship: (key: string) => `Warship (${key})`,
  warshipInfo:
    "Patrols an area of space and shoots enemy landers, Freighters, Sun Base ships, Warships and Solar Siphons",
  warshipHint:
    "System view: click a world to guard it, or empty space to patrol there · Esc to cancel",
  patrolHint:
    "Warship selected: click a world to guard it, or empty space to patrol there · Esc to cancel",
  nextWarship: (key: string) => `Next warship (${key})`,
  fireKinetic: (key: string) => `Kinetic (${key})`,
  kineticInfo: "Cheap: destroys structures and kills troops within 2 steps",
  kineticHint: "Click an enemy target on any map (the Corona too) · Esc to cancel",
  fireAntimatter: (key: string) => `Antimatter (${key})`,
  antimatterInfo:
    "Wipes all territory within 10 steps and leaves it irradiated for 5 minutes · everyone is warned",
  antimatterHint: "Click enemy land on any map · everyone will be warned · Esc to cancel",
  needSilo: "Build a Launch Silo and wait for it to finish (and reload)",
  weaponNames: { kineticStrike: "Kinetic Strike", antimatterWarhead: "Antimatter Warhead" },
  alertWeapon: (by: string, weapon: string, world: string, seconds: number) =>
    `⚠ ${by} fired an ${weapon} at ${world} (${seconds}s)`,
  noticeIntercepted: (weapon: string, by: string) =>
    `${by}'s Orbital Defense shot down a ${weapon}`,
  noticeWeaponHit: (weapon: string, world: string) => `A ${weapon} hit ${world}`,
  warshipsStat: (n: number) => `${n}`,
  warships: "Warships",

  // Menus (M5)
  newGame: "New game",
  tutorial: "Tutorial",
  tutorialTagline: "Learn to spawn, expand, build, launch and use the system view",
  loadGame: "Load game",
  replays: "Replays",
  settings: "Settings",
  back: "Back",
  start: "Start",
  resume: "Resume",
  quitToMenu: "Quit to menu",
  menu: "Menu",
  paused: "Paused",
  pausedHint: (key: string) => `Paused · ${key} to resume`,
  restartNow: "Restart now",
  saveGame: "Save game",
  gameSaved: "Game saved",
  quickSaved: "Quick save done",
  saveFailed: "Saving failed",
  replaySaved: "Replay saved",
  saveReplay: "Save replay",
  noSaves: "No saved games yet. Save from the in-game menu (Esc) or with the quick-save key.",
  noReplays: "No replays yet. Save one when a match ends, or from the in-game menu.",
  load: "Load",
  watch: "Watch",
  delete: "Delete",
  quickSave: "Quick save",
  entryInfo: (difficulty: string, time: string, landPct: number) =>
    `${difficulty} · ${time} played · ${landPct.toFixed(1)}% of the land`,
  savedOn: (when: string) => when,
  replay: "Replay",
  replaySpeed: (speed: number) => `${speed}×`,
  replayFinished: "Replay finished",
  replayOutOfSync:
    "This replay was recorded with another version of the game, so it may have played out differently.",
  replayInSync: "The match played out exactly as recorded.",
  watchingReplay: "Watching a replay",

  // Settings
  audio: "Audio",
  masterVolume: "Master volume",
  musicVolume: "Music",
  sfxVolume: "Sound effects",
  graphics: "Graphics",
  quality: { low: "Low (fast)", high: "High" } as Record<"low" | "high", string>,
  qualityHint: "Low draws fewer stars and effects at a lower resolution · applies after a restart",
  keys: "Keys",
  keysHint: "Click a key, then press the new one (Esc cancels)",
  pressKey: "Press a key…",
  resetKeys: "Reset keys",
  keyConflict: "This key is used twice",
  keyActions: {
    cancel: "Cancel / menu",
    toggleSystemView: "System view",
    buildSpaceport: "Spaceport",
    buildHabitat: "Habitat",
    launchLander: "Troop Lander",
    launchSunBase: "Sun Base",
    buildSolarSiphon: "Solar Siphon",
    buildShield: "Shield Generator",
    buildOrbitalDefense: "Orbital Defense",
    buildLaunchSilo: "Launch Silo",
    launchWarship: "Warship",
    nextWarship: "Next Warship",
    fireKinetic: "Kinetic Strike",
    fireAntimatter: "Antimatter Warhead",
    pause: "Pause",
    quickSave: "Quick save",
  } as Record<string, string>,

  // Tutorial
  tutorialTitle: (step: number, total: number) => `Tutorial · ${step} of ${total}`,
  tutorialNext: "Next",
  tutorialSkip: "Skip tutorial",
  tutorialFinish: "Finish",
  tutorialSteps: [
    {
      title: "Welcome to SpaceFront",
      text: () =>
        "You start on one world and conquer the solar system. This map is Earth: drag to move it, scroll to zoom.",
    },
    {
      title: "Pick your start",
      text: () =>
        "Click on land (green, tan or gray) to place your first territory. Any world works, but stay on Earth for now.",
    },
    {
      title: "Expand",
      text: () =>
        'Click neutral land next to your border to send troops into it. The "Attack with" slider sets how many go. Grow to 300 tiles.',
    },
    {
      title: "Build a Spaceport",
      text: (key: string) =>
        `Press ${key} (or the Spaceport button), then click your own land. Structures cost Solars (☉), which your workers earn.`,
    },
    {
      title: "Wait for it",
      text: () =>
        "The Spaceport is being built: it looks faded until it's done. Keep expanding meanwhile.",
    },
    {
      title: "The system view",
      text: (key: string) =>
        `Press ${key} to zoom out to the whole solar system. Worlds move on their orbits; each icon is a map you can open.`,
    },
    {
      title: "Launch a Troop Lander",
      text: (key: string) =>
        `Press ${key}, click a world's icon to open its map, then click land there. The lander carries the attack share of your troops.`,
    },
    {
      title: "You're ready",
      text: () =>
        "Your lander is on its way. Next: Habitats grow your population, the Corona around the Sun pays the most, and Warships and weapons settle wars. Good luck!",
    },
  ],
};
