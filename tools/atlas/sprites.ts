/**
 * Every sprite in the game, drawn as SVG by code (original art, no third-party
 * assets). Structures and ships are drawn in light grays so the renderer can
 * tint them with the owner's color; overlays (`…Glow`, `flame`) keep their
 * own colors. Ships and the siphon point up (−y); the renderer rotates them.
 */
import { el, pts, regular, seeded } from "./svg";

export interface SpriteDef {
  readonly name: string;
  /** Square frame size in atlas pixels (before the quality scale). */
  readonly size: number;
  /** SVG content in frame coordinates (0..size). */
  readonly svg: string;
  /** Planet icons: radius of the disc in frame pixels (the renderer scales by it). */
  readonly radius?: number;
}

// Tintable grays: white turns into the owner's color, darker grays into shades of it.
const BODY = "#f2f4fa";
const SHADE = "#b8bfd0";
const DARK = "#6c7488";
const OUT = "#121522";
const LINE = { stroke: OUT, "stroke-width": 2.5, "stroke-linejoin": "round" } as const;

const S = 64; // structures, ships and effects
const C = S / 2;

function sprite(name: string, svg: string, size = S, radius?: number): SpriteDef {
  return radius === undefined ? { name, size, svg } : { name, size, svg, radius };
}

// ---- Structures ----------------------------------------------------------------

const spaceport = sprite(
  "spaceport",
  el("polygon", { points: regular(C, C, 29, 8, Math.PI / 8), fill: SHADE, ...LINE }) +
    el("circle", { cx: C, cy: C, r: 19, fill: BODY, ...LINE }) +
    el("circle", { cx: C, cy: C, r: 14, fill: "none", stroke: DARK, "stroke-width": 2 }) +
    // A small rocket on the pad.
    el("path", {
      d: `M${C} 14 C${C + 7} 22 ${C + 7} 34 ${C + 6} 44 L${C - 6} 44 C${C - 7} 34 ${C - 7} 22 ${C} 14Z`,
      fill: BODY,
      ...LINE,
    }) +
    el("polygon", { points: pts(C - 6, 36, C - 12, 47, C - 6, 44), fill: DARK, ...LINE }) +
    el("polygon", { points: pts(C + 6, 36, C + 12, 47, C + 6, 44), fill: DARK, ...LINE }) +
    el("circle", { cx: C, cy: 27, r: 3.2, fill: OUT }) +
    [0, 1, 2, 3]
      .map((i) => {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        return el("circle", {
          cx: C + Math.cos(a) * 24,
          cy: C + Math.sin(a) * 24,
          r: 2.2,
          fill: OUT,
        });
      })
      .join(""),
);

const habitat = sprite(
  "habitat",
  el("rect", { x: 7, y: 40, width: 50, height: 12, rx: 3, fill: SHADE, ...LINE }) +
    el("path", { d: "M10 42 A22 22 0 0 1 54 42 Z", fill: BODY, ...LINE }) +
    el("path", { d: "M21 42 A11 22 0 0 1 43 42", fill: "none", stroke: DARK, "stroke-width": 2 }) +
    el("path", { d: "M14 31 L50 31", stroke: DARK, "stroke-width": 2 }) +
    el("path", { d: "M32 20 L32 42", stroke: DARK, "stroke-width": 2 }) +
    el("line", { x1: 32, y1: 20, x2: 32, y2: 9, stroke: OUT, "stroke-width": 2.5 }) +
    el("circle", { cx: 32, cy: 8, r: 3, fill: BODY, ...LINE }) +
    [16, 26, 38, 48]
      .map((x) => el("rect", { x: x - 2, y: 44, width: 4, height: 4, fill: OUT }))
      .join(""),
);

const sunBase = sprite(
  "sunBase",
  el("circle", { cx: C, cy: C, r: 27, fill: "none", stroke: OUT, "stroke-width": 9 }) +
    el("circle", { cx: C, cy: C, r: 27, fill: "none", stroke: BODY, "stroke-width": 5 }) +
    [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const a = (i * Math.PI) / 3;
        return el("line", {
          x1: C + Math.cos(a) * 11,
          y1: C + Math.sin(a) * 11,
          x2: C + Math.cos(a) * 24,
          y2: C + Math.sin(a) * 24,
          stroke: OUT,
          "stroke-width": 5,
        });
      })
      .join("") +
    el("circle", { cx: C, cy: C, r: 12, fill: SHADE, ...LINE }),
);

