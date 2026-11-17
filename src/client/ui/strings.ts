/** All user-facing text (CODING_STANDARDS.md §5), so the game can be translated later. */
export const strings = {
  title: "SpaceFront",
  tagline: "Conquer the solar system, one world at a time.",
  play: "Play",
  playAgain: "Play again",
  menuHelp:
    "Click land to spawn · click to attack · build a Spaceport to launch landers · drag to pan · scroll to zoom",
  loading: "Loading the solar system…",
  solarSystem: "Solar System",
  systemView: (key: string) => `System view (${key})`,
  systemHint: "Click a world to open its map",
  buildSpaceport: (key: string) => `Build Spaceport (${key})`,
  launchLander: (key: string) => `Launch Lander (${key})`,
  needSpaceport: "Build a Spaceport and wait for it to finish",
  buildHint: "Click your own land to place a Spaceport · Esc to cancel",
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
};
