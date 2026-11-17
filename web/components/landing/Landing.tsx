"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Building2,
  Droplets,
  Layers3,
  Leaf,
  Lightbulb,
  Map as MapIcon,
  Satellite,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Sun,
  ThermometerSun,
  Trees,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Map from "@/components/Map";
import { Logo } from "@/components/NavBar";
import { CountUp, Eyebrow, Legend } from "@/components/ui";
import { api, fmt, type SimResult } from "@/lib/api";
import { LAYERS } from "@/lib/layers";
import { useApi } from "@/lib/useApi";

const ease = [0.16, 1, 0.3, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.9, delay: 0.08 * i, ease } }),
};

export default function Landing() {
  const { data: meta } = useApi(api.meta);
  const { data: grid } = useApi(api.grid);
  const { data: locs } = useApi(api.localities);
  const [teaser, setTeaser] = useState<SimResult | null>(null);

  useEffect(() => {
    api
      .simulate({ trees: 20, parks: 5, cool_roofs: 50, depave: 15, scope: "hotspots", localities: [], hotspot_pct: 25 })
      .then(setTeaser)
      .catch(() => {});
  }, []);

  const hot = locs?.slice().sort((a, b) => b.lst - a.lst)[0];
  const cool = locs?.slice().sort((a, b) => a.lst - b.lst).find((l) => l.population > 20000);

  return (
    <main className="relative overflow-x-clip">
      {/* ───────────────────────── HERO ───────────────────────── */}
      <section className="relative min-h-[100svh] w-full lg:min-h-[760px]">
        <div className="absolute inset-0">
          {grid && (
            <Map
              grid={grid}
              values={grid.lst}
              layer={LAYERS.lst}
              extrude
              extrudeScale={2600}
              interactive={false}
              controls={false}
              autoRotate
              initial={{ center: [80.215, 13.04], zoom: 10.45, pitch: 60, bearing: -25 }}
              padding={typeof window !== "undefined" && window.innerWidth >= 1024 ? { left: window.innerWidth * 0.42 } : undefined}
            />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_75%_45%,transparent_0%,rgba(6,8,11,0.35)_45%,rgba(6,8,11,0.92)_85%)]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent md:via-ink/45" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/80 to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1400px] flex-col justify-center px-5 pb-12 pt-28 sm:px-8 lg:min-h-[760px]">
          <motion.div initial="hidden" animate="show" className="max-w-[720px]">
            <motion.div variants={fadeUp} custom={0}>
              <span className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-black/40 px-3 py-1.5 text-xs font-medium text-fg-2 backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="pulse-ring absolute inset-0 rounded-full bg-heat" />
                  <span className="relative h-2 w-2 rounded-full bg-heat" />
                </span>
                AI climate digital twin · Chennai, India
              </span>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="mt-6 font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-7xl lg:text-[88px]"
            >
              See where the city
              <br />
              <span className="heat-text">burns.</span>{" "}
              <span className="font-serif font-normal italic tracking-[-0.01em] text-fg">Design</span>
              <br className="hidden sm:block" />
              <span className="font-serif font-normal italic tracking-[-0.01em] cool-text"> how it cools.</span>
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="mt-7 max-w-[540px] text-[17px] leading-relaxed text-fg-2">
              ClimateTwin fuses satellite observations with machine learning to map urban heat vulnerability block by
              block, explain what drives it, and simulate how trees, parks, cool roofs and de-concreting would change it.
            </motion.p>
            <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="group inline-flex items-center gap-2 rounded-2xl bg-fg px-5 py-3.5 text-sm font-semibold text-ink transition hover:bg-white"
              >
                Explore the twin
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/simulate"
                className="group inline-flex items-center gap-2 rounded-2xl border border-line-2 bg-white/5 px-5 py-3.5 text-sm font-semibold backdrop-blur transition hover:bg-white/10"
              >
                <SlidersHorizontal className="h-4 w-4 text-cool" />
                Run a what-if
              </Link>
            </motion.div>
          </motion.div>

          {/* stat strip */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease }}
            className="glass mt-14 grid max-w-[920px] grid-cols-2 divide-line rounded-3xl md:grid-cols-4 md:divide-x"
          >
            {[
              { k: "Residents in high-risk cells", v: meta ? meta.pop_high / 1e6 : 0, d: 1, s: "M", c: "text-fg" },
              { k: "Peak surface temperature", v: meta?.lst_max ?? 0, d: 1, s: "°C", c: "heat-text" },
              { k: "Grid cells modelled", v: meta?.cells ?? 0, d: 0, s: "", c: "text-fg" },
              { k: "Model accuracy (spatial CV R²)", v: meta?.model_r2 ?? 0, d: 2, s: "", c: "cool-text" },
            ].map((s, i) => (
              <div key={i} className="px-5 py-4 sm:px-6 sm:py-5">
                <div className={`num text-2xl font-semibold sm:text-[32px] ${s.c}`}>
                  {meta ? <CountUp value={s.v} decimals={s.d} suffix={s.s} /> : <span className="opacity-30">—</span>}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-fg-3 sm:text-xs">{s.k}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* legend chip */}
        <div className="glass absolute bottom-8 right-8 z-10 hidden rounded-2xl px-4 py-3 lg:block">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-3">
            <ThermometerSun className="h-3.5 w-3.5" /> Land surface temp · Apr–Jun, Landsat 8/9
          </div>
          <Legend layer={LAYERS.lst} compact />
        </div>
      </section>

      {/* ───────────────────────── SOURCES MARQUEE ───────────────────────── */}
      <section className="relative border-y border-line bg-ink-2/60 py-5">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex shrink-0 animate-[marquee_40s_linear_infinite] gap-12 pr-12">
            {[...Array(2)].flatMap((_, k) =>
              ["Landsat 8/9 TIRS", "Sentinel-2 MSI", "ESA WorldCover", "WorldPop", "Copernicus DEM", "JRC GHSL", "XGBoost", "SHAP TreeExplainer", "GeoPandas", "FastAPI"].map((s) => (
                <span key={`${k}-${s}`} className="whitespace-nowrap font-display text-sm font-medium text-fg-3">
                  <span className="mr-3 text-heat/70">◆</span>
                  {s}
                </span>
              )),
            )}
          </div>
        </div>
      </section>

      {/* ───────────────────────── CONTRAST ───────────────────────── */}
      <section className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8 sm:py-36">
        <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <Eyebrow>
              <span className="h-px w-8 bg-fg-3" /> The problem
            </Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-[1.04] tracking-[-0.03em] sm:text-6xl">
              Heat is not a city-wide average.
              <span className="font-serif font-normal italic text-fg-2"> It’s a street-by-street inequality.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-2">
              In the same summer satellite composite, dense concrete neighbourhoods can run more than ten degrees hotter than
              tree-lined or coastal ones — and they are often where the most people, and the most vulnerable people, live.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-4">
              <TempCard label="Hottest locality" name={hot?.name} t={hot?.lst} hvi={hot?.hvi} tone="heat" />
              <TempCard label="Coolest populated" name={cool?.name} t={cool?.lst} hvi={cool?.hvi} tone="cool" />
              <div className="card col-span-2 flex items-center justify-between gap-4 px-6 py-5">
                <div>
                  <div className="text-xs text-fg-3">Same city, same satellite overpass</div>
                  <div className="mt-1 font-display text-lg font-semibold">Temperature gap between them</div>
                </div>
                <div className="num text-5xl font-semibold heat-text">{hot && cool ? `${(hot.lst - cool.lst).toFixed(1)}°` : "—"}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── FEATURES BENTO ───────────────────────── */}
      <section className="relative mx-auto max-w-[1400px] px-5 pb-28 sm:px-8">
        <Reveal>
          <Eyebrow>
            <span className="h-px w-8 bg-fg-3" /> What the twin does
          </Eyebrow>
          <h2 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            From pixels to planning decisions, in one loop.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Feature
            className="md:col-span-4 md:row-span-2"
            icon={<SlidersHorizontal className="h-5 w-5" />}
            tag="Main highlight"
            title="What-if climate simulation"
            body="Dial in more tree canopy, pocket parks, reflective roofs or less concrete — city-wide, in hotspots or in chosen neighbourhoods — and the model recomputes temperature and vulnerability for every cell, with a before/after swipe map."
            href="/simulate"
            accent
          >
            <SimTeaser result={teaser} />
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={<MapIcon className="h-5 w-5" />}
            title="Interactive climate map"
            body={`${meta ? meta.cells.toLocaleString("en-IN") : "~2,400"} half-kilometre cells, six layers, 2D or extruded 3D.`}
            href="/explore"
          >
            <MiniLegendStack />
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={<BrainCircuit className="h-5 w-5" />}
            title="ML temperature prediction"
            body={`XGBoost on 11 remote-sensing features. Spatially cross-validated R² ${meta ? meta.model_r2.toFixed(2) : "—"}, MAE ${meta ? meta.model_mae.toFixed(2) : "—"} °C.`}
            href="/methodology"
          />
          <Feature
            className="md:col-span-3"
            icon={<ScanSearch className="h-5 w-5" />}
            title="Explainable vulnerability"
            body="SHAP attributions show exactly how many degrees each factor — impervious cover, canopy, albedo, sea breeze — adds or removes in every cell."
            href="/explore"
          >
            <ShapPreview />
          </Feature>
          <Feature
            className="md:col-span-3"
            icon={<Lightbulb className="h-5 w-5" />}
            title="AI-powered recommendations"
            body="The twin tests every lever in every cell and ranks where an intervention protects the most people per degree of cooling."
            href="/insights"
          >
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { i: <Trees className="h-3.5 w-3.5" />, t: "Street trees", c: "#5cc56c" },
                { i: <Leaf className="h-3.5 w-3.5" />, t: "Pocket parks", c: "#3ee0c8" },
                { i: <Sun className="h-3.5 w-3.5" />, t: "Cool roofs", c: "#5cc8ff" },
                { i: <Building2 className="h-3.5 w-3.5" />, t: "De-concreting", c: "#c9a7ff" },
              ].map((x) => (
                <span key={x.t} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-fg-2" style={{ color: x.c }}>
                  {x.i}
                  <span className="text-fg-2">{x.t}</span>
                </span>
              ))}
            </div>
          </Feature>
        </div>
      </section>

      {/* ───────────────────────── PIPELINE ───────────────────────── */}
      <section className="relative border-t border-line bg-ink-2/50">
        <div className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8">
          <Reveal>
            <Eyebrow>
              <span className="h-px w-8 bg-fg-3" /> How it works
            </Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              A miniature digital twin, <span className="font-serif font-normal italic text-fg-2">end to end.</span>
            </h2>
          </Reveal>
          <div className="relative mt-16 grid gap-5 md:grid-cols-5">
            <div className="absolute left-0 right-0 top-[34px] hidden h-px bg-gradient-to-r from-transparent via-line-2 to-transparent md:block" />
            {[
              { i: <Satellite />, t: "Observe", d: "Landsat thermal, Sentinel-2 optical, land cover, population and terrain sampled to a 550 m grid." },
              { i: <Layers3 />, t: "Engineer", d: "NDVI, NDBI, MNDWI, albedo, canopy, imperviousness, distance to coast and water." },
              { i: <BrainCircuit />, t: "Learn", d: "Gradient-boosted trees learn surface temperature, validated on held-out spatial blocks." },
              { i: <ScanSearch />, t: "Explain", d: "TreeSHAP decomposes each prediction into per-factor °C contributions." },
              { i: <Sparkles />, t: "Simulate", d: "Interventions rewrite land cover → indices → model → new heat & vulnerability." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 0.08}>
                <div className="relative">
                  <div className="relative z-10 flex h-[68px] w-[68px] items-center justify-center rounded-2xl border border-line-2 bg-ink text-fg [&>svg]:h-6 [&>svg]:w-6">
                    {s.i}
                    <span className="num absolute -right-2 -top-2 rounded-full bg-fg px-1.5 text-[10px] font-bold text-ink">0{i + 1}</span>
                  </div>
                  <div className="mt-5 font-display text-lg font-semibold">{s.t}</div>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── CTA ───────────────────────── */}
      <section className="relative mx-auto max-w-[1400px] px-5 py-28 sm:px-8">
        <Reveal>
          <div className="noise relative overflow-hidden rounded-[32px] border border-line-2 bg-[radial-gradient(ellipse_at_top_left,rgba(255,107,53,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(62,224,200,0.22),transparent_55%)] px-6 py-16 sm:px-14 sm:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
                  What would a cooler
                  <br />
                  <span className="font-serif font-normal italic cool-text">Chennai look like?</span>
                </h2>
                <p className="mt-5 max-w-lg text-lg text-fg-2">
                  Pick a neighbourhood, choose your interventions, and watch the twin answer in under a second.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                <Link href="/simulate" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-fg px-6 py-4 text-sm font-semibold text-ink">
                  Open the simulator <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <Link href="/insights" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line-2 bg-black/20 px-6 py-4 text-sm font-semibold">
                  See priority sites <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-10 text-sm text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="font-display font-semibold text-fg-2">ClimateTwin</span>
            <span>· Urban climate vulnerability & mitigation simulator</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Droplets className="h-3.5 w-3.5" /> Built on Landsat 8/9, Sentinel-2, ESA WorldCover, JRC GHSL and WorldPop — see Methodology.
          </div>
        </div>
      </footer>
    </main>
  );
}

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

