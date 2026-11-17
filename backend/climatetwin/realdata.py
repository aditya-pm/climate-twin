"""Build the Chennai twin grid from real, public, no-account datasets.

Sources (see data/SOURCES.md for scene lists and citations):
  * Landsat 8/9 Collection-2 Level-2 (Planetary Computer)  → LST target, broadband albedo
  * Sentinel-2 L2A (Planetary Computer)                    → NDVI, NDBI, MNDWI
  * ESA WorldCover 2021 v200 (Planetary Computer)          → land-cover fractions, water / sea masks
  * Copernicus DEM GLO-30 (Planetary Computer)             → elevation
  * JRC GHS-BUILT-S R2023A, 2020, 100 m                    → building footprint density
  * WorldPop 2020 constrained 100 m + age/sex 1 km         → population, share aged 65+
  * JRC GHS-BUILT-S NRES R2023A, 2020, 100 m               → non-residential (industrial/commercial) building share

Every layer is aggregated onto the same 0.005° (~550 m) cells the synthetic layer used, so the
model, explainer, simulator and UI are unchanged. Raw downloads are cached in data/raw/.
"""
from __future__ import annotations

import io
import json
import os
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import planetary_computer as pc
import pystac_client
import rasterio
import requests
import dask
from odc.stac import configure_rio
from odc.stac import load as stac_load
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from scipy import ndimage

from . import geo

# Process-wide GDAL network settings (read by every thread): never wait forever on one request.
for _k, _v in {"GDAL_HTTP_TIMEOUT": "45", "GDAL_HTTP_CONNECTTIMEOUT": "15", "GDAL_HTTP_MAX_RETRY": "8",
               "GDAL_HTTP_RETRY_DELAY": "2",
               "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MULTIPLEX": "YES"}.items():
    os.environ.setdefault(_k, _v)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"
UA = {"User-Agent": "ClimateTwin-research-prototype/1.0"}

# Load extent: the study grid padded by 10 cells (and well into the Bay of Bengal for the sea mask).
# Edges are multiples of the cell size away from the study grid so cells align exactly.
S = geo.STEP
LON0, LON1 = geo.LON_MIN - 10 * S, 80.40
LAT0, LAT1 = geo.LAT_MIN - 10 * S, geo.LAT_MAX + 10 * S
NC = int(round((LON1 - LON0) / S))
NR = int(round((LAT1 - LAT0) / S))
BBOX = (LON0, LAT0, LON1, LAT1)
CELL_AREA_KM2 = (S * geo.KM_PER_DEG_LAT) * (S * geo.KM_PER_DEG_LON)

SEASON_MONTHS = (4, 5, 6)               # April–June: Chennai's hottest, clearest months
SEASON_YEARS = "2023-04-01/2025-06-30"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"

WORLDPOP_POP = "https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/IND/ind_ppp_2020_constrained.tif"
WORLDPOP_1KM = "https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/IND/ind_ppp_2020_1km_Aggregated.tif"
WORLDPOP_AGE = "https://data.worldpop.org/GIS/AgeSex_structures/Global_2000_2020_1km/unconstrained/2020/IND/ind_{s}_{a}_2020_1km.tif"
GHSL_TILE = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/"
             "GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100/V1-0/tiles/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100_V1_0_R8_C26.zip")
GHSL_NRES_TILE = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/"
                  "GHS_BUILT_S_NRES_E2020_GLOBE_R2023A_54009_100/V1-0/tiles/GHS_BUILT_S_NRES_E2020_GLOBE_R2023A_54009_100_V1_0_R8_C26.zip")

GRID_TRANSFORM = from_origin(LON0, LAT1, S, S)   # north-up transform of the cell grid


def log(msg: str):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ── aggregation helpers ─────────────────────────────────────────────────────

def to_cells(values: np.ndarray, xs: np.ndarray, ys: np.ndarray, how: str = "mean") -> np.ndarray:
    """Aggregate a fine raster (y, x) onto the NR×NC cell grid (row 0 = south) by pixel-centre binning."""
    col = np.floor((xs - LON0) / S).astype(int)
    row = np.floor((ys - LAT0) / S).astype(int)
    C, R = np.meshgrid(col, row)
    v = values.astype("float64").ravel()
    idx = (R * NC + C).ravel()
    ok = np.isfinite(v) & (C.ravel() >= 0) & (C.ravel() < NC) & (R.ravel() >= 0) & (R.ravel() < NR)
    tot = np.bincount(idx[ok], weights=v[ok], minlength=NR * NC)
    if how == "sum":
        return tot.reshape(NR, NC)
    cnt = np.bincount(idx[ok], minlength=NR * NC)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(cnt > 0, tot / cnt, np.nan)
    return out.reshape(NR, NC)


