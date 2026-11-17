# Credits and third-party data

Every third-party asset or dataset used in SpaceFront, with its source and license.
Everything here must allow commercial use (Steam).

| What                                  | Used for                                                             | Source                                                                                                                                          | License                                                |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Natural Earth 1:50m Admin 0 countries | Earth map: land, oceans, country shapes and names (`npm run mapgen`) | [naturalearthdata.com](https://www.naturalearthdata.com/), packaged as TopoJSON by [world-atlas 2.0.2](https://github.com/topojson/world-atlas) | Natural Earth: public domain. world-atlas package: ISC |

Notes:

- The Earth's highlands and mountains are generated from noise by `tools/mapgen`. They are not real elevation data.
- Country borders and names follow Natural Earth's de facto boundaries and are not a political statement.

## Original assets made for SpaceFront

Everything below was made for this project, by code in this repository. Nothing was downloaded, traced or copied from another game (OpenFront included) or asset pack, so no third-party license applies.

| What                                      | How it was made                                                                                                                                                                                                                                                         | Where                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Sprite atlas (structures, ships, effects) | Drawn as SVG by `tools/atlas/sprites.ts` (shapes, paths and gradients written by hand in code), packed by `npm run atlas`. Drawn in light grays so the game tints them with the owner's color.                                                                          | `public/atlas/atlas.svg` (the sheet the game loads), `assets/sprites/*.svg` (each sprite alone), `src/client/render/atlasFrames.ts` |
| Planet and Sun icons                      | Procedural SVG in the same tool: shaded discs with seeded craters, blobs, cloud bands, cracks, halos and rings. Colors chosen to suggest each body; no photos or maps were used.                                                                                        | Same atlas                                                                                                                          |
| Sound effects                             | Synthesized live with the Web Audio API (oscillator envelopes and filtered white noise) in `src/client/audio/audio.ts`: click, build, finished, launch, land, explosion, warhead, laser, alert, notice, spawn, conquer, victory, defeat. No recordings or sample files. | `src/client/audio/audio.ts`                                                                                                         |
| Music                                     | Generated live in `src/client/audio/music.ts`: detuned sawtooth pads through a moving low-pass filter, a sine drone and random bell notes from A minor with a feedback echo. Two original chord progressions (menu and match). No recordings or sample files.           | `src/client/audio/music.ts`                                                                                                         |
| Starfield                                 | Random points drawn at start-up (`src/client/render/renderer.ts`).                                                                                                                                                                                                      | —                                                                                                                                   |