function TempCard({ label, name, t, hvi, tone }: { label: string; name?: string; t?: number; hvi?: number; tone: "heat" | "cool" }) {
  return (
    <div className="card relative overflow-hidden px-6 py-6">
      <div
        className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
        style={{ background: tone === "heat" ? "rgba(255,107,53,0.35)" : "rgba(62,224,200,0.3)" }}
      />
      <div className="relative">
        <div className="text-xs text-fg-3">{label}</div>
        <div className="mt-1 font-display text-xl font-semibold">{name ?? "—"}</div>
        <div className={`num mt-6 text-5xl font-semibold ${tone === "heat" ? "heat-text" : "cool-text"}`}>{t ? `${t.toFixed(1)}°` : "—"}</div>
        <div className="mt-2 text-xs text-fg-3">
          Vulnerability <span className="num text-fg-2">{hvi?.toFixed(0) ?? "—"}</span>/100
        </div>
      </div>
    </div>
  );
}

function Feature({ className, icon, title, body, children, href, tag, accent }: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
  href: string;
  tag?: string;
  accent?: boolean;
}) {
  return (
    <Reveal className={className}>
      <Link
        href={href}
        className={`group card relative flex h-full flex-col overflow-hidden p-7 transition hover:border-line-2 ${
          accent ? "bg-[radial-gradient(ellipse_at_top_right,rgba(62,224,200,0.12),transparent_60%)]" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-white/5 text-fg">{icon}</div>
          {tag ? (
            <span className="rounded-full border border-cool/40 bg-cool/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cool">{tag}</span>
          ) : (
            <ArrowUpRight className="h-4 w-4 text-fg-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
          )}
        </div>
        <div className={`mt-6 font-display font-semibold tracking-tight ${accent ? "text-3xl" : "text-xl"}`}>{title}</div>
        <p className={`mt-2 leading-relaxed text-fg-2 ${accent ? "max-w-xl text-base" : "text-sm"}`}>{body}</p>
        {children && <div className="mt-auto">{children}</div>}
      </Link>
    </Reveal>
  );
}

function MiniLegendStack() {
  return (
    <div className="mt-5 space-y-2.5">
      {(["hvi", "lst", "ndvi"] as const).map((k) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[11px] text-fg-3">{LAYERS[k].short}</span>
          <div className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${LAYERS[k].stops.map((s) => s[1]).join(",")})` }} />
        </div>
      ))}
    </div>
  );
}