const sunBaseGlow = sprite(
  "sunBaseGlow",
  el(
    "defs",
    {},
    el(
      "radialGradient",
      { id: "sbg" },
      stop(0, "#fff6c8") + stop(0.5, "#ffc640") + stop(1, "#ff8a20", 0),
    ),
  ) +
    el("circle", { cx: C, cy: C, r: 12, fill: "url(#sbg)" }) +
    el("circle", { cx: C, cy: C, r: 5, fill: "#fff3b0" }),
);

const solarSiphon = sprite(
  "solarSiphon",
  // A collector dish opening toward the Sun (up), on a short mast.
  el("path", { d: "M8 16 Q32 34 56 16 L48 30 Q32 40 16 30 Z", fill: BODY, ...LINE }) +
    el("path", {
      d: "M20 26 L26 36 M44 26 L38 36 M32 30 L32 38",
      stroke: DARK,
      "stroke-width": 2,
    }) +
    el("rect", { x: 27, y: 36, width: 10, height: 18, rx: 2, fill: SHADE, ...LINE }) +
    el("circle", { cx: 32, cy: 20, r: 3.5, fill: OUT }),
);

const shieldGenerator = sprite(
  "shieldGenerator",
  el("polygon", { points: regular(C, C + 6, 22, 6, Math.PI / 6), fill: SHADE, ...LINE }) +
    el("path", { d: "M14 34 A18 18 0 0 1 50 34", fill: "none", stroke: OUT, "stroke-width": 7 }) +
    el("path", {
      d: "M14 34 A18 18 0 0 1 50 34",
      fill: "none",
      stroke: BODY,
      "stroke-width": 3.5,
    }) +
    el("circle", { cx: C, cy: C + 6, r: 9, fill: BODY, ...LINE }) +
    el("line", { x1: C, y1: C - 3, x2: C, y2: 8, stroke: OUT, "stroke-width": 3 }) +
    el("circle", { cx: C, cy: 8, r: 4, fill: BODY, ...LINE }),
);

const shieldGlow = sprite(
  "shieldGlow",
  el("circle", { cx: C, cy: 8, r: 3, fill: "#c8f4ff" }) +
    el("circle", { cx: C, cy: C + 6, r: 4.5, fill: "#8fd8ff" }),
);

const orbitalDefense = sprite(
  "orbitalDefense",
  el("circle", { cx: C, cy: C + 8, r: 22, fill: SHADE, ...LINE }) +
    el("rect", { x: 23, y: 6, width: 6, height: 26, rx: 2, fill: DARK, ...LINE }) +
    el("rect", { x: 35, y: 6, width: 6, height: 26, rx: 2, fill: DARK, ...LINE }) +
    el("circle", { cx: C, cy: C + 6, r: 13, fill: BODY, ...LINE }) +
    el("path", { d: "M24 50 L40 50", stroke: DARK, "stroke-width": 2 }) +
    el("circle", { cx: C, cy: C + 6, r: 4, fill: OUT }),
);

const launchSilo = sprite(
  "launchSilo",
  el("rect", { x: 7, y: 7, width: 50, height: 50, rx: 9, fill: SHADE, ...LINE }) +
    el("circle", { cx: C, cy: C, r: 18, fill: BODY, ...LINE }) +
    el("line", { x1: C, y1: C - 18, x2: C, y2: C + 18, stroke: OUT, "stroke-width": 2.5 }) +
    [
      [13, 13],
      [51, 13],
      [13, 51],
      [51, 51],
    ]
      .map(([x, y]) => el("circle", { cx: x!, cy: y!, r: 2.2, fill: OUT }))
      .join(""),
);

