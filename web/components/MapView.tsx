"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Map as MLMap, NavigationControl, setWorkerUrl, type MapGeoJSONFeature, type ExpressionSpecification } from "maplibre-gl";
import type { Grid } from "@/lib/api";
import type { LayerDef } from "@/lib/layers";

// Bundlers can't resolve maplibre's worker; serve it from /public (copied on postinstall).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const CHENNAI_CENTER: [number, number] = [80.222, 13.03];

export interface MapViewProps {
  grid: Grid;
  values: number[];
  layer: LayerDef;
  extrude?: boolean;
  extrudeScale?: number;
  selected?: number | null;
  onSelect?: (id: number | null) => void;
  tooltip?: (id: number) => ReactNode;
  initial?: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number };
  autoRotate?: boolean;
  interactive?: boolean;
  controls?: boolean;
  opacity?: number;
  flyTo?: { lon: number; lat: number; zoom?: number; key: number } | null;
  onReady?: (map: MLMap) => void;
  dimMask?: boolean[] | null;
  className?: string;
  padding?: { left?: number; right?: number; top?: number; bottom?: number };
}

function buildGeometry(grid: Grid) {
  const h = grid.step / 2;
  return grid.id.map((id, i) => {
    const x = grid.lon[i];
    const y = grid.lat[i];
    return {
      type: "Feature" as const,
      id,
      properties: { id } as Record<string, number>,
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]]],
      },
    };
  });
}

function colorExpr(layer: LayerDef): ExpressionSpecification {
  const stops = [...layer.stops].sort((a, b) => a[0] - b[0]).flat();
  return ["interpolate", ["linear"], ["get", "v"], ...stops] as unknown as ExpressionSpecification;
}

