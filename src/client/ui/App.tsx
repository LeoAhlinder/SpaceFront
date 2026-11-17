import type { Actions } from "../actions";
import { cssColor } from "../render/colors";
import type { FactionView, Mode } from "../store/clientStore";
import { BALANCE } from "../../data/balance";
import type { BodyDef } from "../../data/bodies";
import { bodyById, modifierOf, structureCost } from "../../data/bodies";
import { nationById } from "../../data/nations";
import {
  dismissNotice,
  isAlly,
  landShare,
  ownedCount,
  ui,
  view,
  worldName,
} from "../store/clientStore";
import { keyLabel } from "../input/keymap";
import { formatCount } from "./format";
import { GameMenu, MainMenu, PauseBanner, ReplayBar } from "./Menus";
import { TutorialPanel } from "./Tutorial";
import { strings } from "./strings";

/** Root UI: menus, loading screen, or the in-game HUD with its menu and an end overlay. */
export function App({ actions }: { actions: Actions }) {
  const phase = ui.phase.value;
  const me = ui.player.value;
  const lost = phase === "playing" && me !== null && !me.alive;
  return (
    <>
      {phase === "menu" && <MainMenu actions={actions} />}
      {phase === "loading" && <div class="center-note">{strings.loading}</div>}
      {(phase === "playing" || phase === "ended") && <Hud actions={actions} />}
      {(phase === "ended" || (lost && !view.replay)) && !ui.gameMenu.value && (
        <EndOverlay actions={actions} />
      )}
      <GameMenu actions={actions} />
      {ui.toast.value && <div class="toast">{ui.toast.value}</div>}
      {ui.error.value && <div class="error">{strings.error(ui.error.value)}</div>}
    </>
  );
}