def warp_to_cells(src: np.ndarray, src_transform, src_crs, resampling, src_nodata=None) -> np.ndarray:
    """Reproject an array straight onto the cell grid (returned with row 0 = south)."""
    dst = np.full((NR, NC), np.nan, dtype="float64")
    reproject(source=src.astype("float64"), destination=dst, src_transform=src_transform, src_crs=src_crs,
              dst_transform=GRID_TRANSFORM, dst_crs="EPSG:4326", resampling=resampling,
              src_nodata=src_nodata, dst_nodata=np.nan)
    return dst[::-1]


def xy(ds):
    """Pixel-centre longitudes / latitudes of an odc-stac dataset (named x/y or longitude/latitude)."""
    x = ds["longitude"] if "longitude" in ds.coords else ds["x"]
    y = ds["latitude"] if "latitude" in ds.coords else ds["y"]
    return x.values, y.values


def catalog():
    return pystac_client.Client.open(STAC, modifier=pc.sign_inplace)


def stac_items(collection, datetime_=None, query=None):
    items = list(catalog().search(collections=[collection], bbox=BBOX, datetime=datetime_, query=query).items())
    if datetime_:
        items = [i for i in items if i.datetime.month in SEASON_MONTHS]
    return items


# Parallel, cloud-tuned reads: many concurrent HTTP range requests instead of one tile at a time.
# GDAL has no HTTP timeout by default: a single stalled range request would hang the whole load.
configure_rio(cloud_defaults=True, GDAL_HTTP_TIMEOUT=60, GDAL_HTTP_CONNECTTIMEOUT=20,
              GDAL_HTTP_MAX_RETRY=6, GDAL_HTTP_RETRY_DELAY=3)
dask.config.set(scheduler="threads", num_workers=8)


def load(items, bands, res, resampling="nearest"):
    ds = stac_load(items, bands=bands, crs="EPSG:4326", resolution=res, bbox=BBOX, groupby="solar_day",
                   resampling=resampling, patch_url=pc.sign, fail_on_error=True, chunks={})
    return ds.compute()


def band_cache(key: str, fn, valid_range: tuple[float, float], min_valid: float = 0.5):
    """Cache one composited band so a restart never repeats finished downloads.

    The composite is validated first: at least `min_valid` of pixels finite and the median inside
    `valid_range`. A failed or partial download raises instead of being cached as holes.
    """
    RAW.mkdir(parents=True, exist_ok=True)
    f = RAW / f"band_{key}.npy"
    if f.exists():
        return np.load(f)
    arr = np.asarray(fn(), dtype="float32")
    first = arr[0] if arr.ndim == 3 else arr
    frac = float(np.isfinite(first).mean())
    med = float(np.nanmedian(first)) if frac > 0 else float("nan")
    if frac < min_valid or not (valid_range[0] <= med <= valid_range[1]):
        raise RuntimeError(f"band {key}: {frac:.0%} valid, median {med:.3f} outside {valid_range}; not caching")
    np.save(f, arr)
    log(f"  cached {key}: {frac:.0%} valid, median {med:.3f}")
    return arr


def cached_step(name: str, fn, sources: dict):
    """Run a source step once; later runs reuse data/raw/step_<name>.npz (delete it to refetch)."""
    RAW.mkdir(parents=True, exist_ok=True)
    f, meta = RAW / f"step_{name}.npz", RAW / f"step_{name}.json"
    if f.exists() and meta.exists():
        sources.update(json.loads(meta.read_text()))
        z = np.load(f)
        out = {k: z[k] for k in z.files}
        log(f"{name}: reused cached result")
        return out["_single"] if list(out) == ["_single"] else out
    before = set(sources)
    res = fn(sources)
    arrays = res if isinstance(res, dict) else {"_single": res}
    tmp = f.with_name(f.stem + ".part.npz")
    np.savez_compressed(tmp, **{k: np.asarray(v) for k, v in arrays.items()})
    tmp.replace(f)
    meta.write_text(json.dumps({k: sources[k] for k in set(sources) - before}))
    return res


# ── individual sources ───────────────────────────────────────────────────

