"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, Leaf, Loader2, RotateCcw, Sparkles, Sun, Trees, Users, Flame, Thermometer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Map from "@/components/Map";
import { ApiError, ChartTooltip, Legend, Segmented, Tween } from "@/components/ui";
import { api, fmt, type LeverKey, type ScenarioInput, type SimResult } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_NAMES, LAYERS, LEVER_STYLE } from "@/lib/layers";
import { useApi } from "@/lib/useApi";
import CompareMap from "./CompareMap";

const LEVER_ICON: Record<LeverKey, React.ReactNode> = {
  trees: <Trees className="h-4 w-4" />,
  parks: <Leaf className="h-4 w-4" />,
  cool_roofs: <Sun className="h-4 w-4" />,
  depave: <Building2 className="h-4 w-4" />,
};

const PRESETS: { name: string; desc: string; v: Pick<ScenarioInput, LeverKey> }[] = [
  { name: "Chennai Cool 2035", desc: "Balanced package", v: { trees: 20, parks: 8, cool_roofs: 60, depave: 25 } },
  { name: "Canopy push", desc: "Trees & parks only", v: { trees: 25, parks: 12, cool_roofs: 0, depave: 0 } },
  { name: "Cool roofs drive", desc: "Paint, not planting", v: { trees: 0, parks: 0, cool_roofs: 85, depave: 0 } },
  { name: "Sponge city", desc: "De-pave & green", v: { trees: 5, parks: 15, cool_roofs: 0, depave: 45 } },
];

const DEFAULT: ScenarioInput = { trees: 15, parks: 5, cool_roofs: 40, depave: 10, scope: "city", localities: [], hotspot_pct: 25 };