function Hud({ actions }: { actions: Actions }) {
  const me = ui.player.value;
  return (
    <>
      <div class="top-center">
        <ViewBar actions={actions} />
        <ReplayBar actions={actions} />
        <PauseBanner />
        <SpawnBanner />
        <ModeBanner />
        <Alerts actions={actions} />
      </div>
      {me && <StatsPanel me={me} />}
      <div class="right-column">
        <Leaderboard actions={actions} />
        <DiplomacyPanel actions={actions} />
      </div>
      <div class="left-column">
        <Requests actions={actions} />
        <Notices />
        <AlliesPanel actions={actions} />
        <TutorialPanel />
      </div>
      <div class={`bottom-bar panel ${view.replay ? "hidden" : ""}`}>
        <Actions actions={actions} />
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

/** Which view is open, and the button to switch. */
function ViewBar({ actions }: { actions: Actions }) {
  const v = ui.view.value;
  const key = keyLabel("toggleSystemView");
  const body = v.kind === "planet" ? worldBody(v.grid) : null;
  const mods = body?.modifiers ?? {};
  return (
    <div class="view-bar panel">
      <strong>{v.kind === "system" ? strings.solarSystem : worldName(v.grid)}</strong>
      {(Object.keys(strings.modifierNames) as (keyof typeof strings.modifierNames)[]).map((k) =>
        mods[k] !== undefined && mods[k] !== 100 ? (
          <span key={k} class={`mod ${mods[k] > 100 !== (k === "buildCostPct") ? "good" : "bad"}`}>
            {strings.modifier(strings.modifierNames[k], mods[k])}
          </span>
        ) : null,
      )}
      {v.kind === "planet" ? (
        <button onClick={actions.openSystem}>{strings.systemView(key)}</button>
      ) : (
        <span class="hint">{strings.systemHint}</span>
      )}
      <button class="menu-button" onClick={() => actions.setGameMenu(true)}>
        {strings.menu} ({keyLabel("cancel")})
      </button>
    </div>
  );
}

/** Build and launch buttons, with live costs for the open world. */
function Actions({ actions }: { actions: Actions }) {
  const me = ui.player.value;
  const spawned = !!me && me.tileCount > 0;
  const mode = ui.mode.value;
  const canLaunch = ui.readyPorts.value > 0;
  const v = ui.view.value;
  const worldPct = v.kind === "planet" ? modifierOf(worldBody(v.grid), "buildCostPct") : 100;
  const costOf = (kind: BuildKind) =>
    kind === "warship"
      ? structureCost(BALANCE.warship.cost, BALANCE.warship.costStepPct, ownedCount(kind), 100)
      : kind === "kineticStrike" || kind === "antimatterWarhead"
        ? BALANCE.weapons[kind].cost
        : structureCost(
            BALANCE.structures[kind].cost,
            BALANCE.structures.costStepPct,
            ownedCount(kind),
            // The Corona has no world modifiers.
            kind === "sunBase" || kind === "solarSiphon" ? 100 : worldPct,
          );
  const buildButton = (
    kind: BuildKind,
    label: string,
    info: string,
    needs: "port" | "silo" | null = null,
  ) => {
    const cost = costOf(kind);
    const affordable = !!me && me.solars >= cost;
    const blocked =
      (needs === "port" && !canLaunch) || (needs === "silo" && ui.loadedSilos.value === 0);
    return (
      <button
        class={`build ${mode === kind ? "active" : ""}`}
        disabled={!spawned || !affordable || blocked}
        title={blocked ? (needs === "port" ? strings.needSpaceport : strings.needSilo) : info}
        onClick={() => actions.toggleMode(kind)}
      >
        <span>{label}</span>
        <span class="cost">{strings.cost(formatCount(cost))}</span>
      </button>
    );
  };
  return (
    <div class="actions">
      {buildButton(
        "spaceport",
        strings.buildSpaceport(keyLabel("buildSpaceport")),
        strings.spaceportInfo,
      )}
      {buildButton("habitat", strings.buildHabitat(keyLabel("buildHabitat")), strings.habitatInfo)}
      <button
        class={`build ${mode === "launch" ? "active" : ""}`}
        disabled={!spawned || !canLaunch}
        title={canLaunch ? "" : strings.needSpaceport}
        onClick={() => actions.toggleMode("launch")}
      >
        <span>{strings.launchLander(keyLabel("launchLander"))}</span>
        <span class="cost">{ui.attackRatioPct.value}%</span>
      </button>
      {buildButton(
        "sunBase",
        strings.launchSunBase(keyLabel("launchSunBase")),
        strings.sunBaseInfo,
        "port",
      )}
      {buildButton(
        "solarSiphon",
        strings.buildSolarSiphon(keyLabel("buildSolarSiphon")),
        strings.solarSiphonInfo,
      )}
      <span class="divider" />
      {buildButton(
        "shieldGenerator",
        strings.buildShield(keyLabel("buildShield")),
        strings.shieldInfo,
      )}
      {buildButton(
        "orbitalDefense",
        strings.buildOrbitalDefense(keyLabel("buildOrbitalDefense")),
        strings.orbitalDefenseInfo,
      )}
      {buildButton(
        "warship",
        strings.launchWarship(keyLabel("launchWarship")),
        strings.warshipInfo,
        "port",
      )}
      {buildButton(
        "launchSilo",
        strings.buildLaunchSilo(keyLabel("buildLaunchSilo")),
        strings.launchSiloInfo,
      )}
      {buildButton(
        "kineticStrike",
        strings.fireKinetic(keyLabel("fireKinetic")),
        strings.kineticInfo,
        "silo",
      )}
      {buildButton(
        "antimatterWarhead",
        strings.fireAntimatter(keyLabel("fireAntimatter")),
        strings.antimatterInfo,
        "silo",
      )}
    </div>
  );
}

type BuildKind = Exclude<Mode, "none" | "launch">;

const MODE_HINTS: Record<Exclude<Mode, "none">, string> = {
  spaceport: strings.buildHint,
  habitat: strings.habitatHint,
  launch: strings.launchHint,
  sunBase: strings.sunBaseHint,
  solarSiphon: strings.solarSiphonHint,
  shieldGenerator: strings.shieldHint,
  orbitalDefense: strings.orbitalDefenseHint,
  launchSilo: strings.launchSiloHint,
  warship: strings.warshipHint,
  kineticStrike: strings.kineticHint,
  antimatterWarhead: strings.antimatterHint,
};

function ModeBanner() {
  const mode = ui.mode.value;
  if (ui.selectedWarship.value !== null) return <div class="banner">{strings.patrolHint}</div>;
  if (mode === "none") return null;
  return <div class="banner">{MODE_HINTS[mode]}</div>;
}

function Alerts({ actions }: { actions: Actions }) {
  return (
    <>
      {ui.alerts.value.map((a) => (
        <button key={a.id} class="alert" onClick={() => actions.focusAlert(a.id, a.grid)}>
          {a.text}
        </button>
      ))}
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
      <Stat label={strings.solars} value={`${formatCount(me.solars)} ☉`} />
      <Stat label={strings.troops} value={formatCount(me.troops)} />
      <Stat label={strings.workers} value={formatCount(me.workers)} />
      <Stat
        label={strings.land}
        value={`${formatCount(me.tileCount)} · ${strings.landGoal(landShare(me) * 100, goal)}`}
      />
      {ui.warships.value > 0 && (
        <Stat
          label={strings.warships}
          value={`${ui.warships.value} · ${strings.nextWarship(keyLabel("nextWarship"))}`}
        />
      )}
      {(me.coronaTiles > 0 || me.coronaTroops > 0) && (
        <Stat
          label={strings.corona}
          value={strings.coronaStat(formatCount(me.coronaTiles), formatCount(me.coronaTroops))}
        />
      )}
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

function Leaderboard({ actions }: { actions: Actions }) {
  const playerId = view.init?.playerId ?? -1;
  const tick = ui.tick.value;
  const allies = ui.relations.value.allies;
  const selected = ui.selected.value;
  return (
    <div class="leaderboard panel">
      <div class="label">{strings.leaderboard}</div>
      <ol>
        {ui.leaderboard.value.map((f) => (
          <li
            key={f.id}
            class={`${f.id === playerId ? "me" : ""} ${selected === f.id ? "selected" : ""}`}
            onClick={() => actions.select(f.id)}
          >
            <span class="swatch" style={{ background: cssColor(f.color) }} />
            <span class="name">{f.id === playerId ? strings.you : f.name}</span>
            {allies.includes(f.id) && (
              <span class="tag ally" title={strings.allied}>
                ●
              </span>
            )}
            {f.traitorUntil > tick && (
              <span class="tag traitor" title={strings.traitor}>
                ⚠
              </span>
            )}
            <span class="value">{(landShare(f) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ol>
      <div class="hint">{strings.diplomacyHint}</div>
    </div>
  );
}

/** Diplomacy with the selected faction: alliance, gifts, embargo and quick signals. */
function DiplomacyPanel({ actions }: { actions: Actions }) {
  const id = ui.selected.value;
  const f = id === null ? undefined : view.factions.get(id);
  const me = ui.player.value;
  if (!f || !me || ui.phase.value !== "playing") return null;
  const rel = ui.relations.value;
  const tick = ui.tick.value;
  const allied = rel.allies.includes(f.id);
  const theyAsked = rel.requests.some((r) => r.from === f.id);
  const weAsked = rel.asked.includes(f.id);
  const embargoed = rel.embargoes.includes(f.id);
  const home = f.homeId !== undefined ? view.factions.get(f.homeId)?.name : undefined;
  const who =
    f.kind === "bot"
      ? strings.bot
      : home !== undefined
        ? strings.colonyOf(home)
        : f.nationId !== undefined
          ? strings.nation(nationById(f.nationId).tier)
          : "";
  const giftSolars = Math.floor(me.solars / 4);
  const giftTroops = Math.floor(me.troops / 4);
  return (
    <div class="diplomacy panel" aria-label={f.name}>
      <div class="diplomacy-head">
        <span class="swatch" style={{ background: cssColor(f.color) }} />
        <strong>{f.name}</strong>
        <button class="close" aria-label={strings.close} onClick={() => actions.select(null)}>
          ×
        </button>
      </div>
      <div class="hint">
        {who}
        {allied && <span class="tag ally"> · {strings.allied}</span>}
        {f.traitorUntil > tick && <span class="tag traitor"> · {strings.traitor}</span>}
        {embargoed && <span class="tag"> · {strings.embargoed}</span>}
      </div>
      {f.alive && (
        <div class="diplomacy-actions">
          {f.kind === "bot" ? (
            <span class="hint">{strings.botsNeverAlly}</span>
          ) : allied ? (
            <button title={strings.breakWarning} onClick={() => actions.ally(f.id, "break")}>
              {strings.breakAlliance}
            </button>
          ) : theyAsked ? (
            <button class="good" onClick={() => actions.ally(f.id, "accept")}>
              {strings.acceptAlliance}
            </button>
          ) : (
            <button disabled={weAsked} onClick={() => actions.ally(f.id, "request")}>
              {weAsked ? strings.asked : strings.askAlliance}
            </button>
          )}
          {allied && (
            <>
              <button disabled={giftSolars < 1} onClick={() => actions.gift(f.id, "solars")}>
                {strings.giftSolars(formatCount(giftSolars))}
              </button>
              <button disabled={giftTroops < 1} onClick={() => actions.gift(f.id, "troops")}>
                {strings.giftTroops(formatCount(giftTroops))}
              </button>
            </>
          )}
          <button onClick={() => actions.embargo(f.id, !embargoed)}>
            {embargoed ? strings.liftEmbargo : strings.embargo}
          </button>
          {!allied && f.kind !== "bot" && (
            <button onClick={() => actions.signal("peace", f.id)}>{strings.signalPeace}</button>
          )}
          {!allied && rel.allies.length > 0 && (
            <button onClick={() => actions.signal("attack", f.id)}>{strings.signalAttack}</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Incoming alliance requests, with an Accept button each. */
function Requests({ actions }: { actions: Actions }) {
  return (
    <>
      {ui.relations.value.requests.map((r) => {
        const f = view.factions.get(r.from);
        if (!f) return null;
        return (
          <div key={r.from} class="request panel">
            <span class="swatch" style={{ background: cssColor(f.color) }} />
            <span class="name">{strings.noticeAllyRequest(f.name)}</span>
            <button class="good" onClick={() => actions.ally(f.id, "accept")}>
              {strings.acceptAlliance}
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Recent diplomacy messages for the player; click one to dismiss it. */
function Notices() {
  return (
    <>
      {ui.notices.value.map((n) => (
        <button key={n.id} class="notice" onClick={() => dismissNotice(n.id)}>
          {n.text}
        </button>
      ))}
    </>
  );
}

/** The player's allies, and a Help! signal to all of them. */
function AlliesPanel({ actions }: { actions: Actions }) {
  const allies = ui.relations.value.allies;
  if (allies.length === 0) return null;
  return (
    <div class="allies panel">
      <div class="label">{strings.allies}</div>
      {allies.map((id) => {
        const f = view.factions.get(id);
        return f ? (
          <button key={id} class="ally-row" onClick={() => actions.select(id)}>
            <span class="swatch" style={{ background: cssColor(f.color) }} />
            <span class="name">{f.name}</span>
          </button>
        ) : null;
      })}
      <button onClick={() => actions.signal("help", 0)}>{strings.signalHelp}</button>
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

function EndOverlay({ actions }: { actions: Actions }) {
  const winner = ui.winner.value;
  const goal = view.init?.winLandPct ?? 80;
  const me = view.init?.playerId ?? -1;
  const won = winner?.kind === "player";
  // Allies share a win (GAMEPLAY_PLAN.md §9).
  const shared = !won && !!winner && !!ui.player.value?.alive && isAlly(me, winner.id);
  const inSync = ui.replayInSync.value;
  if (view.replay && inSync !== null) {
    return (
      <div class="menu panel">
        <h1>{strings.replayFinished}</h1>
        <p>{inSync ? strings.replayInSync : strings.replayOutOfSync}</p>
        <div class="menu-row">
          <button class="primary" onClick={actions.quitToMenu}>
            {strings.quitToMenu}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="menu panel">
      <h1>{won ? strings.victory : shared ? strings.sharedVictory : strings.defeat}</h1>
      <p>
        {won
          ? strings.victoryText(goal)
          : shared
            ? strings.sharedVictoryText(winner.name)
            : winner
              ? strings.winnerText(winner.name, goal)
              : strings.defeatText}
      </p>
      <div class="menu-row">
        <button onClick={actions.quitToMenu}>{strings.quitToMenu}</button>
        {!view.replay && (
          <button onClick={() => void actions.saveReplay()}>{strings.saveReplay}</button>
        )}
        {!view.replay && (
          <button class="primary" onClick={() => actions.startMatch()}>
            {strings.playAgain}
          </button>
        )}
      </div>
    </div>
  );
}

/** The solar-system body a grid belongs to. */
function worldBody(grid: number): BodyDef | undefined {
  const id = view.init?.grids[grid]?.bodyId;
  return id ? bodyById(id) : undefined;
}
