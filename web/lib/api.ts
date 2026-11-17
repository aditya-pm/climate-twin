export type LeverKey = "trees" | "parks" | "cool_roofs" | "depave";

export interface Lever {
  label: string;
  unit: string;
  max: number;
  standard: number;
  desc: string;
}

export interface ModelMetrics {
  r2: number;
  mae: number;
  rmse: number;
}

export interface Meta {
  city: string;
  bbox: [number, number, number, number];
  step: number;
  cells: number;
  population: number;
  area_km2: number;
  lst_mean: number;
  lst_max: number;
  lst_min: number;
  lst_p95: number;
  hvi_mean: number;
  pop_high: number;
  cells_severe: number;
  tree_mean: number;
  imp_mean: number;
  categories: { name: string; min: number }[];
  hvi_weights: Record<string, number>;
  levers: Record<LeverKey, Lever>;
  features: Record<string, { label: string; short: string; unit: string; source: string }>;
  metrics: { models: Record<string, ModelMetrics>; folds: number; block_km: number };
  model_r2: number;
  model_mae: number;
  localities: string[];
  data_source?: "real" | "synthetic";
  data_info?: { season?: string; built_utc?: string; cells?: number };
  scenes?: { landsat: number; sentinel2: number };
  lst_range?: [number, number];
  albedo_beta?: number;
  albedo_beta_n?: number;
  lst_p02?: number;
  lst_p98?: number;
}

export interface Grid {
  step: number;
  id: number[];
  lat: number[];
  lon: number[];
  locality: string[];
  lst: number[];
  hvi: number[];
  ndvi: number[];
  ndbi: number[];
  tree: number[];
  imp: number[];
  water: number[];
  pop: number[];
  albedo: number[];
  pred: number[];
  cat: number[];
  lever: LeverKey[];
  cool: number[];
}

export interface Contribution {
  feature: string;
  label: string;
  short: string;
  unit: string;
  source: string;
  value: number;
  shap: number;
}

export interface CellLever {
  key: LeverKey;
  label: string;
  intensity: number;
  unit: string;
  delta_lst: number;
  delta_hvi: number;
}

export interface CellDetail {
  id: number;
  lat: number;
  lon: number;
  locality: string;
  lst: number;
  lst_pred: number;
  lst_cv: number;
  hvi: number;
  category: number;
  hvi_rank: number;
  lst_rank: number;
  city_mean_lst: number;
  components: Record<"hazard" | "exposure" | "sensitivity" | "adaptive_gap", number>;
  landcover: Record<"tree_canopy" | "vegetation" | "impervious" | "water" | "bare" | "roof", number>;
  indices: Record<"ndvi" | "ndbi" | "mndwi" | "albedo", number>;
  context: {
    pop_density: number;
    population: number;
    elderly_share: number;
    dist_coast_km: number;
    dist_water_km: number;
    elevation_m: number;
    green_access: number;
  };
  explanation: { base: number; prediction: number; contributions: Contribution[] };
  narrative: string;
  levers: CellLever[];
}

export interface ScenarioInput {
  trees: number;
  parks: number;
  cool_roofs: number;
  depave: number;
  scope: "city" | "localities" | "hotspots";
  localities: string[];
  hotspot_pct: number;
}

export interface SimLocality {
  locality: string;
  delta_lst: number;
  delta_hvi: number;
  lst: number;
  lst_new: number;
  hvi: number;
  hvi_new: number;
  population: number;
}

export interface SimResult {
  lst: number[];
  hvi: number[];
  delta: number[];
  summary: {
    cells_targeted: number;
    population_targeted: number;
    mean_delta_city: number;
    mean_delta_targeted: number;
    max_cooling: number;
    mean_lst_before: number;
    mean_lst_after: number;
    mean_hvi_before: number;
    mean_hvi_after: number;
    pop_high_before: number;
    pop_high_after: number;
    pop_lifted: number;
    cells_severe_before: number;
    cells_severe_after: number;
    category_before: number[];
    category_after: number[];
    footprint_ha: Record<"trees" | "green" | "cool_roofs" | "depave", number>;
  };
  histogram: { t: number; before: number; after: number }[];
  localities: SimLocality[];
}

export interface LocalityStat {
  name: string;
  lat: number;
  lon: number;
  cells: number;
  population: number;
  lst: number;
  lst_max: number;
  hvi: number;
  hvi_max: number;
  tree: number;
  impervious: number;
  vegetation: number;
  pop_density: number;
  high_share: number;
  category: number;
  drivers: { feature: string; short: string; shap: number }[];
  levers: Record<LeverKey, number>;
  best_lever: LeverKey;
  priority: number;
  rank: number;
}

export interface Recommendations {
  sites: {
    cell: number;
    lat: number;
    lon: number;
    locality: string;
    lst: number;
    hvi: number;
    population: number;
    best_lever: LeverKey;
    cooling: number;
    delta_hvi: number;
    narrative: string;
  }[];
  levers: {
    key: LeverKey;
    label: string;
    standard: number;
    unit: string;
    mean_cooling: number;
    max_cooling: number;
    best_in_cells: number;
    pop_best: number;
  }[];
}

export interface ModelInfo {
  metrics: Meta["metrics"];
  importance: { feature: string; label: string; short: string; importance: number; source: string }[];
  dependence: Record<string, { x: number; y: number }[]>;
  base_value: number;
  scatter: { obs: number; pred: number }[];
  n_cells: number;
}

const cache = new Map<string, Promise<unknown>>();

async function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path} → ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  grid: () => get<Grid>("/api/grid"),
  localities: () => get<LocalityStat[]>("/api/localities"),
  recommendations: () => get<Recommendations>("/api/recommendations"),
  model: () => get<ModelInfo>("/api/model"),
  cell: (id: number) => get<CellDetail>(`/api/cell/${id}`),
  simulate: async (s: ScenarioInput, signal?: AbortSignal): Promise<SimResult> => {
    const r = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
      signal,
    });
    if (!r.ok) throw new Error(`simulate → ${r.status}`);
    return r.json();
  },
};

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString("en-IN"),
  compact: (n: number) =>
    n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`,
  million: (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`),
  pct: (n: number, d = 0) => `${(n * 100).toFixed(d)}%`,
  t: (n: number, d = 1) => `${n.toFixed(d)}°C`,
  signed: (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`,
};
