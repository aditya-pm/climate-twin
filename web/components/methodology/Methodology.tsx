"use client";

import { motion } from "framer-motion";
import { Database, FlaskConical, Satellite } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ApiError, ChartTooltip, Eyebrow } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const HVI_PARTS = [
  { k: "hazard", label: "Hazard", d: "Land surface temperature, rescaled between the city’s 2nd and 98th percentiles", c: "#f08a4b" },
  { k: "exposure", label: "Exposure", d: "log population density", c: "#d24f7d" },
  { k: "sensitivity", label: "Sensitivity", d: "Share aged 65+ and crowding (residents per m² of built surface)", c: "#9a5cd0" },
  { k: "adaptive_gap", label: "Adaptive gap", d: "1 − (green access within ~1 km, blue-space proximity)", c: "#4a8fd9" },
];

const tick = { fill: "#6b7685", fontSize: 10 };

const SOURCES: [string, string, string][] = [
  ["Surface temperature (target)", "Landsat 8/9 Collection-2 Level-2 ST_B10 — USGS, via Microsoft Planetary Computer", "QA_PIXEL cloud & shadow mask, per-pixel median, cell mean (°C)"],
  ["Albedo", "Landsat 8/9 surface reflectance", "Liang (2001) shortwave formula, median"],
  ["NDVI · NDBI · MNDWI", "Sentinel-2 L2A — ESA Copernicus, via Planetary Computer", "SCL cloud mask, per-date index, median"],
  ["Land-cover fractions", "ESA WorldCover 2021 v200, 10 m", "Tree, other vegetation, built-up, bare and water shares per cell"],
  ["Building density", "JRC GHS-BUILT-S R2023A (2020), 100 m", "Built-surface share per cell"],
  ["Elevation", "Copernicus DEM GLO-30", "Cell mean"],
  ["Distance to water / coast", "Derived from the WorldCover water mask", "Euclidean distance; sea = water connected to the Bay of Bengal"],
  ["Population · aged 65+", "WorldPop 2020 constrained 100 m; WorldPop age/sex 1 km", "Sum per cell; 65+ share"],
  ["Non-residential buildings", "JRC GHS-BUILT-S NRES R2023A (2020), 100 m", "Share of each cell covered by industrial / commercial / institutional buildings"],
];