const siloGlow = sprite(
  "siloGlow",
  el(
    "defs",
    {},
    el(
      "radialGradient",
      { id: "slg" },
      stop(0, "#ffe0a0") + stop(0.45, "#ff5a3c") + stop(1, "#ff2a10", 0),
    ),
  ) + el("circle", { cx: C, cy: C, r: 12, fill: "url(#slg)" }),
);

// ---- Ships (pointing up) ---------------------------------------------------------

const troopLander = sprite(
  "troopLander",
  el("path", {
    d: "M32 6 C42 14 44 30 42 46 L22 46 C20 30 22 14 32 6Z",
    fill: BODY,
    ...LINE,
  }) +
    el("polygon", { points: pts(22, 32, 10, 52, 23, 46), fill: SHADE, ...LINE }) +
    el("polygon", { points: pts(42, 32, 54, 52, 41, 46), fill: SHADE, ...LINE }) +
    el("rect", { x: 26, y: 46, width: 12, height: 8, rx: 2, fill: DARK, ...LINE }) +
    el("circle", { cx: 32, cy: 22, r: 4.5, fill: OUT }),
);

const freighter = sprite(
  "freighter",
  el("rect", { x: 20, y: 8, width: 24, height: 12, rx: 5, fill: BODY, ...LINE }) +
    el("rect", { x: 16, y: 20, width: 32, height: 30, rx: 2, fill: SHADE, ...LINE }) +
    el("path", { d: "M16 30 L48 30 M16 40 L48 40 M32 20 L32 50", stroke: OUT, "stroke-width": 2 }) +
    el("rect", { x: 22, y: 50, width: 20, height: 7, rx: 2, fill: DARK, ...LINE }) +
    el("rect", { x: 27, y: 11, width: 10, height: 4, fill: OUT }),
);

const sunBaseShip = sprite(
  "sunBaseShip",
  el("path", { d: "M32 4 L44 20 L44 52 L20 52 L20 20 Z", fill: SHADE, ...LINE }) +
    el("circle", { cx: 32, cy: 34, r: 17, fill: "none", stroke: OUT, "stroke-width": 8 }) +
    el("circle", { cx: 32, cy: 34, r: 17, fill: "none", stroke: BODY, "stroke-width": 4 }) +
    el("circle", { cx: 32, cy: 34, r: 6, fill: "#ffc640", ...LINE }) +
    el("rect", { x: 25, y: 52, width: 14, height: 7, rx: 2, fill: DARK, ...LINE }),
);

const warship = sprite(
  "warship",
  el("path", {
    d: "M32 3 L39 22 L58 46 L58 52 L40 48 L36 58 L28 58 L24 48 L6 52 L6 46 L25 22 Z",
    fill: BODY,
    ...LINE,
  }) +
    el("path", { d: "M32 12 L36 30 L32 44 L28 30 Z", fill: DARK, ...LINE }) +
    el("path", { d: "M12 47 L26 34 M52 47 L38 34", stroke: DARK, "stroke-width": 2 }) +
    el("circle", { cx: 32, cy: 22, r: 2.8, fill: "#e8fbff" }),
);

const kineticStrike = sprite(
  "kineticStrike",
  el("path", { d: "M32 4 L38 20 L38 50 L32 58 L26 50 L26 20 Z", fill: "#d8dce6", ...LINE }) +
    el("polygon", { points: pts(26, 40, 16, 56, 26, 52), fill: "#8a92a6", ...LINE }) +
    el("polygon", { points: pts(38, 40, 48, 56, 38, 52), fill: "#8a92a6", ...LINE }) +
    el("path", { d: "M32 4 L38 20 L26 20 Z", fill: "#ff5a3c", ...LINE }),
);

const antimatterWarhead = sprite(
  "antimatterWarhead",
  el("path", {
    d: "M32 3 C44 12 44 34 40 48 L24 48 C20 34 20 12 32 3Z",
    fill: "#d8dce6",
    ...LINE,
  }) +
    el("polygon", { points: pts(24, 36, 12, 58, 26, 50), fill: "#8a92a6", ...LINE }) +
    el("polygon", { points: pts(40, 36, 52, 58, 38, 50), fill: "#8a92a6", ...LINE }) +
    el("rect", { x: 26, y: 48, width: 12, height: 9, rx: 2, fill: "#5c6276", ...LINE }) +
    el("circle", { cx: 32, cy: 22, r: 7, fill: "#ff3cc8", ...LINE }) +
    el("circle", { cx: 32, cy: 22, r: 3, fill: "#ffd0f4" }),
);

