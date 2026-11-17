# Credits and third-party data

Every third-party asset or dataset used in SpaceFront, with its source and license.
Everything here must allow commercial use (Steam).

| What                                  | Used for                                                             | Source                                                                                                                                          | License                                                |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Natural Earth 1:50m Admin 0 countries | Earth map: land, oceans, country shapes and names (`npm run mapgen`) | [naturalearthdata.com](https://www.naturalearthdata.com/), packaged as TopoJSON by [world-atlas 2.0.2](https://github.com/topojson/world-atlas) | Natural Earth: public domain. world-atlas package: ISC |

Notes:

- The Earth's highlands and mountains are generated from noise by `tools/mapgen`. They are not real elevation data.
- Country borders and names follow Natural Earth's de facto boundaries and are not a political statement.
