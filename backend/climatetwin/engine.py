"""The digital twin: baseline state, vulnerability index, scenario simulator and recommender."""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.ndimage import uniform_filter

from . import geo
from .model import FEATURE_META, FEATURES, LSTModel, evaluate
from .data import load_dataset
from .synth import CELL_AREA_KM2

# Class cut-offs: relative vulnerability within the city, set from HVI percentiles at start-up
# (bottom 30 % Low, 30–60 % Moderate, 60–85 % High, top 15 % Severe). Mutated in place by Twin.
CATEGORIES = [("Low", 0), ("Moderate", 35), ("High", 50), ("Severe", 65)]
CLASS_PERCENTILES = (30, 60, 85)
HVI_WEIGHTS = {"hazard": 0.45, "exposure": 0.25, "sensitivity": 0.15, "adaptive_gap": 0.15}

LEVERS = {
    "trees": {"label": "Urban tree canopy", "unit": "pp", "max": 30, "standard": 15,
              "desc": "Street & avenue trees planted on open ground, lawns and pavement edges."},
    "parks": {"label": "Pocket parks & green spaces", "unit": "pp", "max": 20, "standard": 10,
              "desc": "Vacant lots and paved plazas converted into planted public green space."},
    "cool_roofs": {"label": "Reflective cool roofs", "unit": "%", "max": 100, "standard": 60,
                   "desc": "Share of rooftops coated with high-albedo (≥0.65) reflective paint."},
    "depave": {"label": "De-concreting", "unit": "%", "max": 60, "standard": 30,
               "desc": "Share of paved ground replaced by permeable, vegetated surfaces."},
}
COOL_ROOF_ALBEDO = 0.65


def category_of(hvi: np.ndarray) -> np.ndarray:
    out = np.full(hvi.shape, 0, dtype=int)
    for i, (_, lo) in enumerate(CATEGORIES):
        out[hvi >= lo] = i
    return out


@dataclass
class Scenario:
    trees: float = 0
    parks: float = 0
    cool_roofs: float = 0
    depave: float = 0
    scope: str = "city"  # city | localities | hotspots
    localities: list[str] = field(default_factory=list)
    hotspot_pct: float = 20