// ---- Effects and markers (white, tinted at runtime) ------------------------------------

function stop(offset: number, color: string, opacity = 1): string {
  return el("stop", { offset, "stop-color": color, "stop-opacity": opacity });
}

const glow = sprite(
  "glow",
  el(
    "defs",
    {},
    el(
      "radialGradient",
      { id: "gl" },
      stop(0, "#ffffff") + stop(0.35, "#ffffff", 0.55) + stop(1, "#ffffff", 0),
    ),
  ) + el("circle", { cx: C, cy: C, r: C, fill: "url(#gl)" }),
);

const flame = sprite(
  "flame",
  el(
    "defs",
    {},
    el(
      "linearGradient",
      { id: "fl", x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(0, "#fff6d0") + stop(0.35, "#ffb040") + stop(1, "#ff4a20", 0),
    ),
  ) + el("path", { d: "M22 0 C24 22 28 44 32 64 C36 44 40 22 42 0 Z", fill: "url(#fl)" }),
);

const ring = sprite(
  "ring",
  el("circle", { cx: C, cy: C, r: 28, fill: "none", stroke: "#ffffff", "stroke-width": 4 }) +
    el("circle", {
      cx: C,
      cy: C,
      r: 24,
      fill: "none",
      stroke: "#ffffff",
      "stroke-width": 2,
      opacity: 0.4,
    }),
);

const spark = sprite(
  "spark",
  el("polygon", {
    points: (() => {
      const xy: number[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const r = i % 2 === 0 ? 30 : 9;
        xy.push(C + Math.cos(a) * r, C + Math.sin(a) * r);
      }
      return pts(...xy);
    })(),
    fill: "#ffffff",
  }) + el("circle", { cx: C, cy: C, r: 8, fill: "#ffffff" }),
);

const reticle = sprite(
  "reticle",
  el("circle", { cx: C, cy: C, r: 22, fill: "none", stroke: "#ffffff", "stroke-width": 3 }) +
    [0, 1, 2, 3]
      .map((i) => {
        const a = (i * Math.PI) / 2;
        return el("line", {
          x1: C + Math.cos(a) * 14,
          y1: C + Math.sin(a) * 14,
          x2: C + Math.cos(a) * 30,
          y2: C + Math.sin(a) * 30,
          stroke: "#ffffff",
          "stroke-width": 3,
        });
      })
      .join("") +
    el("circle", { cx: C, cy: C, r: 3, fill: "#ffffff" }),
);

const landing = sprite(
  "landing",
  [0, 1, 2, 3]
    .map((i) => {
      const a = (i * Math.PI) / 2;
      const x = C + Math.cos(a) * 20;
      const y = C + Math.sin(a) * 20;
      const ix = -Math.cos(a);
      const iy = -Math.sin(a);
      // A chevron pointing at the center.
      return el("polyline", {
        points: pts(
          x - iy * 8 - ix * 4,
          y + ix * 8 - iy * 4,
          x + ix * 4,
          y + iy * 4,
          x + iy * 8 - ix * 4,
          y - ix * 8 - iy * 4,
        ),
        fill: "none",
        stroke: "#ffffff",
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
    })
    .join(""),
);

// ---- Planet icons ---------------------------------------------------------------

/** Planet frames: 160 px with a 56 px disc, leaving room for rings and halos. */
const P = 160;
const PC = P / 2;
const PR = 56;

interface PlanetStyle {
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  /** Surface detail drawn inside the disc (clipped to it). */
  readonly detail?: (id: string) => string;
  /** Drawn behind the disc (halo) and in front of it (rings). */
  readonly behind?: string;
  readonly front?: string;
}

/** A shaded sphere: base color, a lit side and a terminator shadow, plus clipped detail. */
function planet(id: string, style: PlanetStyle): SpriteDef {
  const defs = el(
    "defs",
    {},
    el(
      "radialGradient",
      { id: `${id}-sh`, cx: 0.35, cy: 0.32, r: 0.8 },
      stop(0, style.light) + stop(0.55, style.base) + stop(1, style.dark),
    ) +
      el(
        "radialGradient",
        { id: `${id}-tm`, cx: 0.3, cy: 0.28, r: 0.95 },
        stop(0.55, "#000000", 0) + stop(1, "#000000", 0.55),
      ) +
      el("clipPath", { id: `${id}-cl` }, el("circle", { cx: PC, cy: PC, r: PR })),
  );
  const svg =
    defs +
    (style.behind ?? "") +
    el("circle", { cx: PC, cy: PC, r: PR, fill: `url(#${id}-sh)` }) +
    (style.detail ? el("g", { "clip-path": `url(#${id}-cl)` }, style.detail(id)) : "") +
    el("circle", { cx: PC, cy: PC, r: PR, fill: `url(#${id}-tm)` }) +
    (style.front ?? "");
  return sprite(id, svg, P, PR);
}

/** Craters: dark rims with lighter floors, scattered by a seed. */
function craters(seed: number, n: number, color: string, maxR = 9): string {
  const rnd = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * PR * 0.95;
    const r = 2 + rnd() * maxR;
    const x = PC + Math.cos(a) * d;
    const y = PC + Math.sin(a) * d;
    out += el("circle", { cx: x, cy: y, r, fill: color, opacity: 0.35 + rnd() * 0.3 });
    out += el("circle", {
      cx: x - r * 0.2,
      cy: y - r * 0.2,
      r: r * 0.65,
      fill: "#ffffff",
      opacity: 0.12,
    });
  }
  return out;
}

/** Soft blobs of a color (continents, maria, dust), scattered by a seed. */
function blobs(
  seed: number,
  n: number,
  color: string,
  minR: number,
  maxR: number,
  opacity = 1,
): string {
  const rnd = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const cx = PC + (rnd() - 0.5) * PR * 1.9;
    const cy = PC + (rnd() - 0.5) * PR * 1.9;
    const parts = 3 + Math.floor(rnd() * 4);
    for (let j = 0; j < parts; j++) {
      out += el("ellipse", {
        cx: cx + (rnd() - 0.5) * maxR,
        cy: cy + (rnd() - 0.5) * maxR,
        rx: minR + rnd() * (maxR - minR),
        ry: minR + rnd() * (maxR - minR) * 0.7,
        fill: color,
        opacity,
      });
    }
  }
  return out;
}

/** Horizontal cloud bands for gas giants, with wobbly edges. */
function bands(seed: number, colors: readonly string[], n: number): string {
  const rnd = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const y = PC - PR + ((i + 0.5) * 2 * PR) / n + (rnd() - 0.5) * 4;
    const h = (PR * 2) / n / 2 + rnd() * 5;
    const color = colors[i % colors.length]!;
    let d = `M${PC - PR - 4} ${y - h / 2}`;
    for (let x = -PR; x <= PR + 8; x += 16)
      d += ` Q${PC + x + 8} ${y - h / 2 + (rnd() - 0.5) * 5} ${PC + x + 16} ${y - h / 2}`;
    d += ` L${PC + PR + 8} ${y + h / 2}`;
    for (let x = PR; x >= -PR - 8; x -= 16)
      d += ` Q${PC + x - 8} ${y + h / 2 + (rnd() - 0.5) * 5} ${PC + x - 16} ${y + h / 2}`;
    out += el("path", { d: `${d}Z`, fill: color, opacity: 0.55 + rnd() * 0.3 });
  }
  return out;
}

