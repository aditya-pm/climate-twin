"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Leaf, MapPin, Sparkles, Sun, Trees, X } from "lucide-react";
import { Bar, CategoryPill, Gauge } from "@/components/ui";
import { fmt, type CellDetail, type LeverKey } from "@/lib/api";
import { CATEGORY_COLORS, LEVER_STYLE } from "@/lib/layers";

const LEVER_ICON: Record<LeverKey, React.ReactNode> = {
  trees: <Trees className="h-4 w-4" />,
  parks: <Leaf className="h-4 w-4" />,
  cool_roofs: <Sun className="h-4 w-4" />,
  depave: <Building2 className="h-4 w-4" />,
};

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-5">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">{title}</div>
        {hint && <div className="text-[11px] text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function ShapWaterfall({ cell }: { cell: CellDetail }) {
  const ex = cell.explanation;
  const top = ex.contributions.slice(0, 8);
  const rest = ex.contributions.slice(8).reduce((a, c) => a + c.shap, 0);
  const rows = [...top.map((c) => ({ label: c.label, v: c.shap, raw: c })), { label: `${ex.contributions.length - 8} other factors`, v: rest, raw: null }];
  let run = ex.base;
  const steps = rows.map((r) => {
    const start = run;
    run += r.v;
    return { ...r, start, end: run };
  });
  const lo = Math.min(ex.base, ...steps.map((s) => Math.min(s.start, s.end))) - 0.4;
  const hi = Math.max(ex.base, ...steps.map((s) => Math.max(s.start, s.end))) + 0.4;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;

  const fmtVal = (c: CellDetail["explanation"]["contributions"][number]) =>
    c.unit === "%" ? `${(c.value * 100).toFixed(0)}%` : c.unit === "km" ? `${c.value.toFixed(1)} km` : c.unit === "m" ? `${c.value.toFixed(0)} m` : c.value.toFixed(2);

  return (
    <div>
      <div className="mb-2 flex justify-between text-[11px] text-fg-3">
        <span>
          City baseline <span className="num text-fg-2">{ex.base.toFixed(1)}°C</span>
        </span>
        <span>
          Prediction <span className="num font-semibold text-fg">{ex.prediction.toFixed(1)}°C</span>
        </span>
      </div>
      <div className="space-y-[5px]">
        {steps.map((s, i) => {
          const left = x(Math.min(s.start, s.end));
          const width = Math.max(0.6, Math.abs(x(s.end) - x(s.start)));
          const warm = s.v > 0;
          return (
            <div key={i} className="group grid grid-cols-[132px_1fr_46px] items-center gap-2.5 text-[11px]">
              <div className="truncate text-fg-2" title={s.label}>
                {s.label}
                {s.raw && <span className="ml-1 text-fg-3 num">{fmtVal(s.raw)}</span>}
              </div>
              <div className="relative h-[18px] rounded bg-white/[0.025]">
                <div className="absolute inset-y-0 w-px bg-white/15" style={{ left: `${x(ex.base)}%` }} />
                <motion.div
                  className="absolute top-[3px] h-3 rounded-[3px]"
                  style={{
                    left: `${left}%`,
                    background: warm ? "linear-gradient(90deg,#ff9a4d,#ff4d6d)" : "linear-gradient(90deg,#5cc8ff,#3ee0c8)",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.7, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <div className={`num text-right font-semibold ${warm ? "text-[#ff8a5c]" : "text-cool"}`}>
                {fmt.signed(s.v, 2)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-fg-3">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#ff6a55]" />Adds heat</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-cool" />Removes heat</span>
        <span className="ml-auto">TreeSHAP · °C</span>
      </div>
    </div>
  );
}

export default function CellPanel({ cell, onClose, loading }: { cell: CellDetail | null; onClose: () => void; loading?: boolean }) {
  if (!cell) {
    return (
      <div className="space-y-3 p-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  const catColor = CATEGORY_COLORS[cell.category];
  const diff = cell.lst - cell.city_mean_lst;
  const lc = cell.landcover;
  const cover = [
    { k: "Tree canopy", v: lc.tree_canopy, c: "#2f9e5a" },
    { k: "Grass & shrub", v: Math.max(0, lc.vegetation - lc.tree_canopy), c: "#8fc46a" },
    { k: "Roofs", v: lc.roof, c: "#c9917a" },
    { k: "Paved", v: Math.max(0, lc.impervious - lc.roof), c: "#7d8794" },
    { k: "Water", v: lc.water, c: "#3b8fd9" },
    { k: "Bare soil", v: lc.bare, c: "#c7a96b" },
  ];
  const comps = [
    { k: "Hazard", sub: "surface heat", v: cell.components.hazard, w: 0.45 },
    { k: "Exposure", sub: "population", v: cell.components.exposure, w: 0.25 },
    { k: "Sensitivity", sub: "elderly & informal housing", v: cell.components.sensitivity, w: 0.15 },
    { k: "Adaptive gap", sub: "lack of green & blue access", v: cell.components.adaptive_gap, w: 0.15 },
  ];
  const best = cell.levers[0];
  const maxCool = Math.max(0.5, ...cell.levers.map((l) => -l.delta_lst));

  return (
    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-fg-3">
            <MapPin className="h-3 w-3" />
            <span className="num">
              {cell.lat.toFixed(4)}°N, {cell.lon.toFixed(4)}°E
            </span>
            <span>· cell #{cell.id}</span>
          </div>
          <div className="mt-1 font-display text-2xl font-semibold tracking-tight">{cell.locality}</div>
          <div className="mt-2">
            <CategoryPill cat={cell.category} size="md" />
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-fg-3 transition hover:bg-white/10 hover:text-fg" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 px-5 pb-5">
        <div className="card flex flex-col items-center justify-center px-2 pb-3 pt-4">
          <Gauge value={cell.hvi} color={catColor} size={128} label="VULNERABILITY" />
          <div className="mt-1 text-[11px] text-fg-3">
            Higher than <span className="num text-fg-2">{(cell.hvi_rank * 100).toFixed(0)}%</span> of cells
          </div>
        </div>
        <div className="card flex flex-col justify-between p-4">
          <div className="text-[11px] text-fg-3">Surface temperature</div>
          <div className="num text-4xl font-semibold heat-text">
            {cell.lst.toFixed(1)}
            <span className="text-2xl">°</span>
          </div>
          <div className="text-[11px] leading-snug text-fg-3">
            <span className={`num font-semibold ${diff > 0 ? "text-[#ff8a5c]" : "text-cool"}`}>{fmt.signed(diff)}°C</span> vs city mean
            <br />
            ML estimate <span className="num text-fg-2">{cell.lst_pred.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      {/* AI narrative */}
      <div className="px-5 pb-5">
        <div className="relative overflow-hidden rounded-2xl border border-line-2 bg-[radial-gradient(ellipse_at_top_left,rgba(255,138,61,0.14),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(62,224,200,0.1),transparent_60%)] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ember">
            <Sparkles className="h-3.5 w-3.5" /> Twin diagnosis
          </div>
          <p className="text-[13px] leading-relaxed text-fg">{cell.narrative}</p>
        </div>
      </div>

      <Section title="Why it’s hot" hint="feature contributions">
        <ShapWaterfall cell={cell} />
      </Section>

      <Section title="Best interventions here" hint="standard package, this cell">
        <div className="space-y-2.5">
          {cell.levers.map((l) => {
            const st = LEVER_STYLE[l.key];
            return (
              <div key={l.key} className={`rounded-xl border p-3 ${l.key === best.key ? "border-cool/40 bg-cool/[0.06]" : "border-line bg-white/[0.015]"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${st.color}1f`, color: st.color }}>
                    {LEVER_ICON[l.key]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{l.label}</div>
                    <div className="text-[11px] text-fg-3">
                      {l.unit === "%" ? `${l.intensity}% coverage` : `+${l.intensity} pp of cell area`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-sm font-semibold text-cool">{fmt.signed(l.delta_lst)}°C</div>
                    <div className="num text-[10px] text-fg-3">HVI {fmt.signed(l.delta_hvi)}</div>
                  </div>
                </div>
                <Bar value={-l.delta_lst} max={maxCool} color={st.color} className="mt-2.5" />
              </div>
            );
          })}
        </div>
        <Link
          href={`/simulate?locality=${encodeURIComponent(cell.locality)}`}
          className="group mt-4 flex items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white"
        >
          Simulate {cell.locality} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </Section>

      <Section title="Vulnerability breakdown" hint="weighted index">
        <div className="space-y-3">
          {comps.map((c) => (
            <div key={c.k}>
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span>
                  <span className="font-semibold">{c.k}</span> <span className="text-fg-3">· {c.sub}</span>
                </span>
                <span className="num text-fg-2">
                  {(c.v * 100).toFixed(0)} <span className="text-fg-3">× {c.w}</span>
                </span>
              </div>
              <Bar value={c.v} color={catColor} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Land cover" hint="share of 0.3 km² cell">
        <div className="flex h-3 overflow-hidden rounded-full">
          {cover.map((c) => (
            <motion.div key={c.k} initial={{ width: 0 }} animate={{ width: `${c.v * 100}%` }} transition={{ duration: 0.8 }} style={{ background: c.c }} className="h-full border-r-2 border-[var(--panel-solid)] last:border-r-0" />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
          {cover.map((c) => (
            <div key={c.k} className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: c.c }} />
              <span className="truncate text-fg-3">{c.k}</span>
              <span className="num ml-auto text-fg-2">{(c.v * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Indicators">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["NDVI", cell.indices.ndvi.toFixed(2)],
            ["NDBI", cell.indices.ndbi.toFixed(2)],
            ["MNDWI", cell.indices.mndwi.toFixed(2)],
            ["Albedo", cell.indices.albedo.toFixed(3)],
            ["Population density", `${fmt.int(cell.context.pop_density)}/km²`],
            ["Residents in cell", fmt.int(cell.context.population)],
            ["Aged 65+", fmt.pct(cell.context.elderly_share, 1)],
            ["Green within 1 km", fmt.pct(cell.context.green_access)],
            ["To coast", `${cell.context.dist_coast_km.toFixed(1)} km`],
            ["To water body", `${cell.context.dist_water_km.toFixed(1)} km`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.015] px-3 py-2.5">
              <div className="text-[10px] text-fg-3">{k}</div>
              <div className="num mt-0.5 text-sm font-semibold">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[11px] leading-relaxed text-fg-3">
          Out-of-sample check: spatial cross-validation predicted <span className="num text-fg-2">{cell.lst_cv.toFixed(1)}°C</span> for this cell without ever seeing its 3 km block.
        </div>
      </Section>
    </div>
  );
}
