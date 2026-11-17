# ClimateTwin

AI-powered urban climate vulnerability and mitigation simulator for **Chennai, India**. It maps surface heat and a Heat Vulnerability Index (HVI) on a ~550 m grid, explains each cell's heat with SHAP, and simulates how trees, parks, cool roofs and de-concreting would change it.

| Page | What it does |
|---|---|
| `/` | Landing page with a live, rotating 3D heat map of the city |
| `/explore` | Twin Explorer: six map layers in 2D or 3D. Click any cell for its HVI, a SHAP waterfall, a plain-language diagnosis and its best interventions |
| `/simulate` | What-if simulator: four sliders, presets, and a target area (whole city, hotspots or chosen neighbourhoods). Shows a before/after swipe map, a cooling map, histograms and per-neighbourhood gains |
| `/insights` | Priority intervention sites, how well each lever works, canopy vs. heat, and a sortable ranking of neighbourhoods |
| `/methodology` | Model comparison under spatial cross-validation, observed vs. predicted, SHAP importance and dependence, the HVI formula, and limitations |

## Run it

```bash
# 1. API (Python 3.11+)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app:app --port 8000      # builds the twin and trains the model on startup (~6 s)

# 2. Web (Node 20+), in another terminal
cd web
npm install                                  # postinstall copies the MapLibre worker into public/
npm run dev                                  # http://localhost:3000
```

The real-data grid (`backend/data/chennai_grid_real.csv`) is committed, so the app and training need no internet.

Reproduce the data, model evaluation and tests (from `backend/`):

```bash
caffeinate -i ./fetch_supervised.sh   # optional: rebuild the grid from the satellite sources (~30 min, ~1.6 GB cache in data/raw/)
.venv/bin/python train.py             # EDA, spatial split, grouped-CV search, held-out test → reports/metrics.json (~30 s)
.venv/bin/python -m pytest -q         # 7 invariant and API tests
```

`fetch_supervised.sh` wraps `fetch_data.py`: every scene and source is cached as soon as it downloads, and the run restarts itself if the network stalls. `CLIMATETWIN_DATA=synthetic` switches the app back to the original synthetic layer for comparison.

The web app sends `/api/*` requests to `http://127.0.0.1:8000`. To use a different API address, set `CLIMATETWIN_API`.

## Architecture

```
backend/
  climatetwin/realdata.py  Real-data pipeline: Planetary Computer STAC + GHSL + WorldPop → 550 m cells
  climatetwin/data.py      Loader (real | synthetic) and the fitted spectral forward model
  climatetwin/geo.py       Study grid and boundary, rivers, lakes, 61 localities
  climatetwin/synth.py     Original synthetic observation layer (kept for comparison)
  climatetwin/model.py     XGBoost LST model, RF/Ridge baselines, spatial block CV, TreeSHAP
  climatetwin/engine.py    The twin: HVI, scenario simulator, lever pre-computation, narratives
  fetch_data.py            Build data/chennai_grid_real.csv, forward_model.json, sources.json
  train.py                 Spatial split, grouped-CV model search, held-out test → reports/metrics.json
  app.py                   FastAPI: /api/meta, /grid, /cell/{id}, /simulate, /localities, /recommendations, /model
web/                       Next.js 16 (App Router) + Tailwind v4 + MapLibre GL + Recharts + Framer Motion
```

**How the simulator works:** each intervention edits a cell's WorldCover land-cover fractions. A linear un-mixing model fitted on the real imagery maps the change to new NDVI/NDBI/MNDWI/albedo, and those changes are added to each cell's observed indices. XGBoost then predicts again, and only the change in prediction is added to the observed temperature. Cool roofs push albedo beyond anything observed in Chennai, where tree models cannot extrapolate. Their effect therefore uses a partial albedo sensitivity (°C per unit albedo) estimated from Chennai's own built-up cells. HVI is then recomputed.

## About the data

All inputs are real, public, and need no account:

| Layer | Source |
|---|---|
| Land surface temperature (target), albedo | Landsat 8/9 Collection-2 Level-2, April–June 2023–2025, 16 scenes (Microsoft Planetary Computer) |
| NDVI, NDBI, MNDWI | Sentinel-2 L2A, April–June 2023–2025, 23 granules with < 10 % cloud |
| Land-cover fractions, water and sea masks | ESA WorldCover 2021 v200, 10 m |
| Building and non-residential building density | JRC GHS-BUILT-S R2023A (total and NRES), 2020, 100 m |
| Elevation | Copernicus DEM GLO-30 |
| Population, share aged 65+ | WorldPop 2020 constrained 100 m; WorldPop age/sex 1 km |

Scene IDs and download details are recorded in `backend/data/sources.json`.

**Results on real data:** the held-out spatial test (20 unseen 3 km blocks) gives R² 0.79 and MAE 0.83 °C. The earlier synthetic layer scored R² 0.95, but its target was generated from the model's own inputs, so that number was inflated. Vulnerability classes are relative to the city: the bottom 30 % of cells are Low, then Moderate up to 60 %, High up to 85 %, and the top 15 % Severe.

**Limitations:**
- Landsat passes over at about 10:30 IST, so the target is late-morning surface heat, not air temperature.
- Population and building layers describe 2020.
- The cool-roof effect is estimated from observed albedo, not from measured retrofits.