/** Thin bright cracks (Europa, Enceladus). */
function cracks(seed: number, n: number, color: string): string {
  const rnd = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    let x = PC + (rnd() - 0.5) * PR * 2;
    let y = PC + (rnd() - 0.5) * PR * 2;
    let d = `M${x} ${y}`;
    const a = rnd() * Math.PI;
    for (let j = 0; j < 4; j++) {
      x += Math.cos(a + (rnd() - 0.5)) * 18;
      y += Math.sin(a + (rnd() - 0.5)) * 18;
      d += ` L${x} ${y}`;
    }
    out += el("path", {
      d,
      fill: "none",
      stroke: color,
      "stroke-width": 1.5 + rnd() * 1.5,
      opacity: 0.7,
    });
  }
  return out;
}

function halo(id: string, color: string, r: number, opacity: number): string {
  return (
    el(
      "defs",
      {},
      el("radialGradient", { id: `${id}-halo` }, stop(0.6, color, opacity) + stop(1, color, 0)),
    ) + el("circle", { cx: PC, cy: PC, r, fill: `url(#${id}-halo)` })
  );
}

/** Saturn-style rings: the back half behind the disc, the front half over it. */
function rings(color: string, tilt: number, rx: number, back: boolean): string {
  const ry = rx * tilt;
  const arc = back
    ? `M${PC - rx} ${PC} A${rx} ${ry} 0 0 1 ${PC + rx} ${PC}`
    : `M${PC - rx} ${PC} A${rx} ${ry} 0 0 0 ${PC + rx} ${PC}`;
  return (
    el("path", { d: arc, fill: "none", stroke: color, "stroke-width": 9, opacity: 0.75 }) +
    el("path", { d: arc, fill: "none", stroke: "#fff4d8", "stroke-width": 2, opacity: 0.6 })
  );
}

