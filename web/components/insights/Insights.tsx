"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpRight, Building2, Leaf, MapPin, Sun, Trees } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";
import { ApiError, CategoryPill, ChartTooltip, Eyebrow } from "@/components/ui";
import { api, fmt, type LeverKey, type LocalityStat } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_NAMES, LEVER_STYLE } from "@/lib/layers";
import { useApi } from "@/lib/useApi";

const LEVER_ICON: Record<LeverKey, React.ReactNode> = {
  trees: <Trees className="h-3.5 w-3.5" />,
  parks: <Leaf className="h-3.5 w-3.5" />,
  cool_roofs: <Sun className="h-3.5 w-3.5" />,
  depave: <Building2 className="h-3.5 w-3.5" />,
};
const LEVER_SHORT: Record<LeverKey, string> = { trees: "Street trees", parks: "Pocket parks", cool_roofs: "Cool roofs", depave: "De-concreting" };

type SortKey = "rank" | "name" | "hvi" | "lst" | "tree" | "impervious" | "population";

export default function Insights() {
  const { data: locs, error } = useApi(api.localities);
  const { data: rec } = useApi(api.recommendations);
  const { data: meta } = useApi(api.meta);
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "hvi", desc: true });

  const rows = useMemo(() => {
    if (!locs) return [];
    const r = [...locs];
    r.sort((a, b) => {
      const va = a[sort.k as keyof LocalityStat] as number | string;
      const vb = b[sort.k as keyof LocalityStat] as number | string;
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.desc ? -c : c;
    });
    return r;
  }, [locs, sort]);

  if (error) return <ApiError error={error} />;

  const topLever = rec?.levers.slice().sort((a, b) => b.mean_cooling - a.mean_cooling)[0];
  const maxLever = Math.max(0.1, ...(rec?.levers.map((l) => l.max_cooling) ?? [1]));

  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`px-3 py-3 font-semibold ${cls}`}>
      <button
        onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : true }))}
        className={`inline-flex items-center gap-1 transition hover:text-fg ${sort.k === k ? "text-fg" : ""}`}
      >
        {label}
        {sort.k === k && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-32 sm:px-8">
      <Eyebrow>
        <span className="h-px w-8 bg-fg-3" /> Insights & recommendations
      </Eyebrow>
      <div className="mt-4 grid items-end gap-8 lg:grid-cols-[1.3fr_1fr]">
        <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
          Where to act first, <span className="font-serif font-normal italic text-fg-2">and with what.</span>
        </h1>
        <p className="text-base leading-relaxed text-fg-2">
          The twin tests every intervention in every cell, then ranks sites by how much vulnerability they remove for
          the people who live there. Priority sites combine high heat, dense population and a lever that actually works locally.
        </p>
      </div>

      {/* KPIs */}
      <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Neighbourhoods analysed", v: locs ? `${locs.length}` : "—", s: meta ? `${fmt.int(meta.cells)} grid cells` : "" },
          { k: "Residents in high / severe cells", v: meta ? fmt.million(meta.pop_high) : "—", s: meta ? `${fmt.pct(meta.pop_high / meta.population)} of population` : "" },
          { k: "Most effective lever city-wide", v: topLever ? LEVER_SHORT[topLever.key] : "—", s: topLever ? `−${topLever.mean_cooling.toFixed(2)}°C avg at standard dose` : "" },
          { k: "Most vulnerable neighbourhood", v: locs?.[0]?.name ?? "—", s: locs?.[0] ? `HVI ${locs[0].hvi.toFixed(0)} · ${locs[0].lst.toFixed(1)}°C` : "" },
        ].map((x) => (
          <div key={x.k} className="card p-5">
            <div className="text-[11px] text-fg-3">{x.k}</div>
            <div className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{x.v}</div>
            <div className="mt-1 text-xs text-fg-3">{x.s}</div>
          </div>
        ))}
      </div>

      {/* Priority sites */}
      <section className="mt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Priority intervention sites</h2>
            <p className="mt-1 text-sm text-fg-3">One top-ranked cell per neighbourhood, ordered by people protected × vulnerability reduced.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(rec?.sites ?? (Array(6).fill(null) as null[])).slice(0, 9).map((s, i) =>
            s ? (
              <motion.div
                key={s.cell}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.06 }}
                className="card group flex flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="num flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold">{i + 1}</span>
                      <span className="font-display text-lg font-semibold">{s.locality}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-fg-3">
                      <MapPin className="h-3 w-3" /> <span className="num">{s.lat.toFixed(3)}, {s.lon.toFixed(3)}</span> · {fmt.int(s.population)} residents
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-2xl font-semibold heat-text">{s.lst.toFixed(1)}°</div>
                    <div className="num text-[10px] text-fg-3">HVI {s.hvi.toFixed(0)}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${LEVER_STYLE[s.best_lever].color}1f`, color: LEVER_STYLE[s.best_lever].color }}>
                    {LEVER_ICON[s.best_lever]}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">{LEVER_STYLE[s.best_lever].verb}</div>
                    <div className="text-[11px] text-fg-3">Best single lever here</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-sm font-semibold text-cool">−{s.cooling.toFixed(1)}°C</div>
                    <div className="num text-[10px] text-fg-3">HVI {fmt.signed(s.delta_hvi)}</div>
                  </div>
                </div>
                <p className="mt-4 line-clamp-4 text-[12.5px] leading-relaxed text-fg-2">{s.narrative}</p>
                <div className="mt-auto flex gap-2 pt-5">
                  <Link href={`/explore?cell=${s.cell}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-2 py-2 text-xs font-semibold transition hover:bg-white/5">
                    View on map
                  </Link>
                  <Link href={`/simulate?locality=${encodeURIComponent(s.locality)}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-fg py-2 text-xs font-semibold text-ink transition hover:bg-white">
                    Simulate <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.div>
            ) : (
              <div key={i} className="skeleton h-72 rounded-[20px]" />
            ),
          )}
        </div>
      </section>

      {/* Levers + scatter */}
      <section className="mt-20 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">Lever effectiveness</h3>
          <p className="mt-1 text-xs text-fg-3">Each lever applied city-wide at its standard dose, one at a time.</p>
          <div className="mt-6 space-y-6">
            {rec?.levers
              .slice()
              .sort((a, b) => b.mean_cooling - a.mean_cooling)
              .map((l) => {
                const st = LEVER_STYLE[l.key];
                return (
                  <div key={l.key}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${st.color}1f`, color: st.color }}>
                        {LEVER_ICON[l.key]}
                      </span>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">{l.label}</div>
                        <div className="text-[10.5px] text-fg-3">
                          {l.unit === "%" ? `${l.standard}% coverage` : `+${l.standard} pp`} · best option for <span className="num text-fg-2">{fmt.million(l.pop_best)}</span> residents
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-[11px]">
                        <span className="text-fg-3">Average</span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <motion.div className="h-full rounded-full" style={{ background: st.color }} initial={{ width: 0 }} animate={{ width: `${(l.mean_cooling / maxLever) * 100}%` }} transition={{ duration: 0.9 }} />
                        </div>
                        <span className="num text-right font-semibold">−{l.mean_cooling.toFixed(2)}°</span>
                      </div>
                      <div className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-[11px]">
                        <span className="text-fg-3">Best cell</span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <motion.div className="h-full rounded-full opacity-45" style={{ background: st.color }} initial={{ width: 0 }} animate={{ width: `${(l.max_cooling / maxLever) * 100}%` }} transition={{ duration: 0.9, delay: 0.1 }} />
                        </div>
                        <span className="num text-right text-fg-2">−{l.max_cooling.toFixed(1)}°</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl font-semibold tracking-tight">Canopy vs. heat, by neighbourhood</h3>
          <p className="mt-1 text-xs text-fg-3">Bubble size = residents · colour = vulnerability class</p>
          <div className="mt-4 h-[360px]">
            {locs && (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 18, left: -6 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" dataKey="tree" name="Tree canopy" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: "#6b7685", fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: "Mean tree canopy", position: "insideBottom", offset: -10, fill: "#6b7685", fontSize: 11 }} />
                  <YAxis type="number" dataKey="lst" name="LST" domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => `${v.toFixed(0)}°`} tick={{ fill: "#6b7685", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ZAxis type="number" dataKey="population" range={[30, 600]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.2)" }}
                    content={(p) => (
                      <ChartTooltip
                        {...(p as object)}
                        render={(_, payload) => {
                          const d = payload[0]?.payload as unknown as LocalityStat;
                          return (
                            <div className="min-w-[160px]">
                              <div className="mb-1 font-semibold">{d.name}</div>
                              <div className="flex justify-between gap-4 text-fg-2"><span>Surface</span><span className="num text-fg">{d.lst.toFixed(1)}°C</span></div>
                              <div className="flex justify-between gap-4 text-fg-2"><span>Canopy</span><span className="num text-fg">{fmt.pct(d.tree)}</span></div>
                              <div className="flex justify-between gap-4 text-fg-2"><span>Residents</span><span className="num text-fg">{fmt.int(d.population)}</span></div>
                              <div className="mt-1"><CategoryPill cat={d.category} /></div>
                            </div>
                          );
                        }}
                      />
                    )}
                  />
                  <Scatter data={locs} isAnimationActive>
                    {locs.map((l) => (
                      <Cell key={l.name} fill={CATEGORY_COLORS[l.category]} fillOpacity={0.75} stroke="#0e131a" strokeWidth={2} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-fg-3">
            {CATEGORY_NAMES.map((n, i) => (
              <span key={n} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[i] }} />{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="mt-20">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Neighbourhood ranking</h2>
        <p className="mt-1 text-sm text-fg-3">Click a column to sort. Drivers are the factors adding the most heat on average (SHAP).</p>
        <div className="card scrollbar-thin mt-6 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-3">
              <tr>
                {th("rank", "#", "pl-5")}
                {th("name", "Neighbourhood")}
                {th("hvi", "Vulnerability")}
                {th("lst", "Surface temp")}
                {th("tree", "Canopy")}
                {th("impervious", "Sealed")}
                {th("population", "Residents")}
                <th className="px-3 py-3 font-semibold">Top heat drivers</th>
                <th className="px-3 py-3 pr-5 font-semibold">Best lever</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.name} className="border-b border-line/60 transition last:border-0 hover:bg-white/[0.025]">
                  <td className="num px-3 py-3 pl-5 text-fg-3">{l.rank}</td>
                  <td className="px-3 py-3">
                    <Link href={`/simulate?locality=${encodeURIComponent(l.name)}`} className="font-semibold hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="num w-7 font-semibold" style={{ color: CATEGORY_COLORS[l.category] }}>{l.hvi.toFixed(0)}</span>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${l.hvi}%`, background: CATEGORY_COLORS[l.category] }} />
                      </div>
                    </div>
                  </td>
                  <td className="num px-3 py-3">{l.lst.toFixed(1)}°C</td>
                  <td className="num px-3 py-3 text-fg-2">{fmt.pct(l.tree)}</td>
                  <td className="num px-3 py-3 text-fg-2">{fmt.pct(l.impervious)}</td>
                  <td className="num px-3 py-3 text-fg-2">{fmt.int(l.population)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {l.drivers.slice(0, 2).map((d) => (
                        <span key={d.feature} className="rounded-md bg-[#ff6a55]/10 px-1.5 py-0.5 text-[10.5px] text-[#ff9a80]">
                          {d.short} <span className="num">+{d.shap.toFixed(1)}°</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 pr-5">
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: LEVER_STYLE[l.best_lever].color }}>
                      {LEVER_ICON[l.best_lever]}
                      <span className="text-fg-2">{LEVER_SHORT[l.best_lever]}</span>
                      <span className="num text-fg-3">−{l.levers[l.best_lever].toFixed(1)}°</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
