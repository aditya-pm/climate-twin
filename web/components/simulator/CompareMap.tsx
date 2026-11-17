"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ChevronsLeftRight } from "lucide-react";
import Map from "@/components/Map";
import type { Grid } from "@/lib/api";
import type { LayerDef } from "@/lib/layers";

export default function CompareMap({
  grid,
  before,
  after,
  layer,
  mask,
  flyTo,
  tooltip,
  padding,
}: {
  grid: Grid;
  before: number[];
  after: number[];
  layer: LayerDef;
  mask: boolean[] | null;
  flyTo: { lon: number; lat: number; zoom?: number; key: number } | null;
  tooltip?: (id: number) => React.ReactNode;
  padding?: { left?: number; right?: number };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const maps = useRef<{ a?: MLMap; b?: MLMap }>({});
  const syncing = useRef(false);

  const link = useCallback(() => {
    const { a, b } = maps.current;
    if (!a || !b) return;
    const sync = (src: MLMap, dst: MLMap) => () => {
      if (syncing.current) return;
      syncing.current = true;
      dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
      syncing.current = false;
    };
    a.on("move", sync(a, b));
    b.on("move", sync(b, a));
    b.jumpTo({ center: a.getCenter(), zoom: a.getZoom() });
  }, []);

  const drag = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current || !wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      setPos(Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)));
    };
    const up = () => (drag.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <Map
          grid={grid}
          values={before}
          layer={layer}
          controls={false}
          padding={padding}
          onReady={(m) => {
            maps.current.a = m;
            link();
          }}
          tooltip={tooltip}
          flyTo={flyTo}
        />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <Map
          grid={grid}
          values={after}
          layer={layer}
          dimMask={mask}
          padding={padding}
          onReady={(m) => {
            maps.current.b = m;
            link();
          }}
          tooltip={tooltip}
        />
      </div>

      {/* divider */}
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -left-px w-[2px] bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.5)]" />
        <button
          onPointerDown={(e) => {
            drag.current = true;
            e.preventDefault();
          }}
          className="pointer-events-auto absolute top-1/2 -ml-5 -mt-5 flex h-10 w-10 cursor-ew-resize items-center justify-center rounded-full bg-white text-ink shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition hover:scale-105"
          aria-label="Drag to compare"
        >
          <ChevronsLeftRight className="h-5 w-5" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 z-10 flex w-full justify-between px-4" style={{ paddingLeft: (padding?.left ?? 0) + 16, paddingRight: (padding?.right ?? 0) + 16 }}>
        <span className="glass rounded-full px-3 py-1.5 text-xs font-semibold">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-heat" />
          Today
        </span>
        <span className="glass rounded-full px-3 py-1.5 text-xs font-semibold">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-cool" />
          With interventions
        </span>
      </div>
    </div>
  );
}