class Twin:
    def __init__(self, source: str | None = None):
        t0 = time.time()
        ds = load_dataset(source)
        self.df = ds.df.copy()
        self.forward = ds.forward
        self.source = ds.source
        self.source_info = ds.info
        n = len(self.df)
        # hazard scale = 2nd–98th percentile of observed LST (robust to a few extreme pixels)
        lo, hi = np.percentile(self.df.lst_observed, [2, 98])
        self.lst_range = (float(np.floor(lo)), float(np.ceil(hi)))
        self.df["row"] = np.round((self.df.lat - geo.LAT_MIN) / geo.STEP - 0.5).astype(int)
        self.df["col"] = np.round((self.df.lon - geo.LON_MIN) / geo.STEP - 0.5).astype(int)
        self.shape = (self.df.row.max() + 1, self.df.col.max() + 1)

        ev = evaluate(self.df)
        self.metrics = {k: v for k, v in ev.items() if k != "oof"}
        self.df["lst_oof"] = ev["oof"]

        self._resid = {k: self.df[f"resid_{k}"].to_numpy() for k in ("ndvi", "ndbi", "mndwi", "albedo")}
        # Cool-roof sensitivity (°C per unit albedo), estimated within built-up cells with controls.
        # Across the whole city albedo mostly separates water from land, and cool roofs push albedo past
        # the observed range where trees cannot extrapolate, so the roof-albedo effect is applied with
        # this partial coefficient instead of through the tree model.
        b = self.df[self.df.impervious > 0.6]
        Xb = np.c_[np.ones(len(b)), b.albedo, b.ndvi, b.mndwi, b.dist_coast_km, b.dist_water_km, b.building_density]
        coef, *_ = np.linalg.lstsq(Xb, b.lst_observed.to_numpy(), rcond=None)
        self.albedo_beta = float(min(coef[1], 0.0))
        self.albedo_beta_n = int(len(b))
        d0 = self.df
        self._base_idx = self.forward(d0.vegetation.to_numpy(), d0.tree_canopy.to_numpy(), d0.impervious.to_numpy(),
                                      d0.water.to_numpy(), d0.bare.to_numpy(), d0.roof.to_numpy(),
                                      d0.roof_albedo.to_numpy(), self._resid)

        self.model = LSTModel().fit(self.df)
        self.df["lst_pred"] = self.model.predict(self.df)
        self.shap_vals, self.shap_base = self.model.shap(self.df)

        self.df["blue_access"] = np.exp(-self.df.dist_water_km / 1.0)
        self.df["green_access"] = self._neighbourhood_mean(self.df.vegetation.to_numpy())
        self.df["hvi"], comps = self.hvi(self.df.lst_observed.to_numpy(), self.df.green_access.to_numpy())
        for k, v in comps.items():
            self.df[f"hvi_{k}"] = v
        cuts = np.percentile(self.df.hvi, CLASS_PERCENTILES)
        CATEGORIES[:] = [("Low", 0)] + [(n, int(round(c))) for n, c in zip(("Moderate", "High", "Severe"), cuts)]
        self.df["category"] = category_of(self.df.hvi.to_numpy())
        self.df["lst_rank"] = self.df.lst_observed.rank(pct=True)
        self.df["hvi_rank"] = self.df.hvi.rank(pct=True)
        self.city_mean_lst = float(np.average(self.df.lst_observed, weights=self.df.population + 1))

        self._precompute_levers()
        self.build_seconds = time.time() - t0
        print(f"[twin] {n} cells, XGB spatial-CV R²={self.metrics['models']['XGBoost']['r2']:.3f}, "
              f"built in {self.build_seconds:.1f}s")

    # ------------------------------------------------------------------ indices
    def _neighbourhood_mean(self, values: np.ndarray, size: int = 5) -> np.ndarray:
        grid = np.zeros(self.shape)
        mask = np.zeros(self.shape)
        r, c = self.df.row.to_numpy(), self.df.col.to_numpy()
        grid[r, c] = values
        mask[r, c] = 1
        num = uniform_filter(grid, size=size, mode="constant")
        den = uniform_filter(mask, size=size, mode="constant")
        return (num / np.maximum(den, 1e-6))[r, c]

    def hvi(self, lst: np.ndarray, green_access: np.ndarray):
        d = self.df
        hazard = np.clip((lst - self.lst_range[0]) / (self.lst_range[1] - self.lst_range[0]), 0, 1)
        exposure = np.clip(np.log1p(d.pop_density.to_numpy()) / np.log1p(60000), 0, 1)
        sensitivity = d.sensitivity.to_numpy()
        adaptive = np.clip(0.65 * np.clip(green_access / 0.45, 0, 1) + 0.35 * d.blue_access.to_numpy(), 0, 1)
        comps = {"hazard": hazard, "exposure": exposure, "sensitivity": sensitivity, "adaptive_gap": 1 - adaptive}
        score = 100 * sum(HVI_WEIGHTS[k] * comps[k] for k in HVI_WEIGHTS)
        return score, comps

    # --------------------------------------------------------------- simulator
    def apply(self, sc: Scenario, mask: np.ndarray) -> pd.DataFrame:
        d = self.df
        veg, tree = d.vegetation.to_numpy().copy(), d.tree_canopy.to_numpy().copy()
        imp, bare = d.impervious.to_numpy().copy(), d.bare.to_numpy().copy()
        roof, water = d.roof.to_numpy(), d.water.to_numpy()
        roof_alb = d.roof_albedo.to_numpy().copy()
        m = mask.astype(float)

        # 1. De-concreting: paved ground → permeable vegetated surface
        pave = np.clip(imp - roof, 0, None)
        dv = pave * (sc.depave / 100) * m
        imp -= dv; veg += 0.8 * dv; bare += 0.2 * dv

        # 2. Parks: bare land first, then paved plazas
        want = (sc.parks / 100) * m
        from_bare = np.minimum(want, bare * 0.9)
        pave = np.clip(imp - roof, 0, None)
        from_pave = np.minimum(want - from_bare, pave * 0.3)
        bare -= from_bare; imp -= from_pave
        added = from_bare + from_pave
        veg += added; tree += 0.45 * added

        # 3. Tree canopy: bare → grass → pavement edges
        want = (sc.trees / 100) * m
        a = np.minimum(want, bare * 0.8); bare -= a; veg += a; tree += a; want = want - a
        b = np.minimum(want, np.clip(veg - tree, 0, None) * 0.7); tree += b; want = want - b
        pave = np.clip(imp - roof, 0, None)
        c = np.minimum(want, pave * 0.3); imp -= c; veg += c; tree += c

        # 4. Cool roofs
        share = (sc.cool_roofs / 100) * m
        roof_alb = roof_alb * (1 - share) + COOL_ROOF_ALBEDO * share

        # Indices move by the forward model's *change*: observed + f(new cover) − f(original cover).
        # An empty scenario is therefore an exact no-op, regardless of clipping or rounding.
        cover = self.forward(veg, tree, imp, water, bare, roof, d.roof_albedo.to_numpy(), self._resid)
        roofs = self.forward(veg, tree, imp, water, bare, roof, roof_alb, self._resid)[3]
        out = d[FEATURES].copy()
        for k, nv, bv in zip(("ndvi", "ndbi", "mndwi", "albedo"), cover, self._base_idx):
            out[k] = d[k].to_numpy() + (nv - bv)
        out["_dalb_roof"] = roofs - cover[3]
        out["tree_canopy"], out["impervious"] = tree, imp
        out["vegetation"] = veg
        out["_area_trees_ha"] = ((tree - d.tree_canopy) * CELL_AREA_KM2 * 100).clip(0)
        out["_area_green_ha"] = ((veg - d.vegetation) * CELL_AREA_KM2 * 100).clip(0)
        out["_area_roof_ha"] = (roof * share * CELL_AREA_KM2 * 100)
        out["_area_depave_ha"] = ((d.impervious - imp) * CELL_AREA_KM2 * 100).clip(0)
        return out

    def _delta(self, feats: pd.DataFrame) -> np.ndarray:
        """ΔLST = tree-model response to land-cover change + albedo sensitivity × roof-albedo change."""
        return (self.model.predict(feats) - self.df.lst_pred.to_numpy()
                + self.albedo_beta * feats["_dalb_roof"].to_numpy())

    def scope_mask(self, sc: Scenario) -> np.ndarray:
        d = self.df
        if sc.scope == "localities" and sc.localities:
            return d.locality.isin(sc.localities).to_numpy()
        if sc.scope == "hotspots":
            return (d.hvi_rank >= 1 - sc.hotspot_pct / 100).to_numpy()
        return np.ones(len(d), dtype=bool)

    def run(self, sc: Scenario) -> dict:
        d = self.df
        mask = self.scope_mask(sc)
        feats = self.apply(sc, mask)
        delta = np.where(mask, np.minimum(self._delta(feats), 0.0), 0.0)  # interventions never warm a cell
        lst_new = d.lst_observed.to_numpy() + delta
        green_new = self._neighbourhood_mean(feats.vegetation.to_numpy())
        hvi_new, _ = self.hvi(lst_new, green_new)
        cat_old, cat_new = d.category.to_numpy(), category_of(hvi_new)
        pop = d.population.to_numpy()

        lo, hi = np.floor(d.lst_observed.min()) - 2, np.ceil(d.lst_observed.max()) + 1
        bins = np.arange(lo, hi + 1, 1.0)
        h_old, _ = np.histogram(d.lst_observed, bins=bins, weights=pop)
        h_new, _ = np.histogram(lst_new, bins=bins, weights=pop)

        loc = pd.DataFrame({"locality": d.locality, "pop": pop, "dl": delta, "dh": hvi_new - d.hvi,
                            "lst": d.lst_observed, "lst_new": lst_new, "hvi": d.hvi, "hvi_new": hvi_new})
        g = loc.groupby("locality").apply(lambda x: pd.Series({
            "delta_lst": np.average(x.dl, weights=x["pop"] + 1),
            "delta_hvi": np.average(x.dh, weights=x["pop"] + 1),
            "lst": np.average(x.lst, weights=x["pop"] + 1),
            "lst_new": np.average(x.lst_new, weights=x["pop"] + 1),
            "hvi": x.hvi.mean(), "hvi_new": x.hvi_new.mean(), "population": x["pop"].sum(),
        }), include_groups=False).reset_index().sort_values("delta_lst")

        def pw(v, w=pop):
            return float(np.average(v, weights=w + 1))

        high_old = float(pop[cat_old >= 2].sum())
        high_new = float(pop[cat_new >= 2].sum())
        return {
            "lst": np.round(lst_new, 2).tolist(),
            "hvi": np.round(hvi_new, 1).tolist(),
            "delta": np.round(delta, 2).tolist(),
            "summary": {
                "cells_targeted": int(mask.sum()),
                "population_targeted": float(pop[mask].sum()),
                "mean_delta_city": pw(delta),
                "mean_delta_targeted": pw(delta[mask], pop[mask]) if mask.any() else 0.0,
                "max_cooling": float(-delta.min()),
                "mean_lst_before": pw(d.lst_observed.to_numpy()),
                "mean_lst_after": pw(lst_new),
                "mean_hvi_before": float(d.hvi.mean()),
                "mean_hvi_after": float(hvi_new.mean()),
                "pop_high_before": high_old,
                "pop_high_after": high_new,
                "pop_lifted": high_old - high_new,
                "cells_severe_before": int((cat_old == 3).sum()),
                "cells_severe_after": int((cat_new == 3).sum()),
                "category_before": [int((cat_old == i).sum()) for i in range(4)],
                "category_after": [int((cat_new == i).sum()) for i in range(4)],
                "footprint_ha": {
                    "trees": float(feats._area_trees_ha.sum()),
                    "green": float(feats._area_green_ha.sum()),
                    "cool_roofs": float(feats._area_roof_ha.sum()),
                    "depave": float(feats._area_depave_ha.sum()),
                },
            },
            "histogram": [{"t": float(b), "before": float(a), "after": float(c)}
                          for b, a, c in zip(bins[:-1], h_old, h_new)],
            "localities": g.round(3).to_dict(orient="records"),
        }

    # ---------------------------------------------------------- recommendations
    def _precompute_levers(self):
        d = self.df
        everywhere = np.ones(len(d), dtype=bool)
        self.lever_delta = {}
        self.lever_dhvi = {}
        for key, meta in LEVERS.items():
            sc = Scenario(**{key: meta["standard"]})
            feats = self.apply(sc, everywhere)
            delta = np.minimum(self._delta(feats), 0)
            hvi_new, _ = self.hvi(d.lst_observed.to_numpy() + delta,
                                  self._neighbourhood_mean(feats.vegetation.to_numpy()))
            self.lever_delta[key] = delta
            self.lever_dhvi[key] = hvi_new - d.hvi.to_numpy()
        stack = np.stack([self.lever_delta[k] for k in LEVERS], axis=1)
        keys = np.array(list(LEVERS))
        d["best_lever"] = keys[stack.argmin(axis=1)]
        d["best_cooling"] = -stack.min(axis=1)
        d["priority"] = (-np.stack([self.lever_dhvi[k] for k in LEVERS], 1).min(1)) * np.log1p(d.population) * (d.hvi / 50)

    def cell_levers(self, i: int) -> list[dict]:
        out = []
        for key, meta in LEVERS.items():
            out.append({"key": key, "label": meta["label"], "intensity": meta["standard"], "unit": meta["unit"],
                        "delta_lst": float(self.lever_delta[key][i]), "delta_hvi": float(self.lever_dhvi[key][i])})
        return sorted(out, key=lambda x: x["delta_lst"])

    # ------------------------------------------------------------ explanations
    def explain(self, i: int) -> dict:
        row = self.df.iloc[i]
        contrib = self.shap_vals[i]
        items = []
        for f, v in zip(FEATURES, contrib):
            raw = float(row[f])
            items.append({"feature": f, **FEATURE_META[f], "value": raw, "shap": float(v)})
        items.sort(key=lambda x: -abs(x["shap"]))
        return {"base": self.shap_base, "prediction": float(row.lst_pred), "contributions": items}

    def narrative(self, i: int) -> dict:
        row = self.df.iloc[i]
        ex = self.explain(i)
        warm = [c for c in ex["contributions"] if c["shap"] > 0.15][:3]
        cool = [c for c in ex["contributions"] if c["shap"] < -0.15][:2]
        levers = self.cell_levers(i)
        best = levers[0]
        diff = row.lst_observed - self.city_mean_lst
        cat = CATEGORIES[int(row.category)][0]

        def phrase(c):
            f, v = c["feature"], c["value"]
            return {
                "impervious": f"sealed surfaces covering {v*100:.0f}% of the cell",
                "ndbi": f"a strong built-up signature, NDBI {v:.2f}",
                "tree_canopy": (f"sparse tree canopy of {v*100:.0f}%" if c["shap"] > 0 else f"{v*100:.0f}% tree canopy"),
                "ndvi": (f"weak vegetation, NDVI {v:.2f}" if c["shap"] > 0 else f"healthy vegetation, NDVI {v:.2f}"),
                "albedo": (f"dark, heat-absorbing surfaces, albedo {v:.2f}" if c["shap"] > 0 else f"reflective surfaces, albedo {v:.2f}"),
                "dist_coast_km": (f"sitting {v:.1f} km inland, beyond the sea breeze" if c["shap"] > 0 else f"the sea breeze, {v:.1f} km from the coast"),
                "dist_water_km": (f"no blue space within {v:.1f} km" if c["shap"] > 0 else f"water bodies {v:.1f} km away"),
                "building_density": f"a compact building footprint of {v*100:.0f}%",
                "anthropogenic_heat": ((f"industrial and commercial buildings covering {v*100:.0f}% of the cell" if self.source == "real" else "industrial and waste-heat sources") if c["shap"] > 0 else "few non-residential buildings"),
                "elevation_m": f"terrain at {v:.0f} m elevation",
                "mndwi": (f"dry surfaces, MNDWI {v:.2f}" if c["shap"] > 0 else f"surface moisture, MNDWI {v:.2f}"),
            }[f]

        parts = [f"This {cat.lower()}-vulnerability cell in {row.locality} reaches {row.lst_observed:.1f} °C "
                 f"{'in the April–June satellite composite' if self.source == 'real' else 'on a summer afternoon'}, {abs(diff):.1f} °C {'above' if diff >= 0 else 'below'} the city average."]
        if warm:
            parts.append("The model attributes the heat mainly to " + ", ".join(
                f"{phrase(c)} (+{c['shap']:.1f} °C)" for c in warm) + ".")
        if cool:
            parts.append("It is partly offset by " + " and ".join(
                f"{phrase(c)} ({c['shap']:.1f} °C)" for c in cool) + ".")
        if best["delta_lst"] < -0.05:
            parts.append(f"The most effective single lever here is {best['label'].lower()} "
                         f"({best['intensity']}{'%' if best['unit'] == '%' else ' pp'}), cooling the surface by "
                         f"{-best['delta_lst']:.1f} °C and lowering the vulnerability score by {-best['delta_hvi']:.1f} points.")
        return {"text": " ".join(parts), "levers": levers}

    # ---------------------------------------------------------- aggregations
    def localities(self) -> list[dict]:
        d = self.df
        rows = []
        shap_df = pd.DataFrame(self.shap_vals, columns=FEATURES)
        shap_df["locality"] = d.locality.values
        mean_shap = shap_df.groupby("locality").mean()
        for name, x in d.groupby("locality"):
            w = x.population + 1
            levers = {k: float(np.average(-self.lever_delta[k][x.index], weights=w)) for k in LEVERS}
            best = max(levers, key=levers.get)
            s = mean_shap.loc[name].sort_values(ascending=False)
            drivers = [{"feature": f, "short": FEATURE_META[f]["short"], "shap": float(v)} for f, v in s.items() if v > 0][:3]
            la, lo = next((la, lo) for n, la, lo in geo.LOCALITIES if n == name)
            rows.append({
                "name": name, "lat": la, "lon": lo, "cells": int(len(x)),
                "population": float(x.population.sum()),
                "lst": float(np.average(x.lst_observed, weights=w)),
                "lst_max": float(x.lst_observed.max()),
                "hvi": float(x.hvi.mean()), "hvi_max": float(x.hvi.max()),
                "tree": float(x.tree_canopy.mean()), "impervious": float(x.impervious.mean()),
                "vegetation": float(x.vegetation.mean()),
                "pop_density": float(np.average(x.pop_density, weights=w)),
                "high_share": float(x.population[x.category >= 2].sum() / max(x.population.sum(), 1)),
                "category": int(category_of(np.array([x.hvi.mean()]))[0]),
                "drivers": drivers, "levers": levers, "best_lever": best,
                "priority": float(x.priority.sum()),
            })
        rows.sort(key=lambda r: -r["hvi"])
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        return rows

    def global_importance(self) -> list[dict]:
        imp = np.abs(self.shap_vals).mean(axis=0)
        out = [{"feature": f, **FEATURE_META[f], "importance": float(v)} for f, v in zip(FEATURES, imp)]
        return sorted(out, key=lambda x: -x["importance"])

    def dependence(self, n: int = 450) -> dict:
        rng = np.random.default_rng(1)
        idx = rng.choice(len(self.df), size=min(n, len(self.df)), replace=False)
        res = {}
        for j, f in enumerate(FEATURES):
            res[f] = [{"x": float(self.df[f].iloc[i]), "y": float(self.shap_vals[i, j])} for i in idx]
        return res
