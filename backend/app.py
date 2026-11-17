"""ClimateTwin API — run with: uvicorn app:app --reload --port 8000"""
from __future__ import annotations

from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from climatetwin import geo
from climatetwin.engine import CATEGORIES, HVI_WEIGHTS, LEVERS, Scenario, Twin
from climatetwin.model import FEATURE_META

app = FastAPI(title="ClimateTwin API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)

twin = Twin()
_loc_cache = twin.localities()

GRID_COLUMNS = {
    "lst": "lst_observed", "hvi": "hvi", "ndvi": "ndvi", "ndbi": "ndbi", "tree": "tree_canopy",
    "imp": "impervious", "water": "water", "pop": "pop_density", "albedo": "albedo",
    "pred": "lst_pred", "cat": "category", "lever": "best_lever", "cool": "best_cooling",
}


@app.get("/api/health")
def health():
    return {"ok": True, "cells": len(twin.df)}


@app.get("/api/meta")
def meta():
    d = twin.df
    pop = d.population.to_numpy()
    xgb_m = twin.metrics["models"]["XGBoost"]
    return {
        "city": "Chennai",
        "bbox": [geo.LON_MIN, geo.LAT_MIN, geo.LON_MAX, geo.LAT_MAX],
        "step": geo.STEP,
        "cells": len(d),
        "population": float(pop.sum()),
        "area_km2": float(len(d) * 0.3),
        "lst_mean": twin.city_mean_lst,
        "lst_max": float(d.lst_observed.max()),
        "lst_min": float(d.lst_observed.min()),
        "lst_p95": float(d.lst_observed.quantile(0.95)),
        "hvi_mean": float(d.hvi.mean()),
        "pop_high": float(pop[d.category >= 2].sum()),
        "cells_severe": int((d.category == 3).sum()),
        "tree_mean": float(d.tree_canopy.mean()),
        "imp_mean": float(d.impervious.mean()),
        "categories": [{"name": n, "min": lo} for n, lo in CATEGORIES],
        "hvi_weights": HVI_WEIGHTS,
        "levers": LEVERS,
        "features": FEATURE_META,
        "metrics": twin.metrics,
        "model_r2": xgb_m["r2"],
        "model_mae": xgb_m["mae"],
        "localities": [l["name"] for l in _loc_cache],
        "build_seconds": twin.build_seconds,
        "data_source": twin.source,
        "data_info": {k: v for k, v in twin.source_info.items() if k not in ("forward_model", "landsat", "sentinel2")},
        "scenes": {"landsat": len(twin.source_info.get("landsat", [])), "sentinel2": len(twin.source_info.get("sentinel2", []))},
        "lst_range": twin.lst_range,
        "albedo_beta": twin.albedo_beta,
        "albedo_beta_n": twin.albedo_beta_n,
        "lst_p02": float(d.lst_observed.quantile(0.02)),
        "lst_p98": float(d.lst_observed.quantile(0.98)),
    }


@app.get("/api/grid")
def grid():
    """Columnar grid payload — the client builds cell polygons from lat/lon + step."""
    d = twin.df
    out = {"step": geo.STEP, "id": d.id.tolist(),
           "lat": d.lat.round(5).tolist(), "lon": d.lon.round(5).tolist(),
           "locality": d.locality.tolist()}
    for k, c in GRID_COLUMNS.items():
        col = d[c]
        out[k] = col.round(4).tolist() if col.dtype.kind == "f" else col.tolist()
    return out


@app.get("/api/cell/{cell_id}")
def cell(cell_id: int):
    if cell_id < 0 or cell_id >= len(twin.df):
        raise HTTPException(404, "cell not found")
    r = twin.df.iloc[cell_id]
    nar = twin.narrative(cell_id)
    return {
        "id": cell_id, "lat": float(r.lat), "lon": float(r.lon), "locality": r.locality,
        "lst": float(r.lst_observed), "lst_pred": float(r.lst_pred), "lst_cv": float(r.lst_oof),
        "hvi": float(r.hvi), "category": int(r.category),
        "hvi_rank": float(r.hvi_rank), "lst_rank": float(r.lst_rank),
        "city_mean_lst": twin.city_mean_lst,
        "components": {k: float(r[f"hvi_{k}"]) for k in HVI_WEIGHTS},
        "landcover": {k: float(r[k]) for k in ("tree_canopy", "vegetation", "impervious", "water", "bare", "roof")},
        "indices": {k: float(r[k]) for k in ("ndvi", "ndbi", "mndwi", "albedo")},
        "context": {"pop_density": float(r.pop_density), "population": float(r.population),
                    "elderly_share": float(r.elderly_share), "dist_coast_km": float(r.dist_coast_km),
                    "dist_water_km": float(r.dist_water_km), "elevation_m": float(r.elevation_m),
                    "green_access": float(r.green_access)},
        "explanation": twin.explain(cell_id),
        "narrative": nar["text"],
        "levers": nar["levers"],
    }


class SimRequest(BaseModel):
    trees: float = Field(0, ge=0, le=30)
    parks: float = Field(0, ge=0, le=20)
    cool_roofs: float = Field(0, ge=0, le=100)
    depave: float = Field(0, ge=0, le=60)
    scope: Literal["city", "localities", "hotspots"] = "city"
    localities: list[str] = []
    hotspot_pct: float = Field(20, ge=1, le=100)


@app.post("/api/simulate")
def simulate(req: SimRequest):
    return twin.run(Scenario(**req.model_dump()))


@app.get("/api/localities")
def localities():
    return _loc_cache


@app.get("/api/recommendations")
def recommendations(limit: int = 12):
    d = twin.df
    top = d.sort_values("priority", ascending=False)
    picks, taken = [], set()
    for _, r in top.iterrows():
        if r.locality in taken:
            continue
        taken.add(r.locality)
        i = int(r.id)
        picks.append({
            "cell": i, "lat": float(r.lat), "lon": float(r.lon), "locality": r.locality,
            "lst": float(r.lst_observed), "hvi": float(r.hvi), "population": float(r.population),
            "best_lever": r.best_lever, "cooling": float(r.best_cooling),
            "delta_hvi": float(twin.lever_dhvi[r.best_lever][i]),
            "narrative": twin.narrative(i)["text"],
        })
        if len(picks) >= limit:
            break
    lever_totals = []
    pop = d.population.to_numpy()
    for k, m in LEVERS.items():
        lever_totals.append({
            "key": k, "label": m["label"], "standard": m["standard"], "unit": m["unit"],
            "mean_cooling": float(np.average(-twin.lever_delta[k], weights=pop + 1)),
            "max_cooling": float(-twin.lever_delta[k].min()),
            "best_in_cells": int((d.best_lever == k).sum()),
            "pop_best": float(pop[d.best_lever == k].sum()),
        })
    return {"sites": picks, "levers": lever_totals}


@app.get("/api/model")
def model_info():
    d = twin.df
    rng = np.random.default_rng(3)
    idx = rng.choice(len(d), 600, replace=False)
    return {
        "metrics": twin.metrics,
        "importance": twin.global_importance(),
        "dependence": twin.dependence(),
        "base_value": twin.shap_base,
        "scatter": [{"obs": float(d.lst_observed.iloc[i]), "pred": float(d.lst_oof.iloc[i])} for i in idx],
        "n_cells": len(d),
    }