def scene(item, bands, res, resampling="nearest", tries=8) -> dict | None:
    """Load one STAC item's bands onto the load grid; cached per scene, retried with backoff.

    Returns None if the scene still fails after `tries` attempts, so one bad tile costs one
    scene instead of the whole composite.
    """
    d = RAW / "scenes"
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"{item.id}_{res}.npz"
    if f.exists():
        try:
            z = np.load(f)
            return {k: z[k] for k in z.files}
        except Exception:                                      # truncated by an interrupted run
            log(f"    {item.id}: cache unreadable, refetching")
            f.unlink()
    for t in range(tries):
        try:
            ds = load([item], bands, res, resampling)
            out = {b: ds[b].values[0] for b in bands}
            tmp = f.with_name(f.stem + ".part.npz")
            np.savez_compressed(tmp, **out)
            tmp.replace(f)                                     # atomic: never leave a half-written cache
            return out
        except Exception as e:  # network / truncated tile
            log(f"    {item.id}: attempt {t + 1} failed ({type(e).__name__}); retrying")
            pc.sign_inplace(item)                              # refresh the SAS token
            time.sleep(min(60, 8 * (t + 1)))                  # ride out transient DNS / network drops
    log(f"    {item.id}: skipped after {tries} attempts")
    return None


def landsat(sources: dict):
    items = stac_items("landsat-c2-l2", SEASON_YEARS,
                       {"eo:cloud_cover": {"lt": 30}, "platform": {"in": ["landsat-8", "landsat-9"]}})
    log(f"Landsat: {len(items)} Apr–Jun scenes")
    res = 0.00025
    bands = ["lwir11", "qa_pixel", "blue", "red", "nir08", "swir16", "swir22"]
    weights = {"blue": 0.356, "red": 0.130, "nir08": 0.373, "swir16": 0.085, "swir22": 0.072}  # Liang (2001)
    xs, ys = xy(load(items[:1], ["qa_pixel"], res))
    lsts, albs, used = [], [], []
    for k, it in enumerate(items):
        sc = scene(it, bands, res)
        if sc is None:
            continue
        bad = (sc["qa_pixel"].astype("uint16") & 0b11111) > 0   # fill, dilated cloud, cirrus, cloud, shadow
        st = sc["lwir11"].astype("float32")
        st = np.where(bad | (st == 0), np.nan, st * 0.00341802 + 149.0 - 273.15)
        lsts.append(np.where((st > 10) & (st < 70), st, np.nan))
        alb = -0.0018
        for b, w in weights.items():
            v = sc[b].astype("float32")
            alb = alb + w * np.where(bad | (v == 0), np.nan, v * 0.0000275 - 0.2)
        albs.append(alb)
        used.append(it.id)
        log(f"  Landsat scene {k + 1}/{len(items)} ok ({np.isfinite(lsts[-1]).mean():.0%} clear)")
    sources["landsat"] = sorted(used)
    st = np.stack(lsts)
    lst = np.nanmedian(st, axis=0)
    nobs = np.isfinite(st).sum(axis=0).astype("float32")
    alb = np.nanmedian(np.stack(albs), axis=0)
    if np.isfinite(lst).mean() < 0.5:
        raise RuntimeError("Landsat composite mostly empty")
    log(f"  Landsat composite: {len(used)} scenes, LST median {np.nanmedian(lst):.1f} °C, albedo median {np.nanmedian(alb):.3f}")
    return {"lst": to_cells(lst, xs, ys), "lst_obs": to_cells(nobs, xs, ys), "albedo": to_cells(alb, xs, ys)}