export default function MapView({
  grid,
  values,
  layer,
  extrude = false,
  extrudeScale = 2200,
  selected = null,
  onSelect,
  tooltip,
  initial,
  autoRotate = false,
  interactive = true,
  controls = true,
  opacity = 0.86,
  flyTo,
  onReady,
  dimMask,
  className,
  padding,
}: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  // the map instance whose style has finished loading (null while the map is being (re)created)
  const [ready, setReady] = useState<MLMap | null>(null);
  const loaded = ready !== null;
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const features = useMemo(() => buildGeometry(grid), [grid]);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selected;
  });

  // create map
  useEffect(() => {
    if (!el.current) return;
    const map = new MLMap({
      container: el.current,
      style: BASEMAP,
      center: initial?.center ?? CHENNAI_CENTER,
      zoom: initial?.zoom ?? (window.innerWidth < 640 ? 9.7 : 10.6),
      pitch: initial?.pitch ?? 0,
      bearing: initial?.bearing ?? 0,
      interactive,
      attributionControl: { compact: true },
      maxPitch: 75,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    if (padding) map.setPadding({ left: 0, right: 0, top: 0, bottom: 0, ...padding });
    if (controls && interactive) map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      const layers = map.getStyle().layers ?? [];
      const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
      // quieter basemap
      for (const l of layers) {
        if (l.type === "symbol" && /poi|housenumber|road_label|shield/i.test(l.id)) {
          map.setLayoutProperty(l.id, "visibility", "none");
        }
      }
      map.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id", tolerance: 0, buffer: 8 });
      map.addLayer(
        {
          id: "cells-fill",
          type: "fill",
          source: "cells",
          paint: { "fill-color": "#000", "fill-opacity": opacity, "fill-antialias": true },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "cells-3d",
          type: "fill-extrusion",
          source: "cells",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": "#000",
            "fill-extrusion-height": ["*", ["get", "h"], extrudeScale],
            "fill-extrusion-opacity": 0.92,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        firstSymbol,
      );
      map.addLayer({
        id: "cells-hover",
        type: "line",
        source: "cells",
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.2,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 0],
        },
      });
      map.addLayer({
        id: "cells-selected",
        type: "line",
        source: "cells",
        filter: ["==", ["get", "id"], -1],
        paint: { "line-color": "#ffffff", "line-width": 2.4 },
      });
      setReady(map);
      onReady?.(map);
    });

    let hovered: number | null = null;
    const move = (e: { point: { x: number; y: number }; features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = Number(f.id);
      if (hovered !== null && hovered !== id) map.setFeatureState({ source: "cells", id: hovered }, { hover: false });
      hovered = id;
      map.setFeatureState({ source: "cells", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
      setHover({ id, x: e.point.x, y: e.point.y });
    };
    const leave = () => {
      if (hovered !== null) map.setFeatureState({ source: "cells", id: hovered }, { hover: false });
      hovered = null;
      map.getCanvas().style.cursor = "";
      setHover(null);
    };
    for (const lid of ["cells-fill", "cells-3d"]) {
      map.on("mousemove", lid, move);
      map.on("mouseleave", lid, leave);
    }
    map.on("click", (e) => {
      const fs = map.queryRenderedFeatures(e.point, { layers: ["cells-fill", "cells-3d"].filter((l) => map.getLayer(l)) });
      const id = fs[0] ? Number(fs[0].id) : null;
      onSelectRef.current?.(id === selectedRef.current ? null : id);
    });

    return () => {
      setReady(null);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // data
  useEffect(() => {
    const map = ready;
    if (!map) return;
    const src = map.getSource("cells") as unknown as { setData: (d: unknown) => void } | undefined;
    if (!src) return;
    const data = features.map((f, i) => {
      const v = values[i] ?? 0;
      return {
        ...f,
        properties: {
          id: grid.id[i],
          v,
          h: layer.norm(v) ** 1.4 * (dimMask && !dimMask[i] ? 0.15 : 1),
          d: dimMask ? (dimMask[i] ? 1 : 0) : 1,
        },
      };
    });
    src.setData({ type: "FeatureCollection", features: data });
  }, [features, values, layer, ready, grid, dimMask]);

  // paint
  useEffect(() => {
    const map = ready;
    if (!map) return;
    const c = colorExpr(layer);
    map.setPaintProperty("cells-fill", "fill-color", c);
    map.setPaintProperty("cells-fill", "fill-outline-color", c);
    map.setPaintProperty("cells-3d", "fill-extrusion-color", c);
    map.setPaintProperty("cells-fill", "fill-opacity", dimMask ? ["case", ["==", ["get", "d"], 1], opacity, opacity * 0.28] : opacity);
  }, [layer, ready, opacity, dimMask]);

  // 2D / 3D
  useEffect(() => {
    const map = ready;
    if (!map) return;
    map.setLayoutProperty("cells-3d", "visibility", extrude ? "visible" : "none");
    map.setLayoutProperty("cells-fill", "visibility", extrude ? "none" : "visible");
    map.setPaintProperty("cells-3d", "fill-extrusion-height", ["*", ["get", "h"], extrudeScale]);
    if (interactive && !autoRotate) {
      map.easeTo({ pitch: extrude ? 55 : 0, bearing: extrude ? -18 : 0, duration: 900 });
    }
  }, [extrude, ready, extrudeScale, interactive, autoRotate]);

  // selection
  useEffect(() => {
    const map = ready;
    if (!map) return;
    map.setFilter("cells-selected", ["==", ["get", "id"], selected ?? -1]);
  }, [selected, ready]);

  // fly
  useEffect(() => {
    const map = ready;
    if (!map || !flyTo) return;
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? 13, speed: 0.9, essential: true });
  }, [flyTo, ready]);

  // rotate
  useEffect(() => {
    const map = ready;
    if (!map || !autoRotate) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      map.setBearing((map.getBearing() + dt * 0.0035) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, ready]);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <div ref={el} className="!absolute inset-0 h-full w-full" />
      {!loaded && <div className="absolute inset-0 skeleton" />}
      {hover && tooltip && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl glass px-3 py-2 text-xs"
          style={{ left: hover.x, top: hover.y }}
        >
          {tooltip(hover.id)}
        </div>
      )}
    </div>
  );
}
