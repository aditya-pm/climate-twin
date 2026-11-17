"""Download and assemble the real-data Chennai grid (one-off, needs internet, ~5–15 min).

    .venv/bin/python fetch_data.py

Writes data/chennai_grid_real.csv, data/forward_model.json and data/sources.json.
The app, train.py and the tests read those committed files and never need the network.
"""
import json

import numpy as np

from climatetwin.realdata import DATA, build


def main():
    df = build()
    fwd = json.loads((DATA / "forward_model.json").read_text())
    print("\n── data quality ──")
    print(f"cells                      {len(df)}")
    print(f"Landsat clear obs / pixel  median {df.lst_obs_count.median():.1f}, min {df.lst_obs_count.min():.1f}")
    print(f"LST °C                     {df.lst_observed.min():.1f} – {df.lst_observed.max():.1f} (mean {df.lst_observed.mean():.1f})")
    print(f"population                 {df.population.sum() / 1e6:.2f} M")
    print(f"missing values             {int(df.isna().sum().sum())}")
    for k in ("ndvi", "ndbi", "mndwi", "albedo"):
        print(f"forward model {k:7s} R²   {fwd[k]['r2']:.2f}")
    print(f"roof albedo (fitted)       {fwd['roof_albedo']:.3f}")
    spots = {"Guindy National Park": (13.005, 80.228), "T. Nagar": (13.042, 80.234),
             "Manali industrial": (13.168, 80.265), "Marina / Triplicane": (13.058, 80.276)}
    print("\n── spot checks ──")
    for name, (la, lo) in spots.items():
        i = int(np.argmin((df.lat - la) ** 2 + (df.lon - lo) ** 2))
        r = df.iloc[i]
        print(f"{name:22s} LST {r.lst_observed:5.1f}°C  NDVI {r.ndvi:5.2f}  canopy {r.tree_canopy:4.0%}  "
              f"sealed {r.impervious:4.0%}  coast {r.dist_coast_km:4.1f} km")


if __name__ == "__main__":
    main()