export default function Simulator() {
  const { data: grid, error } = useApi(api.grid);
  const { data: meta } = useApi(api.meta);
  const [sc, setSc] = useState<ScenarioInput>(DEFAULT);
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<"lst" | "hvi">("lst");
  const [view, setView] = useState<"swipe" | "delta">("swipe");
  const [locQ, setLocQ] = useState("");
  const abort = useRef<AbortController | null>(null);

  // deep link ?locality=
  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("locality");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from URL on first load
    if (l) setSc((s) => ({ ...s, scope: "localities", localities: [l] }));
  }, []);

  const locKey = sc.scope === "localities" ? sc.localities.join("|") : "";
  const fly = useMemo(() => {
    if (!grid || !locKey) return null;
    const names = locKey.split("|");
    const idx = grid.locality.map((n, i) => (names.includes(n) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const lat = idx.reduce((a, i) => a + grid.lat[i], 0) / idx.length;
    const lon = idx.reduce((a, i) => a + grid.lon[i], 0) / idx.length;
    return { lat, lon, zoom: names.length > 1 ? 11.6 : 12.6, key: idx.length };
  }, [grid, locKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy(true);
      api
        .simulate(sc, ctl.signal)
        .then((r) => {
          setRes(r);
          setBusy(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setBusy(false);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [sc]);

  const mask = useMemo(() => {
    if (!grid || !res) return null;
    if (sc.scope === "city") return null;
    if (sc.scope === "localities") return grid.locality.map((n) => sc.localities.includes(n));
    const sorted = [...grid.hvi].sort((a, b) => b - a);
    const thr = sorted[Math.max(0, Math.floor((sc.hotspot_pct / 100) * sorted.length) - 1)];
    return grid.hvi.map((v) => v >= thr);
  }, [grid, res, sc.scope, sc.localities, sc.hotspot_pct]);

  if (error) return <ApiError error={error} />;

  const s = res?.summary;
  const layer = LAYERS[metric];
  const before = grid ? (metric === "lst" ? grid.lst : grid.hvi) : [];
  const after = res ? (metric === "lst" ? res.lst : res.hvi) : before;
  const setLever = (k: LeverKey, v: number) => setSc((p) => ({ ...p, [k]: v }));
  const activePreset = PRESETS.find((p) => (Object.keys(p.v) as LeverKey[]).every((k) => p.v[k] === sc[k]));
  const locNames = meta?.localities.slice().sort() ?? [];
  const locMatches = locNames.filter((n) => n.toLowerCase().includes(locQ.toLowerCase()) && !sc.localities.includes(n)).slice(0, 6);

  const tooltip = (id: number) =>
    grid && (
      <div className="min-w-[160px]">
        <div className="mb-1 font-semibold">{grid.locality[id]}</div>
        <div className="flex justify-between gap-4 text-fg-2">
          <span>Today</span>
          <span className="num text-fg">{metric === "lst" ? `${grid.lst[id].toFixed(1)}°C` : grid.hvi[id].toFixed(0)}</span>
        </div>
        {res && (
          <>
            <div className="flex justify-between gap-4 text-fg-2">
              <span>Scenario</span>
              <span className="num text-cool">{metric === "lst" ? `${res.lst[id].toFixed(1)}°C` : res.hvi[id].toFixed(0)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-fg-2">
              <span>Change</span>
              <span className="num font-semibold text-cool">{fmt.signed(res.delta[id], 2)}°C</span>
            </div>
          </>
        )}
      </div>
    );

  return (
    <main className="min-h-screen bg-ink pt-[76px] lg:fixed lg:inset-0 lg:pt-[76px]">
      <div className="grid h-full gap-3 p-3 lg:grid-cols-[340px_minmax(0,1fr)_380px]">
        {/* ─────────── CONTROLS ─────────── */}
        <aside className="glass scrollbar-thin flex flex-col overflow-y-auto rounded-2xl lg:h-full">
          <div className="p-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">
                <Sparkles className="h-3.5 w-3.5 text-cool" /> What-if simulator
              </div>
              <button onClick={() => setSc({ ...DEFAULT, trees: 0, parks: 0, cool_roofs: 0, depave: 0 })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-fg-3 transition hover:bg-white/5 hover:text-fg">
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
            <div className="mt-1 font-display text-xl font-semibold tracking-tight">Design a cooler Chennai</div>
          </div>

          <div className="px-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">Presets</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSc((x) => ({ ...x, ...p.v }))}
                  className={`rounded-xl border px-3 py-2 text-left transition ${activePreset?.name === p.name ? "border-cool/50 bg-cool/10" : "border-line hover:border-line-2 hover:bg-white/[0.03]"}`}
                >
                  <div className="flex items-center justify-between text-[12px] font-semibold">
                    {p.name}
                    {activePreset?.name === p.name && <Check className="h-3.5 w-3.5 text-cool" />}
                  </div>
                  <div className="text-[10px] text-fg-3">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-1 px-3">
            {meta &&
              (Object.keys(meta.levers) as LeverKey[]).map((k) => {
                const L = meta.levers[k];
                const st = LEVER_STYLE[k];
                const v = sc[k];
                return (
                  <div key={k} className="rounded-xl px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${st.color}1c`, color: st.color }}>
                        {LEVER_ICON[k]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">{L.label}</div>
                        <div className="truncate text-[10.5px] text-fg-3" title={L.desc}>{L.desc}</div>
                      </div>
                      <div className="num w-14 text-right text-base font-semibold">
                        {L.unit === "pp" ? `+${v}` : `${v}%`}
                        {L.unit === "pp" && <span className="text-[10px] text-fg-3"> pp</span>}
                      </div>
                    </div>
                    <input
                      type="range"
                      className="slider mt-2"
                      min={0}
                      max={L.max}
                      step={1}
                      value={v}
                      onChange={(e) => setLever(k, Number(e.target.value))}
                      style={{ ["--pct" as string]: `${(v / L.max) * 100}%`, ["--track-fill" as string]: st.color }}
                      aria-label={L.label}
                    />
                  </div>
                );
              })}
          </div>

          <div className="mt-2 border-t border-line p-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">Where to intervene</div>
            <Segmented
              value={sc.scope}
              onChange={(scope) => setSc((x) => ({ ...x, scope }))}
              options={[
                { value: "city", label: "Whole city" },
                { value: "hotspots", label: "Hotspots" },
                { value: "localities", label: "Areas" },
              ]}
            />
            {sc.scope === "hotspots" && (
              <div className="mt-4">
                <div className="flex justify-between text-xs">
                  <span className="text-fg-2">Most-vulnerable cells targeted</span>
                  <span className="num font-semibold">{sc.hotspot_pct}%</span>
                </div>
                <input
                  type="range"
                  className="slider mt-1"
                  min={5}
                  max={60}
                  value={sc.hotspot_pct}
                  onChange={(e) => setSc((x) => ({ ...x, hotspot_pct: Number(e.target.value) }))}
                  style={{ ["--pct" as string]: `${((sc.hotspot_pct - 5) / 55) * 100}%`, ["--track-fill" as string]: "#ff8a3d" }}
                  aria-label="Hotspot share"
                />
              </div>
            )}
            {sc.scope === "localities" && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-1.5">
                  {sc.localities.map((n) => (
                    <button
                      key={n}
                      onClick={() => setSc((x) => ({ ...x, localities: x.localities.filter((y) => y !== n) }))}
                      className="flex items-center gap-1 rounded-full border border-cool/40 bg-cool/10 px-2.5 py-1 text-[11px] font-semibold text-cool"
                    >
                      {n} <X className="h-3 w-3" />
                    </button>
                  ))}
                  {!sc.localities.length && <span className="text-xs text-fg-3">Add neighbourhoods to target.</span>}
                </div>
                <input
                  value={locQ}
                  onChange={(e) => setLocQ(e.target.value)}
                  placeholder="Add a neighbourhood…"
                  className="mt-3 w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-fg-3 focus:border-line-2"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {locMatches.map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setSc((x) => ({ ...x, localities: [...x.localities, n] }));
                        setLocQ("");
                      }}
                      className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-2 transition hover:border-line-2 hover:text-fg"
                    >
                      + {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {s && (
              <div className="mt-4 text-[11px] text-fg-3">
                Targeting <span className="num text-fg-2">{fmt.int(s.cells_targeted)}</span> cells ·{" "}
                <span className="num text-fg-2">{fmt.million(s.population_targeted)}</span> residents
              </div>
            )}
          </div>
        </aside>

        {/* ─────────── MAP ─────────── */}
        <section className="relative order-first h-[62vh] overflow-hidden rounded-2xl border border-line lg:order-none lg:h-full">
          {grid &&
            (view === "swipe" ? (
              <CompareMap grid={grid} before={before} after={after} layer={layer} mask={mask} flyTo={fly} tooltip={tooltip} />
            ) : (
              <Map grid={grid} values={res?.delta ?? grid.lst.map(() => 0)} layer={LAYERS.delta} extrude flyTo={fly} tooltip={tooltip} extrudeScale={2400} />
            ))}
          {!grid && <div className="skeleton absolute inset-0" />}

          <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
            <div className="glass flex items-center gap-2 rounded-xl p-1">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "swipe", label: "Before / after" },
                  { value: "delta", label: "Cooling map" },
                ]}
                className="border-0 bg-transparent p-0"
              />
              {view === "swipe" && (
                <Segmented
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: "lst", label: "Temperature" },
                    { value: "hvi", label: "Vulnerability" },
                  ]}
                  className="border-0 bg-transparent p-0"
                />
              )}
            </div>
            <div className="glass rounded-xl px-3 py-2.5">
              <Legend layer={view === "swipe" ? layer : LAYERS.delta} compact />
            </div>
          </div>

          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs text-fg-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cool" /> Re-running the model…
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ─────────── RESULTS ─────────── */}
        <aside className="glass scrollbar-thin overflow-y-auto rounded-2xl lg:h-full">
          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">Projected impact</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Kpi
                icon={<Thermometer className="h-3.5 w-3.5" />}
                label={sc.scope === "city" ? "Avg. cooling, city" : "Avg. cooling, targeted"}
                value={s ? Math.abs(sc.scope === "city" ? s.mean_delta_city : s.mean_delta_targeted) : 0}
                fmtv={(v) => `−${v.toFixed(2)}°`}
                big
              />
              <Kpi icon={<Flame className="h-3.5 w-3.5" />} label="Peak cell cooling" value={s?.max_cooling ?? 0} fmtv={(v) => `−${v.toFixed(1)}°`} big />
              <Kpi icon={<Users className="h-3.5 w-3.5" />} label="Residents out of high risk" value={Math.max(0, s?.pop_lifted ?? 0)} fmtv={(v) => fmt.million(v)} />
              <Kpi
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Severe cells"
                value={s?.cells_severe_after ?? 0}
                fmtv={(v) => `${Math.round(v)}`}
                sub={s ? `from ${s.cells_severe_before}` : undefined}
              />
            </div>
          </div>

          <div className="border-t border-line p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <div className="text-[13px] font-semibold">Residents by surface temperature</div>
              <div className="flex gap-3 text-[10px] text-fg-2">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#ff7a45]" />Today</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-cool" />Scenario</span>
              </div>
            </div>
            <div className="mb-3 text-[11px] text-fg-3">
              Pop.-weighted mean{" "}
              <span className="num text-fg-2">{s ? s.mean_lst_before.toFixed(1) : "—"}°</span> →{" "}
              <span className="num font-semibold text-cool">{s ? <Tween value={s.mean_lst_after} format={(v) => `${v.toFixed(1)}°`} /> : "—"}</span>
            </div>
            <div className="h-44">
              {res && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={res.histogram} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ff7a45" stopOpacity={0.45} />
                        <stop offset="1" stopColor="#ff7a45" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#3ee0c8" stopOpacity={0.5} />
                        <stop offset="1" stopColor="#3ee0c8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: "#6b7685", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}°`} interval={3} />
                    <YAxis tick={{ fill: "#6b7685", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.million(v)} />
                    <Tooltip
                      cursor={{ stroke: "rgba(255,255,255,0.2)" }}
                      content={(p) => (
                        <ChartTooltip
                          {...(p as object)}
                          render={(label, payload) => (
                            <>
                              <div className="mb-1 text-fg-3 num">{label}–{Number(label) + 1}°C</div>
                              {payload.map((x, i) => (
                                <div key={i} className="flex justify-between gap-4">
                                  <span className="text-fg-2">{x.name === "before" ? "Today" : "Scenario"}</span>
                                  <span className="num font-semibold">{fmt.million(Number(x.value))}</span>
                                </div>
                              ))}
                            </>
                          )}
                        />
                      )}
                    />
                    <Area type="monotone" dataKey="before" stroke="#ff7a45" strokeWidth={2} fill="url(#gb)" isAnimationActive animationDuration={500} />
                    <Area type="monotone" dataKey="after" stroke="#3ee0c8" strokeWidth={2} fill="url(#ga)" isAnimationActive animationDuration={500} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border-t border-line p-5">
            <div className="mb-3 text-[13px] font-semibold">Cells by vulnerability class</div>
            {s &&
              (["Today", "Scenario"] as const).map((row, ri) => {
                const arr = ri === 0 ? s.category_before : s.category_after;
                const tot = arr.reduce((a, b) => a + b, 0);
                return (
                  <div key={row} className="mb-3">
                    <div className="mb-1.5 text-[11px] text-fg-3">{row}</div>
                    <div className="flex h-6 gap-[2px] overflow-hidden rounded-md">
                      {arr.map((n, i) => (
                        <motion.div
                          key={i}
                          className="relative flex h-full items-center justify-center overflow-hidden first:rounded-l-md last:rounded-r-md"
                          animate={{ width: `${(n / tot) * 100}%` }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                          style={{ background: CATEGORY_COLORS[i] }}
                          title={`${CATEGORY_NAMES[i]}: ${n} cells`}
                        >
                          {n / tot > 0.08 && <span className="num text-[10px] font-bold text-black/70">{n}</span>}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            <div className="mt-1 flex gap-3 text-[10px] text-fg-3">
              {CATEGORY_NAMES.map((n, i) => (
                <span key={n} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_COLORS[i] }} />{n}</span>
              ))}
            </div>
          </div>

          <div className="border-t border-line p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[13px] font-semibold">Biggest gains by neighbourhood</div>
              <div className="text-[10px] text-fg-3">pop.-weighted ΔLST</div>
            </div>
            <div className="space-y-2">
              {res?.localities.slice(0, 8).map((l) => {
                const max = Math.abs(res.localities[0].delta_lst) || 1;
                return (
                  <div key={l.locality} className="grid grid-cols-[110px_1fr_52px] items-center gap-2 text-xs">
                    <span className="truncate text-fg-2">{l.locality}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-[#1a7f88] to-cool" animate={{ width: `${(Math.abs(l.delta_lst) / max) * 100}%` }} transition={{ duration: 0.6 }} />
                    </div>
                    <span className="num text-right font-semibold text-cool">{fmt.signed(l.delta_lst, 2)}°</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-line p-5">
            <div className="mb-3 text-[13px] font-semibold">Implementation footprint</div>
            <div className="grid grid-cols-2 gap-2">
              {s &&
                [
                  { k: "New tree canopy", v: s.footprint_ha.trees, c: LEVER_STYLE.trees.color },
                  { k: "New green surface", v: s.footprint_ha.green, c: LEVER_STYLE.parks.color },
                  { k: "Cool roofs coated", v: s.footprint_ha.cool_roofs, c: LEVER_STYLE.cool_roofs.color },
                  { k: "Concrete removed", v: s.footprint_ha.depave, c: LEVER_STYLE.depave.color },
                ].map((x) => (
                  <div key={x.k} className="rounded-xl border border-line bg-white/[0.015] px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-fg-3">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.c }} />
                      {x.k}
                    </div>
                    <div className="num mt-0.5 text-sm font-semibold">
                      <Tween value={x.v} format={(v) => fmt.int(v)} /> <span className="text-[10px] font-normal text-fg-3">ha</span>
                    </div>
                  </div>
                ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-fg-3">
              Estimates come from re-running the XGBoost surface-temperature model on modified land cover. They describe
              afternoon surface temperature, not air temperature, and assume interventions are fully established.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Kpi({ icon, label, value, fmtv, big, sub }: { icon: React.ReactNode; label: string; value: number; fmtv: (v: number) => string; big?: boolean; sub?: string }) {
  return (
    <div className={`rounded-2xl border border-line p-3.5 ${big ? "bg-[radial-gradient(ellipse_at_top_left,rgba(62,224,200,0.12),transparent_70%)]" : "bg-white/[0.015]"}`}>
      <div className="flex items-center gap-1.5 text-[10.5px] text-fg-3">
        {icon}
        {label}
      </div>
      <div className={`num mt-1.5 font-semibold ${big ? "text-3xl cool-text" : "text-2xl"}`}>
        <Tween value={value} format={fmtv} />
      </div>
      {sub && <div className="num text-[10px] text-fg-3">{sub}</div>}
    </div>
  );
}