export default function Methodology() {
  const { data: m, error } = useApi(api.model);
  const { data: meta } = useApi(api.meta);
  const [feat, setFeat] = useState<string>("ndbi");

  if (error) return <ApiError error={error} />;

  const models = m ? Object.entries(m.metrics.models) : [];
  const maxImp = m ? m.importance[0].importance : 1;
  const dep = m?.dependence[feat] ?? [];
  const featMeta = meta?.features[feat];

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-24 pt-32 sm:px-8">
      <Eyebrow>
        <span className="h-px w-8 bg-fg-3" /> Methodology
      </Eyebrow>
      <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
        How the twin thinks, <span className="font-serif font-normal italic text-fg-2">and how far to trust it.</span>
      </h1>

      <section className="card mt-10 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <Satellite className="h-5 w-5 text-cool" />
          <div>
            <div className="font-display text-lg font-semibold">Real, public data</div>
            <div className="text-xs text-fg-3">
              All layers are open and need no account. Satellite data: {meta?.data_info?.season ?? "April–June, 2023–2025"}
              {meta?.scenes ? ` · ${meta.scenes.landsat} Landsat scenes · ${meta.scenes.sentinel2} Sentinel-2 granules` : ""}.
            </div>
          </div>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-fg-3">
              <tr className="border-b border-line">
                <th className="px-6 py-3 font-semibold">Layer</th>
                <th className="px-3 py-3 font-semibold">Dataset</th>
                <th className="px-6 py-3 font-semibold">Processing</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map(([layer, ds, proc]) => (
                <tr key={layer} className="border-b border-line/60 last:border-0">
                  <td className="px-6 py-3 font-semibold">{layer}</td>
                  <td className="px-3 py-3 text-fg-2">{ds}</td>
                  <td className="px-6 py-3 text-fg-3">{proc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* pipeline */}
      <section className="mt-20 grid gap-4 md:grid-cols-3">
        {[
          { i: <Database className="h-5 w-5" />, t: "Data → features", b: "Each ~550 m cell carries 11 predictors: NDVI, NDBI, MNDWI, broadband albedo, tree canopy, impervious and building fractions, distance to coast and water, elevation, and the share of industrial land use." },
          { i: <FlaskConical className="h-5 w-5" />, t: "Model & validation", b: `XGBoost (650 trees, depth 3) predicts the April–June Landsat LST composite. Performance is measured with ${m?.metrics.folds ?? 5}-fold spatial block cross-validation on ${m?.metrics.block_km ?? 3} km blocks, so neighbouring cells never leak between train and test.` },
          { i: <FlaskConical className="h-5 w-5" />, t: "Simulation", b: "Interventions edit land-cover fractions, recompute spectral indices through a linear un-mixing model fitted on the real imagery (each cell keeps its own residual), and re-predict. Only the change in prediction is applied to observed LST, so model bias cancels out." },
        ].map((x) => (
          <div key={x.t} className="card p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-white/5">{x.i}</div>
            <div className="mt-5 font-display text-lg font-semibold">{x.t}</div>
            <p className="mt-2 text-sm leading-relaxed text-fg-2">{x.b}</p>
          </div>
        ))}
      </section>

      {/* model comparison + scatter */}
      <section className="mt-20 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">Model comparison</h3>
          <p className="mt-1 text-xs text-fg-3">Spatial block CV · out-of-sample</p>
          <table className="mt-6 w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-fg-3">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-semibold">Model</th>
                <th className="py-2 text-right font-semibold">R²</th>
                <th className="py-2 text-right font-semibold">MAE</th>
                <th className="py-2 text-right font-semibold">RMSE</th>
              </tr>
            </thead>
            <tbody>
              {models.map(([name, v]) => (
                <tr key={name} className="border-b border-line/50 last:border-0">
                  <td className="py-3 font-semibold">
                    {name}
                    {name === "XGBoost" && <span className="ml-2 rounded-full bg-cool/15 px-2 py-0.5 text-[10px] font-semibold text-cool">deployed</span>}
                  </td>
                  <td className="num py-3 text-right">{v.r2.toFixed(3)}</td>
                  <td className="num py-3 text-right text-fg-2">{v.mae.toFixed(2)}°</td>
                  <td className="num py-3 text-right text-fg-2">{v.rmse.toFixed(2)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 space-y-3">
            {models.map(([name, v]) => (
              <div key={name} className="grid grid-cols-[110px_1fr] items-center gap-3 text-[11px]">
                <span className="text-fg-3">{name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: name === "XGBoost" ? "#3ee0c8" : "#6b7685" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, (v.r2 - 0.8) / 0.2) * 100}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </div>
            ))}
            <div className="text-right text-[10px] text-fg-3">R², axis from 0.80 to 1.00</div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">Observed vs. predicted</h3>
          <p className="mt-1 text-xs text-fg-3">600 random cells, each predicted by a model that never saw its spatial block</p>
          <div className="mt-4 h-[320px]">
            {m && (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 16, left: -8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" dataKey="obs" domain={[30, 50]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}°`} label={{ value: "Observed LST", position: "insideBottom", offset: -8, fill: "#6b7685", fontSize: 11 }} />
                  <YAxis type="number" dataKey="pred" domain={[30, 50]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}°`} />
                  <ReferenceLine segment={[{ x: 30, y: 30 }, { x: 50, y: 50 }]} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                  <Tooltip
                    content={(p) => (
                      <ChartTooltip
                        {...(p as object)}
                        render={(_, payload) => {
                          const d = payload[0]?.payload as { obs: number; pred: number };
                          return (
                            <div className="num">
                              obs {d.obs.toFixed(1)}° · pred {d.pred.toFixed(1)}°
                            </div>
                          );
                        }}
                      />
                    )}
                  />
                  <Scatter data={m.scatter} fill="#3ee0c8" fillOpacity={0.55} shape="circle" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* importance + dependence */}
      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">What drives surface heat</h3>
          <p className="mt-1 text-xs text-fg-3">Mean |SHAP| across all cells, °C. Click to inspect.</p>
          <div className="mt-6 space-y-1.5">
            {m?.importance.map((f, i) => (
              <button
                key={f.feature}
                onClick={() => setFeat(f.feature)}
                className={`grid w-full grid-cols-[150px_1fr_44px] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition ${feat === f.feature ? "bg-white/[0.07]" : "hover:bg-white/[0.03]"}`}
              >
                <span className={`truncate ${feat === f.feature ? "font-semibold text-fg" : "text-fg-2"}`}>{f.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.04]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#ff8a3d] to-[#ff4d6d]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(f.importance / maxImp) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.04 }}
                  />
                </div>
                <span className="num text-right text-fg-2">{f.importance.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">SHAP dependence · {featMeta?.label ?? feat}</h3>
          <p className="mt-1 text-xs text-fg-3">
            How the feature’s value changes its contribution to temperature. Source: {featMeta?.source ?? "—"}
          </p>
          <div className="mt-4 h-[340px]">
            {m && (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 16, left: -8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" dataKey="x" domain={["auto", "auto"]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => (featMeta?.unit === "%" ? `${(v * 100).toFixed(0)}%` : Number(v).toFixed(featMeta?.unit === "km" || featMeta?.unit === "m" ? 0 : 2))} label={{ value: featMeta?.short ?? feat, position: "insideBottom", offset: -8, fill: "#6b7685", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                  <Scatter data={dep} fill="#ff7a45" fillOpacity={0.55} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* HVI */}
      <section className="mt-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Heat Vulnerability Index</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
          Following the IPCC risk framing (hazard × exposure × vulnerability), each cell’s HVI is a weighted sum of four
          normalised components on a 0–100 scale. Classes: Low &lt; {meta?.categories[1].min ?? 35} ≤ Moderate &lt;{" "}
          {meta?.categories[2].min ?? 50} ≤ High &lt; {meta?.categories[3].min ?? 65} ≤ Severe.
        </p>
        <div className="card mt-6 p-6">
          <div className="num mb-6 overflow-x-auto whitespace-nowrap text-sm text-fg-2">
            HVI = 100 × (<span className="text-[#f08a4b]">0.45·H</span> + <span className="text-[#d24f7d]">0.25·E</span> + <span className="text-[#b07ae0]">0.15·S</span> + <span className="text-[#6aa8ea]">0.15·(1−A)</span>)
          </div>
          <div className="flex h-10 gap-[2px] overflow-hidden rounded-xl">
            {HVI_PARTS.map((p) => (
              <div key={p.k} className="flex items-center justify-center text-[11px] font-semibold text-black/75" style={{ width: `${(meta?.hvi_weights[p.k] ?? 0.25) * 100}%`, background: p.c }}>
                {((meta?.hvi_weights[p.k] ?? 0) * 100).toFixed(0)}%
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HVI_PARTS.map((p) => (
              <div key={p.k}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.c }} />
                  {p.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fg-3">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Levers */}
      <section className="mt-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight">What each intervention changes</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Urban tree canopy (+pp)", "Converts bare ground, then lawn, then up to 30% of paved edges to tree crown — so dense cores with little open ground gain less. Raises NDVI and canopy, lowers NDBI and impervious fraction."],
            ["Pocket parks (+pp)", "Converts vacant/bare land first, then up to 30% of paved plazas, into mixed planting (≈45% trees)."],
            ["Cool roofs (% of roofs)", `Blends roof albedo toward 0.65 for the chosen share of GHSL building footprint. The resulting albedo rise is converted to cooling with a sensitivity of ${meta?.albedo_beta !== undefined ? (meta.albedo_beta / 10).toFixed(2) : "−0.35"} °C per +0.1 albedo, estimated from ${meta?.albedo_beta_n ?? "~1,100"} built-up Chennai cells with controls.`],
            ["De-concreting (% of paving)", "Replaces a share of paved ground with permeable vegetated surfaces (80% grass, 20% soil)."],
          ].map(([t, d]) => (
            <div key={t} className="card p-5">
              <div className="font-semibold">{t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Limitations */}
      <section className="mt-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Limitations</h2>
        <ul className="mt-6 grid gap-3 text-sm leading-relaxed text-fg-2 md:grid-cols-2">
          {[
            "Land surface temperature is not air temperature or heat-index; human thermal exposure also depends on humidity, wind and shade.",
            "Tree-based models interpolate well but extrapolate poorly; very aggressive scenarios are capped to the training range and should be read as indicative.",
            "Each cell is simulated independently except for green-access smoothing; advective cooling from large parks to neighbours is only partly captured.",
            "SHAP values describe the model, not physical causality. Correlated inputs (NDBI and impervious cover) share credit.",
            "Landsat passes over at about 10:30 IST, so the target is late-morning surface heat; afternoon peaks are higher. The composite blends three summers (2023–2025).",
            "Population is WorldPop 2020 and buildings are GHSL 2020; sensitivity uses age and crowding only, as no open informal-settlement layer exists. Ward-level census and health data would sharpen it.",
            "Cool roofs push albedo beyond anything observed in Chennai, where tree models cannot extrapolate, so their effect uses a partial albedo sensitivity estimated from built-up cells, not measured retrofits.",
          ].map((t) => (
            <li key={t} className="card flex gap-3 p-4">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
              {t}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