const PLANETS: readonly SpriteDef[] = [
  planet("sun", {
    base: "#ffc94a",
    light: "#fff6c8",
    dark: "#ff8a20",
    behind: halo("sun", "#ffb030", 78, 0.55),
    detail: () => blobs(11, 8, "#ffe890", 3, 7, 0.35) + blobs(12, 5, "#ff9a2a", 3, 6, 0.3),
  }),
  planet("mercury", {
    base: "#9a948c",
    light: "#d4cec6",
    dark: "#4a4640",
    detail: () => craters(21, 26, "#5e5a54", 7),
  }),
  planet("venus", {
    base: "#d9b56a",
    light: "#fbe8b8",
    dark: "#8a6630",
    behind: halo("venus", "#f2d79a", 64, 0.35),
    detail: () => bands(31, ["#f0d494", "#c49a50", "#e6c47e"], 7),
  }),
  planet("earth", {
    base: "#2f6fc8",
    light: "#8cc4ff",
    dark: "#12305c",
    behind: halo("earth", "#7ab8ff", 64, 0.4),
    detail: () =>
      blobs(41, 6, "#4f8f3e", 6, 16) +
      blobs(42, 4, "#9a8c5a", 4, 9, 0.7) +
      el("ellipse", { cx: PC, cy: PC - PR + 4, rx: 30, ry: 9, fill: "#eef4fa" }) +
      el("ellipse", { cx: PC, cy: PC + PR - 3, rx: 34, ry: 8, fill: "#eef4fa" }) +
      blobs(43, 7, "#ffffff", 3, 10, 0.45),
  }),
  planet("moon", {
    base: "#b0b0b0",
    light: "#e6e6e6",
    dark: "#555555",
    detail: () => blobs(51, 4, "#7a7a7a", 6, 13, 0.55) + craters(52, 18, "#6a6a6a", 6),
  }),
  planet("mars", {
    base: "#c1502e",
    light: "#f08a5e",
    dark: "#5a1e10",
    behind: halo("mars", "#ff9a6a", 61, 0.25),
    detail: () =>
      blobs(61, 5, "#8a3418", 5, 12, 0.6) +
      el("path", {
        d: `M${PC - 40} ${PC + 4} Q${PC} ${PC - 4} ${PC + 38} ${PC + 8}`,
        stroke: "#6a2410",
        "stroke-width": 3,
        fill: "none",
        opacity: 0.7,
      }) +
      el("ellipse", { cx: PC, cy: PC - PR + 3, rx: 22, ry: 7, fill: "#f4ece8" }),
  }),
  // The belt: a cluster of rocks instead of one disc.
  sprite(
    "belt",
    (() => {
      const rnd = seeded(71);
      let out = "";
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * PR;
        const x = PC + Math.cos(a) * d;
        const y = PC + Math.sin(a) * d * 0.75;
        const r = 3 + rnd() * 10;
        out += el("polygon", {
          points: regular(x, y, r, 5 + Math.floor(rnd() * 3), rnd() * 6),
          fill: rnd() > 0.5 ? "#8a7e6e" : "#a89a86",
          stroke: "#4a4238",
          "stroke-width": 1.5,
        });
      }
      return out;
    })(),
    P,
    PR,
  ),
  planet("jupiter", {
    base: "#d8a878",
    light: "#f6dcc0",
    dark: "#6e4a2c",
    detail: () =>
      bands(81, ["#e8c8a0", "#b07a4e", "#f2dcc0", "#c08a5a"], 9) +
      el("ellipse", { cx: PC + 18, cy: PC + 16, rx: 11, ry: 6, fill: "#b8502e", opacity: 0.85 }),
  }),
  planet("io", {
    base: "#e0c850",
    light: "#fff0a0",
    dark: "#7a6420",
    detail: () => blobs(91, 7, "#c88a2a", 3, 7, 0.6) + craters(92, 8, "#5a2a10", 4),
  }),
  planet("europa", {
    base: "#d8ccb8",
    light: "#fbf4e8",
    dark: "#6e6250",
    detail: () => cracks(101, 12, "#9a5a3a"),
  }),
  planet("ganymede", {
    base: "#9a9080",
    light: "#d6ccbc",
    dark: "#463e34",
    detail: () => blobs(111, 5, "#6e665a", 6, 14, 0.55) + craters(112, 10, "#5a5248", 5),
  }),
  planet("callisto", {
    base: "#6a6258",
    light: "#a89e90",
    dark: "#2c2620",
    detail: () => craters(121, 34, "#3a342e", 5),
  }),
  planet("saturn", {
    base: "#e6cf8f",
    light: "#fff2cc",
    dark: "#7e6a3a",
    behind: rings("#d8c08a", 0.32, 76, true),
    front: rings("#d8c08a", 0.32, 76, false),
    detail: () => bands(131, ["#f2e0b0", "#c8a868", "#ead2a0"], 8),
  }),
  planet("titan", {
    base: "#d09a40",
    light: "#f6d08a",
    dark: "#6a4614",
    behind: halo("titan", "#f0b860", 66, 0.5),
    detail: () => blobs(141, 4, "#a8742a", 6, 12, 0.4),
  }),
  planet("enceladus", {
    base: "#eef4fa",
    light: "#ffffff",
    dark: "#8a96a4",
    detail: () => cracks(151, 7, "#7ab4d8"),
  }),
  planet("uranus", {
    base: "#9fd8e0",
    light: "#e0fbff",
    dark: "#3e7680",
    behind: rings("#bfe8f0", 1.8, 20, true),
    detail: () => bands(161, ["#b8e6ec", "#8ccad4"], 5),
  }),
  planet("neptune", {
    base: "#4f6fd8",
    light: "#a8c0ff",
    dark: "#1a2a6a",
    detail: () =>
      bands(171, ["#6a88e8", "#3e58c0"], 6) +
      el("ellipse", { cx: PC - 14, cy: PC + 10, rx: 9, ry: 5, fill: "#1e2e78", opacity: 0.8 }),
  }),
  planet("triton", {
    base: "#d0b0a8",
    light: "#f6e4de",
    dark: "#6a4a44",
    detail: () => blobs(181, 6, "#e8d0c8", 4, 10, 0.6) + craters(182, 6, "#8a6a64", 4),
  }),
];

/** Every frame in the atlas, in packing order. */
export const SPRITES: readonly SpriteDef[] = [
  spaceport,
  habitat,
  sunBase,
  sunBaseGlow,
  solarSiphon,
  shieldGenerator,
  shieldGlow,
  orbitalDefense,
  launchSilo,
  siloGlow,
  troopLander,
  freighter,
  sunBaseShip,
  warship,
  kineticStrike,
  antimatterWarhead,
  glow,
  flame,
  ring,
  spark,
  reticle,
  landing,
  ...PLANETS,
];