def sentinel2(sources: dict):
    items = stac_items("sentinel-2-l2a", SEASON_YEARS, {"eo:cloud_cover": {"lt": 10}})
    log(f"Sentinel-2: {len(items)} Apr–Jun granules (< 10% cloud)")
    res = 0.0002
    bands = ["B03", "B04", "B08", "B11", "SCL"]
    xs, ys = xy(load(items[:1], ["SCL"], res))
    stacks: dict[str, list] = {b: [] for b in bands[:4]}
    used = []
    for k, it in enumerate(items):
        sc = scene(it, bands, res)
        if sc is None:
            continue
        good = np.isin(sc["SCL"], [4, 5, 6, 7])               # vegetation, bare, water, unclassified
        for b in stacks:
            v = sc[b].astype("float32")
            stacks[b].append(np.where(good & (v > 0), (v - 1000.0) / 10000.0, np.nan))  # baseline ≥ 04.00 offset
        used.append(it.id)
        log(f"  Sentinel-2 granule {k + 1}/{len(items)} ok ({good.mean():.0%} clear)")
    sources["sentinel2"] = sorted(used)
    refl = {b: np.nanmedian(np.stack(v), axis=0) for b, v in stacks.items()}    # median reflectance composite
    del stacks

    def nd(a, b):
        with np.errstate(invalid="ignore", divide="ignore"):
            return (refl[a] - refl[b]) / (refl[a] + refl[b])

    out = {"ndvi": nd("B08", "B04"), "ndbi": nd("B11", "B08"), "mndwi": nd("B03", "B11")}
    if np.isfinite(out["ndvi"]).mean() < 0.5:
        raise RuntimeError("Sentinel-2 composite mostly empty")
    log(f"  Sentinel-2 composite: {len(used)} granules, NDVI median {np.nanmedian(out['ndvi']):.2f}")
    return {k: to_cells(v, xs, ys) for k, v in out.items()}


def worldcover(sources: dict):
    items = [i for i in stac_items("esa-worldcover") if "2021" in i.id]
    sources["worldcover"] = [i.id for i in items]
    ds = load(items, ["map"], 0.0001)
    lc = ds["map"].values[0]
    xs, ys = xy(ds)
    log(f"WorldCover 2021 loaded {lc.shape}")
    valid = lc > 0
    frac = {}
    for name, classes in {"tree": [10], "veg": [10, 20, 30, 40, 90, 95], "imp": [50], "water": [80]}.items():
        frac[name] = to_cells(np.where(valid, np.isin(lc, classes), np.nan), xs, ys)
    frac["bare"] = 1 - frac["veg"] - frac["imp"] - frac["water"]

    # Sea = water connected to the eastern edge of the load extent (Bay of Bengal)
    water = lc == 80
    lab, _ = ndimage.label(water)
    sea_ids = np.unique(lab[:, -1])
    sea = np.isin(lab, sea_ids[sea_ids > 0])
    frac["sea"] = to_cells(sea.astype("float32"), xs, ys)
    dy = abs(ys[1] - ys[0]) * geo.KM_PER_DEG_LAT
    dx = abs(xs[1] - xs[0]) * geo.KM_PER_DEG_LON
    d_water = ndimage.distance_transform_edt(~water, sampling=(dy, dx)).astype("float32")
    d_sea = ndimage.distance_transform_edt(~sea, sampling=(dy, dx)).astype("float32")
    frac["dist_water"] = to_cells(d_water, xs, ys)
    frac["dist_coast"] = to_cells(d_sea, xs, ys)
    return frac


def dem(sources: dict):
    items = stac_items("cop-dem-glo-30")
    sources["dem"] = [i.id for i in items]
    ds = load(items, ["data"], 0.00025, resampling="bilinear")
    z = ds["data"].values[0].astype("float32")
    z = np.where(z < -100, np.nan, z)
    return to_cells(z, *xy(ds))


def _cached(url: str, tries: int = 10) -> Path:
    """Download once into data/raw/, resuming partial files and retrying through network drops."""
    RAW.mkdir(parents=True, exist_ok=True)
    p = RAW / url.rsplit("/", 1)[-1]
    if p.exists():
        return p
    tmp = p.with_suffix(p.suffix + ".part")
    for t in range(tries):
        try:
            have = tmp.stat().st_size if tmp.exists() else 0
            hdr = {**UA, **({"Range": f"bytes={have}-"} if have else {})}
            with requests.get(url, headers=hdr, stream=True, timeout=(15, 60)) as r:
                if r.status_code == 416:                       # already complete
                    break
                r.raise_for_status()
                mode = "ab" if have and r.status_code == 206 else "wb"
                with open(tmp, mode) as f:
                    done, mark = have, have
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                        done += len(chunk)
                        if done - mark >= 50e6:                # heartbeat for the stall supervisor
                            log(f"    {p.name}: {done / 1e6:.0f} MB")
                            mark = done
            break
        except (requests.RequestException, OSError) as e:
            log(f"    download {p.name}: attempt {t + 1} failed ({type(e).__name__}); resuming")
            time.sleep(min(60, 6 * (t + 1)))
    else:
        raise RuntimeError(f"could not download {url}")
    tmp.rename(p)
    log(f"downloaded {p.name} ({p.stat().st_size / 1e6:.0f} MB)")
    return p


