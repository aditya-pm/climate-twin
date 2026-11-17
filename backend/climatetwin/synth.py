"""Synthetic Landsat/Sentinel-like observation layer for Chennai.

Produces a ~550 m grid with land-cover fractions, spectral indices,
socio-demographic proxies and an *observed* summer-afternoon land surface
temperature (LST). The generator is physically motivated (impervious heating,
evapotranspirative cooling, sea-breeze, albedo) so the ML model has a realistic
signal to learn, but the values are illustrative — not survey-grade data.

To use real data, replace :func:`generate` with a sampler that reads Landsat 8/9
ST_B10 (LST), Sentinel-2 L2A bands (NDVI / NDBI / MNDWI), ESA WorldCover
(fractions) and WorldPop (population) onto the same grid.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import geo

SEED = 42
CELL_AREA_KM2 = (geo.STEP * geo.KM_PER_DEG_LAT) * (geo.STEP * geo.KM_PER_DEG_LON)


def _smooth_noise(rng, lat, lon, n_waves=24, min_wl_km=1.5, max_wl_km=9.0):
    x = (lon - geo.LON_MIN) * geo.KM_PER_DEG_LON
    y = (lat - geo.LAT_MIN) * geo.KM_PER_DEG_LAT
    out = np.zeros_like(x)
    for _ in range(n_waves):
        wl = rng.uniform(min_wl_km, max_wl_km)
        th = rng.uniform(0, np.pi)
        ph = rng.uniform(0, 2 * np.pi)
        k = 2 * np.pi / wl
        out += np.cos(k * (x * np.cos(th) + y * np.sin(th)) + ph) * (wl / max_wl_km) ** 0.5
    return out / out.std()


def _bump(d, r, sharp=0.35):
    """Smooth disc: ≈1 inside radius r, falling off over ``sharp * r``."""
    return 1.0 / (1.0 + np.exp((d - r) / (sharp * r + 0.12)))


# --- Spectral index forward model (shared by the simulator) -------------------

def spectral_indices(veg, tree, imp, water, bare, roof, alb, resid):
    ndvi = 0.04 + 0.62 * veg + 0.18 * tree - 0.20 * water + 0.05 * bare + resid["ndvi"]
    ndbi = -0.22 + 0.55 * imp + 0.12 * bare - 0.38 * veg - 0.30 * water + resid["ndbi"]
    mndwi = -0.48 + 1.25 * water - 0.22 * veg + 0.05 * bare + resid["mndwi"]
    albedo = (0.17 * veg + 0.06 * water + roof * alb + (imp - roof) * 0.12 + bare * 0.24
              + resid["albedo"])
    return (np.clip(ndvi, -0.4, 0.9), np.clip(ndbi, -0.6, 0.6),
            np.clip(mndwi, -0.7, 0.8), np.clip(albedo, 0.05, 0.6))


def physical_lst(df):
    """Ground-truth physics used to synthesise 'observed' LST."""
    imp, tree, veg, water, bare = df.impervious, df.tree_canopy, df.vegetation, df.water, df.bare
    lst = (31.2
           + 10.5 * imp
           + 2.8 * imp * df.building_density           # urban-canyon heat trapping
           - 6.2 * tree - 2.6 * (veg - tree)
           - 9.5 * water
           - 2.0 * np.exp(-df.dist_water_km / 0.7)      # blue-space cooling
           - 3.4 * np.exp(-df.dist_coast_km / 2.6)      # sea breeze
           - 23.0 * (df.albedo - 0.15)
           + 4.2 * bare
           + df.anthropogenic_heat
           + 0.06 * df.dist_coast_km)
    return lst


def generate(seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    lat, lon = geo.grid_centres()
    land = lon < geo.coast_lon(lat) - geo.STEP * 0.25
    keep = land & geo.inside_study_area(lat, lon)
    lat, lon = lat[keep], lon[keep]
    n = lat.size

    # ---- distances --------------------------------------------------------
    dist_coast = np.maximum((geo.coast_lon(lat) - lon) * geo.KM_PER_DEG_LON, 0.05)

    water = np.zeros(n)
    dist_water = np.full(n, np.inf)
    for _, pts, w in geo.RIVERS:
        d = geo.dist_to_polyline_km(lat, lon, pts)
        water = np.maximum(water, min(0.9, w / 0.45 + 0.08) * np.exp(-(d / max(0.28, w)) ** 2))
        dist_water = np.minimum(dist_water, np.maximum(d - w / 2, 0))
    for _, la, lo, r in geo.LAKES:
        d = geo.dist_km(lat, lon, la, lo)
        water = np.maximum(water, 0.9 * _bump(d, r, 0.15))
        dist_water = np.minimum(dist_water, np.maximum(d - r, 0))
    dist_water = np.minimum(dist_water, dist_coast)

    # ---- urban intensity ----------------------------------------------------
    d_core = geo.dist_km(lat, lon, 13.062, 80.255)
    comps = [0.92 * np.exp(-(d_core / 10.5) ** 2)]
    for (a, b, wk, wt) in geo.CORRIDORS:
        d = geo.dist_to_polyline_km(lat, lon, [a, b])
        comps.append(wt * np.exp(-(d / wk) ** 2))
    u = 1 - np.prod([1 - c for c in comps], axis=0)
    u = np.clip(u + 0.10 * _smooth_noise(rng, lat, lon), 0.04, 0.98)

    green_bias = np.zeros(n)
    tree_bias = np.zeros(n)
    imp_bias = np.zeros(n)
    bare_bias = np.zeros(n)
    heat = np.zeros(n)
    pop_mult = np.ones(n)
    informal = np.zeros(n)
    dense = np.zeros(n)
    bright = np.zeros(n)
    for name, la, lo, r, kind, s in geo.PATCHES:
        w = s * _bump(geo.dist_km(lat, lon, la, lo), r)
        if kind == "forest":
            green_bias += 0.9 * w; tree_bias += 0.8 * w; imp_bias -= 0.8 * w; pop_mult *= 1 - 0.95 * w
        elif kind == "green":
            green_bias += 0.5 * w; tree_bias += 0.4 * w; imp_bias -= 0.45 * w; pop_mult *= 1 - 0.5 * w
        elif kind == "campus":
            green_bias += 0.6 * w; tree_bias += 0.55 * w; imp_bias -= 0.55 * w; pop_mult *= 1 - 0.75 * w
        elif kind == "wetland":
            green_bias += 0.55 * w; tree_bias -= 0.1 * w; imp_bias -= 0.7 * w; pop_mult *= 1 - 0.9 * w
            water[:] = np.maximum(water, 0.45 * w)
            dist_water = np.where(w > 0.5, 0, dist_water)
        elif kind == "industrial":
            imp_bias += 0.35 * w; green_bias -= 0.3 * w; heat += 3.0 * w; pop_mult *= 1 - 0.8 * w
            bright += 0.8 * w
            bare_bias += 0.12 * w
        elif kind == "dump":
            bare_bias += 0.55 * w; imp_bias -= 0.1 * w; green_bias -= 0.4 * w; heat += 3.4 * w
            pop_mult *= 1 - 0.85 * w
        elif kind == "paved":
            imp_bias += 0.45 * w; green_bias -= 0.25 * w; heat += 1.4 * w; pop_mult *= 1 - 0.9 * w
            bright += 0.5 * w
            bare_bias += 0.15 * w
        elif kind == "dense":
            imp_bias += 0.25 * w; green_bias -= 0.35 * w; dense += w; heat += 0.9 * w
            pop_mult *= 1 + 0.9 * w
        elif kind == "informal":
            imp_bias += 0.15 * w; green_bias -= 0.3 * w; informal += w; pop_mult *= 1 + 0.7 * w
        elif kind == "open":
            bare_bias += 0.45 * w; imp_bias -= 0.4 * w

    # ---- land-cover fractions -------------------------------------------------
    rem = 1 - water
    imp_raw = np.clip(0.08 + 0.85 * u + imp_bias + 0.06 * _smooth_noise(rng, lat, lon, 30, 0.8, 3), 0.02, 0.96)
    peri = np.clip(1 - u, 0, 1)
    bare_raw = np.clip(0.04 + 0.22 * peri ** 1.5 + bare_bias + 0.03 * rng.standard_normal(n), 0.0, 0.7)
    green_share = np.clip(0.78 + green_bias + 0.08 * _smooth_noise(rng, lat, lon), 0.05, 1.0)

    imp = imp_raw * rem
    bare = np.minimum(bare_raw, 1 - imp_raw) * rem * (1 - green_bias.clip(0, 1) * 0.8)
    veg = np.clip((rem - imp - bare) * green_share, 0, None)
    bare = rem - imp - veg  # remainder → bare/soil (sand, construction, fallow)
    tree_share = np.clip(0.38 + tree_bias + 0.10 * _smooth_noise(rng, lat, lon) - 0.15 * peri, 0.08, 0.92)
    tree = veg * tree_share

    roof_share = np.clip(0.52 + 0.18 * dense + 0.05 * rng.standard_normal(n), 0.3, 0.8)
    roof = imp * roof_share
    bldg_density = np.clip(roof * (1.0 + 0.4 * dense), 0, 1)
    roof_alb = np.clip(0.17 + 0.02 * rng.standard_normal(n) - 0.03 * informal, 0.1, 0.26)
    # Existing reflective roofs: metal industrial sheds + scattered cool-roof pilots
    roof_alb = np.clip(roof_alb + 0.22 * np.clip(bright, 0, 1), 0.1, 0.5)
    cool_roof_share = np.where(rng.random(n) < 0.14, rng.uniform(0.15, 0.85, n), 0.0)
    roof_alb = roof_alb * (1 - cool_roof_share) + 0.65 * cool_roof_share

    resid = {
        "ndvi": 0.025 * rng.standard_normal(n),
        "ndbi": 0.025 * rng.standard_normal(n),
        "mndwi": 0.025 * rng.standard_normal(n),
        "albedo": 0.008 * rng.standard_normal(n),
    }
    ndvi, ndbi, mndwi, albedo = spectral_indices(veg, tree, imp, water, bare, roof, roof_alb, resid)

    elevation = np.clip(2.0 + (80.30 - lon) * 70 + 1.5 * _smooth_noise(rng, lat, lon) - 3 * water, 0.5, 30)

    pop_density = (900 + 41000 * u ** 1.6) * pop_mult * np.clip(imp / np.maximum(rem, 1e-3) + 0.15, 0, 1.1)
    pop_density *= (1 - water) * np.exp(0.18 * rng.standard_normal(n))
    pop_density = np.clip(pop_density, 0, 95000)

    elderly = np.clip(0.085 + 0.03 * _smooth_noise(rng, lat, lon) + 0.02 * dense - 0.01 * informal, 0.04, 0.16)
    sens_proxy = np.clip(0.35 * informal + 0.25 * dense + 0.35 * (elderly - 0.04) / 0.12
                         + 0.08 * rng.standard_normal(n) + 0.15, 0, 1)

    df = pd.DataFrame({
        "lat": lat, "lon": lon,
        "vegetation": veg, "tree_canopy": tree, "impervious": imp, "water": water, "bare": bare,
        "roof": roof, "roof_albedo": roof_alb, "cool_roof_share": cool_roof_share,
        "building_density": bldg_density,
        "ndvi": ndvi, "ndbi": ndbi, "mndwi": mndwi, "albedo": albedo,
        "dist_coast_km": dist_coast, "dist_water_km": dist_water, "elevation_m": elevation,
        "pop_density": pop_density, "elderly_share": elderly, "sensitivity": sens_proxy,
        "anthropogenic_heat": heat,
    })
    for k, v in resid.items():
        df[f"resid_{k}"] = v

    df["lst_observed"] = physical_lst(df) + 0.55 * rng.standard_normal(n)
    df["population"] = df.pop_density * CELL_AREA_KM2

    # Locality assignment (nearest centroid)
    loc_names = np.array([l[0] for l in geo.LOCALITIES])
    d = np.stack([geo.dist_km(lat, lon, la, lo) for _, la, lo in geo.LOCALITIES], axis=1)
    df["locality"] = loc_names[d.argmin(axis=1)]
    df.insert(0, "id", np.arange(n))
    return df
