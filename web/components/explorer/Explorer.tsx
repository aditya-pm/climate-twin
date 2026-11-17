"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Box, ChevronDown, Flame, Layers, Search, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Map from "@/components/Map";
import { ApiError, CategoryPill, Legend, Segmented } from "@/components/ui";
import { api, fmt, type CellDetail } from "@/lib/api";
import { CATEGORY_COLORS, EXPLORER_LAYERS, LAYERS, gradientCss, gridValues, type LayerKey } from "@/lib/layers";
import { useApi } from "@/lib/useApi";
import CellPanel from "./CellPanel";

export default function Explorer() {
  const { data: grid, error } = useApi(api.grid);
  const { data: meta } = useApi(api.meta);
  const { data: locs } = useApi(api.localities);
  const [layerKey, setLayerKey] = useState<LayerKey>("hvi");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [selected, setSelected] = useState<number | null>(null);
  const [cell, setCell] = useState<CellDetail | null>(null);
  const [fly, setFly] = useState<{ lon: number; lat: number; zoom?: number; key: number } | null>(null);
  const [q, setQ] = useState("");
  const [qOpen, setQOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const flyKey = useRef(0);

  const layer = LAYERS[layerKey];
  const values = useMemo(() => (grid ? gridValues(grid, layerKey) : []), [grid, layerKey]);

  // deep link: /explore?cell=123
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("cell");
    if (c && grid) {
      const id = Number(c);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from URL on first load
      setSelected(id);
      setFly({ lon: grid.lon[id], lat: grid.lat[id], zoom: 13, key: ++flyKey.current });
    }
  }, [grid]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    api.cell(selected).then((d) => {
      if (alive) setCell(d);
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  const matches = useMemo(
    () => (locs ?? []).filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8),
    [locs, q],
  );

  if (error) return <ApiError error={error} />;

  const goLocality = (name: string) => {
    const l = locs?.find((x) => x.name === name);
    if (!l || !grid) return;
    setFly({ lon: l.lon, lat: l.lat, zoom: 13.2, key: ++flyKey.current });
    // select hottest-vulnerability cell in locality
    let best = -1;
    let bv = -1;
    grid.locality.forEach((n, i) => {
      if (n === name && grid.hvi[i] > bv) {
        bv = grid.hvi[i];
        best = i;
      }
    });
    if (best >= 0) setSelected(best);
    setQ("");
    setQOpen(false);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink">
      <div className="absolute inset-0">
        {grid && (
          <Map
            grid={grid}
            values={values}
            layer={layer}
            extrude={mode === "3d"}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              if (id === null) setCell(null);
            }}
            flyTo={fly}
            padding={typeof window !== "undefined" && window.innerWidth >= 1024 ? { left: 340, right: 440 } : undefined}
            tooltip={(id) => (
              <div className="min-w-[150px]">
                <div className="mb-1 font-semibold">{grid.locality[id]}</div>
                <div className="flex justify-between gap-4 text-fg-2">
                  <span>Surface</span>
                  <span className="num text-fg">{grid.lst[id].toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between gap-4 text-fg-2">
                  <span>HVI</span>
                  <span className="num" style={{ color: CATEGORY_COLORS[grid.cat[id]] }}>
                    {grid.hvi[id].toFixed(0)}
                  </span>
                </div>
                {layerKey !== "hvi" && layerKey !== "lst" && (
                  <div className="flex justify-between gap-4 text-fg-2">
                    <span>{layer.short}</span>
                    <span className="num text-fg">{layer.format(values[id])}</span>
                  </div>
                )}
              </div>
            )}
          />
        )}
      </div>

      {/* LEFT: layers */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass scrollbar-thin absolute left-3 top-[84px] z-20 max-h-[calc(100svh-100px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-2xl sm:left-4"
      >
        <div className="p-4">
          <button onClick={() => setPanelOpen((o) => !o)} className="flex w-full items-start justify-between text-left md:pointer-events-none">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">
                <Layers className="h-3.5 w-3.5" /> Twin explorer
              </div>
              <div className="mt-1 font-display text-xl font-semibold tracking-tight">Chennai heat atlas</div>
            </div>
            <ChevronDown className={`mt-1 h-5 w-5 text-fg-3 transition md:hidden ${panelOpen ? "rotate-180" : ""}`} />
          </button>
          <div className={panelOpen ? "" : "hidden md:block"}>

          {/* search */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setQOpen(true);
              }}
              onFocus={() => setQOpen(true)}
              onBlur={() => setTimeout(() => setQOpen(false), 150)}
              onKeyDown={(e) => e.key === "Enter" && matches[0] && goLocality(matches[0].name)}
              placeholder="Jump to a neighbourhood…"
              className="w-full rounded-xl border border-line bg-black/30 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-fg-3 focus:border-line-2"
            />
            <AnimatePresence>
              {qOpen && q && matches.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line-2 bg-panel-solid"
                >
                  {matches.map((m) => (
                    <button
                      key={m.name}
                      onMouseDown={() => goLocality(m.name)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
                    >
                      {m.name}
                      <CategoryPill cat={m.category} />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "2d", label: <span className="flex items-center justify-center gap-1.5"><Square className="h-3.5 w-3.5" />2D map</span> },
                { value: "3d", label: <span className="flex items-center justify-center gap-1.5"><Box className="h-3.5 w-3.5" />3D twin</span> },
              ]}
            />
          </div>
          </div>
        </div>

        <div className={`space-y-1 px-2 pb-2 ${panelOpen ? "" : "hidden md:block"}`}>
          {EXPLORER_LAYERS.map((k) => {
            const L = LAYERS[k];
            const on = k === layerKey;
            return (
              <button
                key={k}
                onClick={() => setLayerKey(k)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 shrink-0 rounded-md ring-1 ring-white/10" style={{ background: gradientCss(L).replace("90deg", "135deg") }} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-semibold ${on ? "text-fg" : "text-fg-2"}`}>{L.label}</div>
                    {on && <div className="mt-0.5 text-[11px] leading-snug text-fg-3">{L.describe}</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-line p-4">
          <Legend layer={layer} />
          {layerKey === "hvi" && meta && (
            <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[10px]">
              {meta.categories.map((c, i) => (
                <div key={c.name}>
                  <div className="font-semibold" style={{ color: CATEGORY_COLORS[i] }}>{c.name}</div>
                  <div className="num text-fg-3">≥{c.min}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {meta && (
          <div className={`grid grid-cols-2 gap-px border-t border-line bg-line ${panelOpen ? "" : "hidden md:grid"}`}>
            {[
              ["City mean (pop-wtd.)", `${meta.lst_mean.toFixed(1)}°C`],
              ["95th percentile", `${meta.lst_p95.toFixed(1)}°C`],
              ["Severe cells", fmt.int(meta.cells_severe)],
              ["Avg. tree canopy", fmt.pct(meta.tree_mean)],
            ].map(([k, v]) => (
              <div key={k} className="bg-panel-solid/80 px-4 py-3">
                <div className="text-[10px] text-fg-3">{k}</div>
                <div className="num text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>
        )}
      </motion.aside>

      {/* RIGHT: cell detail or hotspots */}
      <AnimatePresence mode="wait">
        {selected !== null ? (
          <motion.aside
            key="cell"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="glass scrollbar-thin absolute bottom-3 right-3 top-[84px] z-20 w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-2xl sm:right-4"
          >
            <CellPanel
              cell={cell}
              loading={cell?.id !== selected}
              onClose={() => {
                setSelected(null);
                setCell(null);
              }}
            />
          </motion.aside>
        ) : (
          <motion.aside
            key="hot"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="glass absolute right-3 top-[84px] z-20 hidden w-[320px] rounded-2xl md:block sm:right-4"
          >
            <div className="p-4 pb-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-3">
                <Flame className="h-3.5 w-3.5 text-heat" /> Most vulnerable
              </div>
              <div className="mt-1 text-xs text-fg-3">Click any cell on the map, or a neighbourhood below.</div>
            </div>
            <div className="px-2 pb-2">
              {(locs ?? []).slice(0, 7).map((l, i) => (
                <button
                  key={l.name}
                  onClick={() => goLocality(l.name)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="num w-5 text-xs text-fg-3">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{l.name}</div>
                    <div className="text-[11px] text-fg-3">
                      <span className="num">{l.lst.toFixed(1)}°C</span> · {fmt.million(l.population)} residents
                    </div>
                  </div>
                  <div className="num text-lg font-semibold" style={{ color: CATEGORY_COLORS[l.category] }}>
                    {l.hvi.toFixed(0)}
                  </div>
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
