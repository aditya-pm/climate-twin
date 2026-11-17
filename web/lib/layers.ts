import type { Grid, LeverKey } from "./api";

export type LayerKey = "hvi" | "lst" | "ndvi" | "tree" | "ndbi" | "pop" | "delta";

export interface LayerDef {
  key: LayerKey;
  label: string;
  short: string;
  unit: string;
  stops: [number, string][];
  format: (v: number) => string;
  describe: string;
  /** normalise value to 0..1 for extrusion height */
  norm: (v: number) => number;
  log?: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export const LAYERS: Record<LayerKey, LayerDef> = {
  hvi: {
    key: "hvi",
    label: "Heat vulnerability",
    short: "HVI",
    unit: "/100",
    stops: [
      [20, "#0f2f3d"],
      [35, "#1d6b72"],
      [50, "#8fb38a"],
      [58, "#f2c46d"],
      [66, "#f08a4b"],
      [74, "#e0453a"],
      [82, "#a3123f"],
      [90, "#5c0b3d"],
    ],
    format: (v) => v.toFixed(0),
    describe: "Composite index of hazard, exposure, sensitivity and adaptive capacity.",
    norm: (v) => clamp((v - 20) / 70),
  },
  lst: {
    key: "lst",
    label: "Surface temperature",
    short: "LST",
    unit: "°C",
    stops: [
      [32, "#0b1f4b"],
      [35, "#2a3f94"],
      [38, "#6a3a9e"],
      [40.5, "#b4367f"],
      [42.5, "#e6534f"],
      [44, "#f89a3c"],
      [45.5, "#fddc74"],
      [47.5, "#fff6c9"],
    ],
    format: (v) => `${v.toFixed(1)}°`,
    describe: "April–June median land surface temperature, Landsat 8/9 thermal band (~10:30 IST overpass).",
    norm: (v) => clamp((v - 32) / 16),
  },
  ndvi: {
    key: "ndvi",
    label: "Vegetation (NDVI)",
    short: "NDVI",
    unit: "",
    stops: [
      [-0.1, "#2b211c"],
      [0.1, "#5b4a34"],
      [0.22, "#8f8c45"],
      [0.35, "#5fa84f"],
      [0.5, "#2c8a4f"],
      [0.7, "#11643f"],
      [0.85, "#063a26"],
    ],
    format: (v) => v.toFixed(2),
    describe: "Normalised Difference Vegetation Index from Sentinel-2.",
    norm: (v) => clamp((v + 0.1) / 0.95),
  },
  tree: {
    key: "tree",
    label: "Tree canopy",
    short: "Canopy",
    unit: "%",
    stops: [
      [0, "#11161c"],
      [0.05, "#1a2e25"],
      [0.12, "#22503a"],
      [0.25, "#2f8a52"],
      [0.45, "#5cc56c"],
      [0.75, "#c3f28c"],
    ],
    format: (v) => `${(v * 100).toFixed(0)}%`,
    describe: "Share of each cell covered by tree crowns.",
    norm: (v) => clamp(v / 0.75),
  },
  ndbi: {
    key: "ndbi",
    label: "Built-up (NDBI)",
    short: "NDBI",
    unit: "",
    stops: [
      [-0.3, "#0b1a2a"],
      [-0.15, "#1d3754"],
      [-0.04, "#4a5b70"],
      [0.04, "#9b8f84"],
      [0.12, "#d6b48c"],
      [0.25, "#fbe9cc"],
    ],
    format: (v) => v.toFixed(2),
    describe: "Normalised Difference Built-up Index: concrete, asphalt and roofs.",
    norm: (v) => clamp((v + 0.3) / 0.55),
  },
  pop: {
    key: "pop",
    label: "Population density",
    short: "Pop.",
    unit: "/km²",
    stops: [
      [0, "#0d1117"],
      [1000, "#18264a"],
      [5000, "#34408a"],
      [12000, "#7c3c9c"],
      [22000, "#d24f7d"],
      [32000, "#ffb08a"],
    ],
    format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
    describe: "Residents per square kilometre (WorldPop 2020, 100 m).",
    norm: (v) => clamp(Math.log1p(v) / Math.log1p(35000)),
    log: true,
  },
  delta: {
    key: "delta",
    label: "Cooling achieved",
    short: "ΔLST",
    unit: "°C",
    stops: [
      [-6, "#e3fff9"],
      [-4, "#7ff3df"],
      [-2.5, "#33c9b6"],
      [-1.2, "#1a7f88"],
      [-0.4, "#1c3f55"],
      [0, "#151b23"],
    ],
    format: (v) => `${v <= -0.005 ? "−" : ""}${Math.abs(v).toFixed(1)}°`,
    describe: "Change in surface temperature versus today.",
    norm: (v) => clamp(-v / 6),
  },
};

export const EXPLORER_LAYERS: LayerKey[] = ["hvi", "lst", "ndvi", "tree", "ndbi", "pop"];

export function gridValues(grid: Grid, key: LayerKey): number[] {
  switch (key) {
    case "hvi":
      return grid.hvi;
    case "lst":
      return grid.lst;
    case "ndvi":
      return grid.ndvi;
    case "tree":
      return grid.tree;
    case "ndbi":
      return grid.ndbi;
    case "pop":
      return grid.pop;
    default:
      return grid.lst;
  }
}

export function colorAt(def: LayerDef, v: number): string {
  const s = def.stops;
  if (v <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const t = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      return mix(s[i - 1][1], s[i][1], t);
    }
  }
  return s[s.length - 1][1];
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function gradientCss(def: LayerDef) {
  const s = def.stops;
  const lo = s[0][0];
  const hi = s[s.length - 1][0];
  const ordered = lo < hi ? s : [...s].reverse();
  const a = Math.min(lo, hi);
  const span = Math.abs(hi - lo);
  return `linear-gradient(90deg, ${ordered.map(([v, c]) => `${c} ${(((v - a) / span) * 100).toFixed(1)}%`).join(", ")})`;
}

export const CATEGORY_COLORS = ["#2fb59b", "#e9c46a", "#f08a4b", "#e0453a"];
export const CATEGORY_NAMES = ["Low", "Moderate", "High", "Severe"];

export const LEVER_STYLE: Record<LeverKey, { color: string; icon: string; verb: string }> = {
  trees: { color: "#5cc56c", icon: "trees", verb: "Plant street trees" },
  parks: { color: "#3ee0c8", icon: "park", verb: "Create pocket parks" },
  cool_roofs: { color: "#5cc8ff", icon: "roof", verb: "Coat cool roofs" },
  depave: { color: "#c9a7ff", icon: "depave", verb: "Remove concrete" },
};