function ShapPreview() {
  const rows = [
    { l: "Built-up (NDBI)", v: 2.4 },
    { l: "Impervious surface", v: 1.3 },
    { l: "Non-residential share", v: 0.6 },
    { l: "Tree canopy", v: -1.1 },
    { l: "Nearby water", v: -1.7 },
  ];
  return (
    <div className="mt-6 space-y-2">
      {rows.map((r) => (
        <div key={r.l} className="grid grid-cols-[130px_1fr] items-center gap-3 text-xs">
          <span className="truncate text-fg-3">{r.l}</span>
          <div className="relative h-4">
            <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
            <div
              className="absolute top-0.5 h-3 rounded-[3px]"
              style={{
                left: r.v > 0 ? "50%" : `${50 + (r.v / 4) * 50}%`,
                width: `${(Math.abs(r.v) / 4) * 50}%`,
                background: r.v > 0 ? "linear-gradient(90deg,#ff8a3d,#ff4d6d)" : "linear-gradient(90deg,#5cc8ff,#3ee0c8)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SimTeaser({ result }: { result: SimResult | null }) {
  const s = result?.summary;
  const bars = useMemo(() => result?.histogram.filter((h) => h.t >= 33 && h.t <= 49) ?? [], [result]);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.before, b.after)));
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="rounded-2xl border border-line bg-black/30 p-5">
        <div className="mb-4 flex items-center justify-between text-xs">
          <span className="text-fg-3">Residents by surface temperature</span>
          <span className="flex gap-3">
            <span className="flex items-center gap-1.5 text-fg-2"><span className="h-2 w-2 rounded-sm bg-[#ff7a45]" />Today</span>
            <span className="flex items-center gap-1.5 text-fg-2"><span className="h-2 w-2 rounded-sm bg-cool" />Scenario</span>
          </span>
        </div>
        <div className="flex h-36 items-end gap-[3px]">
          {bars.length
            ? bars.map((b) => (
                <div key={b.t} className="relative flex h-full flex-1 items-end gap-px">
                  <motion.div className="flex-1 rounded-t-[3px] bg-[#ff7a45]/80" initial={{ height: 0 }} animate={{ height: `${(b.before / max) * 100}%` }} transition={{ duration: 1, ease }} />
                  <motion.div className="flex-1 rounded-t-[3px] bg-cool" initial={{ height: 0 }} animate={{ height: `${(b.after / max) * 100}%` }} transition={{ duration: 1, delay: 0.2, ease }} />
                </div>
              ))
            : [...Array(16)].map((_, i) => <div key={i} className="skeleton h-1/2 flex-1 rounded-t" />)}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-fg-3 num">
          <span>33°C</span>
          <span>41°C</span>
          <span>49°C</span>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-4">
        <div className="text-xs leading-relaxed text-fg-3">
          Scenario: <span className="text-fg-2">+20 pp canopy, +5 pp parks, 50% cool roofs, 15% de-paving</span> in the 25% most vulnerable cells.
        </div>
        <div>
          <div className="num text-5xl font-semibold cool-text">{s ? `−${Math.abs(s.mean_delta_targeted).toFixed(1)}°` : "—"}</div>
          <div className="mt-1 text-xs text-fg-3">avg. cooling in targeted cells</div>
        </div>
        <div>
          <div className="num text-3xl font-semibold">{s ? fmt.million(Math.max(0, s.pop_lifted)) : "—"}</div>
          <div className="mt-1 text-xs text-fg-3">people moved out of high-risk categories</div>
        </div>
      </div>
    </div>
  );
}
