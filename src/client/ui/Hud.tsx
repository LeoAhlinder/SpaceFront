import { clientStore } from "../store/clientStore";
import { strings } from "./strings";

/** Placeholder HUD: shows the worker's state and tick counter. */
export function Hud() {
  return (
    <div class="hud">
      <strong>{strings.title}</strong>
      <span>
        {clientStore.ready.value ? strings.tick(clientStore.tick.value) : strings.loading}
      </span>
    </div>
  );
}
