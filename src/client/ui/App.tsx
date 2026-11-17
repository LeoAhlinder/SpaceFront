import type { Actions } from "../actions";
import { cssColor } from "../render/colors";
import type { FactionView } from "../store/clientStore";
import { landShare, ui, view } from "../store/clientStore";
import { formatCount } from "./format";
import { strings } from "./strings";

/** Root UI: menu, loading screen, or the in-game HUD with an end overlay. */
export function App({ actions }: { actions: Actions }) {
  const phase = ui.phase.value;
  const me = ui.player.value;
  const lost = phase === "playing" && me !== null && !me.alive;
  return (
    <>
      {phase === "menu" && <Menu onPlay={actions.startMatch} />}
      {phase === "loading" && <div class="center-note">{strings.loading}</div>}
      {(phase === "playing" || phase === "ended") && <Hud actions={actions} />}
      {(phase === "ended" || lost) && <EndOverlay onPlay={actions.startMatch} />}
      {ui.error.value && <div class="error">{strings.error(ui.error.value)}</div>}
    </>
  );
}

function Menu({ onPlay }: { onPlay: () => void }) {
  return (
    <div class="menu panel">
      <h1>{strings.title}</h1>
      <p>{strings.tagline}</p>
      <button class="primary" onClick={onPlay}>
        {strings.play}
      </button>
      <p class="hint">{strings.menuHelp}</p>
    </div>
  );
}

function Hud({ actions }: { actions: Actions }) {
  const me = ui.player.value;
  return (
    <>
      <SpawnBanner />
      {me && <StatsPanel me={me} />}
      <Leaderboard />
      <div class="sliders panel">
        <Slider
          label={strings.attackRatio}
          value={ui.attackRatioPct.value}
          onInput={(v) => (ui.attackRatioPct.value = v)}
        />
        <Slider
          label={strings.troopRatio}
          value={ui.troopRatioPct.value}
          onInput={(v) => (ui.troopRatioPct.value = v)}
          onChange={actions.setTroopRatio}
        />
      </div>
    </>
  );
}

function SpawnBanner() {
  const me = ui.player.value;
  if (!me || me.tileCount > 0 || !me.alive || ui.phase.value !== "playing") return null;
  const left = Math.ceil((ui.spawnPhaseTicks.value - ui.tick.value) / 10);
  return <div class="banner">{left > 0 ? strings.spawnPhase(left) : strings.spawnNow}</div>;
}

function StatsPanel({ me }: { me: FactionView }) {
  const goal = view.init?.winLandPct ?? 80;
  return (
    <div class="stats panel">
      <Stat label={strings.troops} value={formatCount(me.troops)} />
      <Stat label={strings.workers} value={formatCount(me.workers)} />
      <Stat
        label={strings.land}
        value={`${formatCount(me.tileCount)} · ${strings.landGoal(landShare(me) * 100, goal)}`}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div class="stat">
      <span class="label">{label}</span>
      <span class="value">{value}</span>
    </div>
  );
}

function Leaderboard() {
  const playerId = view.init?.playerId;
  return (
    <div class="leaderboard panel">
      <div class="label">{strings.leaderboard}</div>
      <ol>
        {ui.leaderboard.value.map((f) => (
          <li key={f.id} class={f.id === playerId ? "me" : ""}>
            <span class="swatch" style={{ background: cssColor(f.color) }} />
            <span class="name">{f.id === playerId ? strings.you : f.name}</span>
            <span class="value">{(landShare(f) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Slider(props: {
  label: string;
  value: number;
  onInput: (v: number) => void;
  onChange?: (v: number) => void;
}) {
  return (
    <label class="slider">
      <span class="label">
        {props.label} <strong>{props.value}%</strong>
      </span>
      <input
        type="range"
        aria-label={props.label}
        min={1}
        max={100}
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
        onChange={(e) => props.onChange?.(Number(e.currentTarget.value))}
      />
    </label>
  );
}

function EndOverlay({ onPlay }: { onPlay: () => void }) {
  const winner = ui.winner.value;
  const goal = view.init?.winLandPct ?? 80;
  const won = winner?.kind === "player";
  return (
    <div class="menu panel">
      <h1>{won ? strings.victory : strings.defeat}</h1>
      <p>
        {won
          ? strings.victoryText(goal)
          : winner
            ? strings.winnerText(winner.name, goal)
            : strings.defeatText}
      </p>
      <button class="primary" onClick={onPlay}>
        {strings.playAgain}
      </button>
    </div>
  );
}
