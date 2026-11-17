"use client";

import clsx from "clsx";
import { animate, useInView, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { CATEGORY_COLORS, CATEGORY_NAMES, gradientCss, type LayerDef } from "@/lib/layers";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-3", className)}>
      {children}
    </div>
  );
}

export function Legend({ layer, compact }: { layer: LayerDef; compact?: boolean }) {
  const s = [...layer.stops].sort((a, b) => a[0] - b[0]);
  const lo = s[0][0];
  const hi = s[s.length - 1][0];
  const mid = s[Math.floor(s.length / 2)][0];
  return (
    <div className={clsx(compact ? "w-44" : "w-full")}>
      <div className="h-2 rounded-full" style={{ background: gradientCss(layer) }} />
      <div className="mt-1.5 flex justify-between text-[10px] text-fg-3 num">
        <span>{layer.format(lo)}</span>
        <span>{layer.format(mid)}</span>
        <span>{layer.format(hi)}</span>
      </div>
    </div>
  );
}

export function CategoryPill({ cat, size = "sm" }: { cat: number; size?: "sm" | "md" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      )}
      style={{
        color: CATEGORY_COLORS[cat],
        borderColor: `${CATEGORY_COLORS[cat]}55`,
        background: `${CATEGORY_COLORS[cat]}14`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
      {CATEGORY_NAMES[cat]}
    </span>
  );
}

export function CountUp({ value, decimals = 0, suffix = "", prefix = "", className, duration = 1.6 }: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const txt = useTransform(mv, (v) =>
    `${prefix}${v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`,
  );
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, mv, duration]);
  return <motion.span ref={ref} className={className}>{txt}</motion.span>;
}

/** Animates smoothly between successive values (for live simulation KPIs). */
export function Tween({ value, decimals = 1, format, className }: {
  value: number;
  decimals?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const txt = useTransform(mv, (v) => (format ? format(v) : v.toFixed(decimals)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{txt}</motion.span>;
}

export function Gauge({ value, max = 100, color, size = 132, label }: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  label?: string;
}) {
  const r = size / 2 - 10;
  const c = Math.PI * r; // half circle
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
      <path
        d={`M 10 ${size / 2} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2}`}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <motion.path
        d={`M 10 ${size / 2} A ${r} ${r} 0 0 1 ${size - 10} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
      />
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="num" fill="#eef2f6" fontSize={size / 4.2} fontWeight={600}>
        {value.toFixed(0)}
      </text>
      {label && (
        <text x={size / 2} y={size / 2 + 12} textAnchor="middle" fill="#6b7685" fontSize={10} letterSpacing="0.12em">
          {label}
        </text>
      )}
    </svg>
  );
}

export function Bar({ value, max = 1, color, className }: { value: number; max?: number; color: string; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={clsx("relative flex rounded-xl border border-line bg-black/30 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative z-10 flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            value === o.value ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 -z-10 rounded-lg bg-white/10" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, render }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
  render?: (label: string | number | undefined, payload: NonNullable<Parameters<typeof ChartTooltip>[0]["payload"]>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs">
      {render ? render(label, payload) : (
        <>
          <div className="mb-1 text-fg-3">{label}</div>
          {payload.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="text-fg-2">{p.name}</span>
              <span className="num ml-auto pl-3 font-semibold">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function ApiError({ error }: { error: string }) {
  return (
    <div className="glass mx-auto mt-32 max-w-lg rounded-2xl p-6 text-sm">
      <div className="mb-2 font-display text-lg font-semibold">Can’t reach the ClimateTwin API</div>
      <p className="text-fg-2">
        Start the backend with <code className="num rounded bg-white/10 px-1.5 py-0.5">cd backend &amp;&amp; .venv/bin/uvicorn app:app --port 8000</code> and reload.
      </p>
      <p className="mt-2 text-fg-3 num text-xs">{error}</p>
    </div>
  );
}