def _read_window(path: str, pad: float = 0.02):
    with rasterio.open(path) as src:
        win = from_bounds(LON0 - pad, LAT0 - pad, LON1 + pad, LAT1 + pad, transform=src.transform)
        win = win.round_offsets().round_lengths()
        arr = src.read(1, window=win, boundless=True, fill_value=src.nodata if src.nodata is not None else 0)
        return arr, src.window_transform(win), src.crs, src.nodata


def _ghsl_share(url: str) -> np.ndarray:
    """GHSL built-surface tile (m² per 100 m pixel, Mollweide) → share of each cell's area."""
    zpath = _cached(url)
    with zipfile.ZipFile(zpath) as z:
        name = next(n for n in z.namelist() if n.endswith(".tif"))
        tif = RAW / name
        if not tif.exists():
            tif.write_bytes(z.read(name))
    with rasterio.open(tif) as src:
        arr = src.read(1).astype("float64")
        if src.nodata is not None:
            arr[arr == src.nodata] = np.nan
        arr[arr > 10000] = np.nan
        built = warp_to_cells(arr / 10000.0, src.transform, src.crs, Resampling.average)  # m² per 100 m px → share
    return np.clip(np.nan_to_num(built), 0, 1)


def ghsl(sources: dict):
    sources["ghsl"] = GHSL_TILE
    return _ghsl_share(GHSL_TILE)


def ghsl_nres(sources: dict):
    """Non-residential (industrial / commercial / institutional) built surface: waste-heat proxy."""
    sources["ghsl_nres"] = GHSL_NRES_TILE
    return _ghsl_share(GHSL_NRES_TILE)


def worldpop(sources: dict):
    sources["worldpop"] = [WORLDPOP_POP, WORLDPOP_1KM] + [WORLDPOP_AGE.format(s=s, a=a) for s in "fm" for a in (65, 70, 75, 80)]
    arr, tr, crs, nd = _read_window(str(_cached(WORLDPOP_POP)))
    arr = np.where((arr == nd) | (arr < 0), 0, arr)
    pop = warp_to_cells(arr, tr, crs, Resampling.sum)

    tot, tr1, crs1, nd1 = _read_window(str(_cached(WORLDPOP_1KM)))
    tot = np.where((tot == nd1) | (tot < 0), np.nan, tot)
    old = np.zeros_like(tot, dtype="float64")
    for s in "fm":
        for a in (65, 70, 75, 80):
            v, *_ = _read_window(str(_cached(WORLDPOP_AGE.format(s=s, a=a))))
            old += np.where(v < 0, 0, v)
    with np.errstate(invalid="ignore", divide="ignore"):
        share = np.where(tot > 0, old / tot, np.nan)
    elderly = warp_to_cells(share, tr1, crs1, Resampling.bilinear)
    return np.nan_to_num(pop), elderly


# ── assembly ────────────────────────────────────────────────────────────

INDEX_TERMS = ["tree", "grass", "roof", "pave", "water", "bare"]


def fit_forward_model(df: pd.DataFrame) -> dict:
    """Linear un-mixing: each spectral index ≈ Σ coef_k · fraction_k (fractions sum to 1, so no intercept)."""
    X = np.c_[df.tree_canopy, df.vegetation - df.tree_canopy, df.roof, df.impervious - df.roof, df.water, df.bare]
    out = {}
    for k in ("ndvi", "ndbi", "mndwi", "albedo"):
        coef, *_ = np.linalg.lstsq(X, df[k].to_numpy(), rcond=None)
        pred = X @ coef
        r2 = 1 - np.var(df[k] - pred) / np.var(df[k])
        out[k] = {"coef": dict(zip(INDEX_TERMS, map(float, coef))), "r2": float(r2)}
    return out


def build() -> pd.DataFrame:
    t0 = time.time()
    sources: dict = {"built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                     "season": "April–June, 2023–2025", "grid_step_deg": S}
    wc = cached_step("worldcover", worldcover, sources)
    log("WorldCover fractions + distances done")
    ls = cached_step("landsat", landsat, sources)
    log("Landsat LST + albedo done")
    s2 = cached_step("sentinel2", sentinel2, sources)
    log("Sentinel-2 indices done")
    z = cached_step("dem", dem, sources)
    log("DEM done")
    built = cached_step("ghsl", ghsl, sources)
    log("GHSL built surface done")
    wp = cached_step("worldpop", lambda src: dict(zip(("pop", "elderly"), worldpop(src))), sources)
    pop, elderly = wp["pop"], wp["elderly"]
    log("WorldPop done")
    ind = cached_step("ghsl_nres", ghsl_nres, sources)
    log("GHSL non-residential built surface done")

    # pick study cells
    lat, lon = geo.grid_centres()
    r = np.floor((lat - LAT0) / S).astype(int)
    c = np.floor((lon - LON0) / S).astype(int)
    pick = lambda a: a[r, c]  # noqa: E731
    keep = geo.inside_study_area(lat, lon) & (pick(wc["sea"]) < 0.5) & np.isfinite(pick(ls["lst"])) \
        & np.isfinite(pick(s2["ndvi"])) & np.isfinite(pick(wc["veg"]))
    log(f"study cells: {int(geo.inside_study_area(lat, lon).sum())} in footprint → {int(keep.sum())} land cells with valid data")

    df = pd.DataFrame({"lat": lat[keep], "lon": lon[keep]})
    rr, cc = r[keep], c[keep]
    g = lambda a: a[rr, cc]  # noqa: E731
    water = np.clip(g(wc["water"]), 0, 1)
    imp = np.clip(g(wc["imp"]), 0, 1)
    veg = np.clip(g(wc["veg"]), 0, 1)
    tree = np.clip(g(wc["tree"]), 0, 1)
    bare = np.clip(1 - veg - imp - water, 0, 1)
    tot = veg + imp + water + bare
    veg, imp, water, bare, tree = veg / tot, imp / tot, water / tot, bare / tot, tree / tot
    bd = np.clip(np.nan_to_num(g(built)), 0, 1)
    roof = np.minimum(bd, imp)

    df["vegetation"], df["tree_canopy"], df["impervious"], df["water"], df["bare"] = veg, tree, imp, water, bare
    df["roof"], df["building_density"] = roof, bd
    df["ndvi"], df["ndbi"], df["mndwi"] = g(s2["ndvi"]), g(s2["ndbi"]), g(s2["mndwi"])
    df["albedo"] = g(ls["albedo"])
    df["dist_coast_km"] = np.maximum(g(wc["dist_coast"]), 0.05)
    df["dist_water_km"] = g(wc["dist_water"])
    df["elevation_m"] = np.nan_to_num(g(z), nan=float(np.nanmedian(z)))
    df["population"] = g(pop)
    df["pop_density"] = df.population / CELL_AREA_KM2
    el = g(elderly)
    df["elderly_share"] = np.where(np.isfinite(el), el, np.nanmedian(el))
    df["anthropogenic_heat"] = np.nan_to_num(g(ind))
    crowd = df.population / (bd * CELL_AREA_KM2 * 1e6 + 500.0)          # residents per m² of built surface
    df["sensitivity"] = 0.6 * df.elderly_share.rank(pct=True) + 0.4 * crowd.rank(pct=True)
    df["lst_observed"] = g(ls["lst"])
    df["lst_obs_count"] = g(ls["lst_obs"])
    for k in ("ndvi", "ndbi", "mndwi", "albedo"):
        df[k] = df[k].fillna(df[k].median())

    fwd = fit_forward_model(df)
    roof_alb = float(np.clip(fwd["albedo"]["coef"]["roof"], 0.08, 0.35))
    fwd["roof_albedo"] = roof_alb
    df["roof_albedo"] = roof_alb
    df["cool_roof_share"] = 0.0
    X = {"tree": df.tree_canopy, "grass": df.vegetation - df.tree_canopy, "roof": df.roof,
         "pave": df.impervious - df.roof, "water": df.water, "bare": df.bare}
    for k in ("ndvi", "ndbi", "mndwi", "albedo"):
        coef = dict(fwd[k]["coef"])
        if k == "albedo":
            coef["roof"] = roof_alb
        df[f"resid_{k}"] = df[k] - sum(coef[t] * X[t] for t in INDEX_TERMS)

    df["locality"] = geo.assign_localities(df.lat.to_numpy(), df.lon.to_numpy())
    df.insert(0, "id", np.arange(len(df)))

    DATA.mkdir(exist_ok=True)
    df.round(6).to_csv(DATA / "chennai_grid_real.csv", index=False)
    (DATA / "forward_model.json").write_text(json.dumps(fwd, indent=2))
    sources["cells"] = int(len(df))
    sources["seconds"] = round(time.time() - t0, 1)
    (DATA / "sources.json").write_text(json.dumps(sources, indent=2))
    log(f"wrote {len(df)} cells in {sources['seconds']} s")
    return df
