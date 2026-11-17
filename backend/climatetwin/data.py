"""Dataset loader: real satellite-derived grid (default) or the synthetic prototype layer.

    CLIMATETWIN_DATA=real|synthetic   (env var, default: real when data/chennai_grid_real.csv exists)
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from . import synth

DATA = Path(__file__).resolve().parents[1] / "data"
REAL_CSV = DATA / "chennai_grid_real.csv"
TERMS = ["tree", "grass", "roof", "pave", "water", "bare"]


@dataclass
class Dataset:
    df: pd.DataFrame
    forward: Callable
    source: str
    info: dict = field(default_factory=dict)


def make_forward(fwd: dict) -> Callable:
    """Spectral forward model fitted on real data (see realdata.fit_forward_model).

    Same signature as synth.spectral_indices so the simulator is unchanged: interventions edit
    land-cover fractions, this maps them to new indices, and each cell keeps its own residual.
    """
    C = {k: fwd[k]["coef"] for k in ("ndvi", "ndbi", "mndwi", "albedo")}

    def forward(veg, tree, imp, water, bare, roof, alb, resid):
        X = {"tree": tree, "grass": veg - tree, "roof": roof, "pave": imp - roof, "water": water, "bare": bare}
        lin = lambda k: sum(C[k][t] * X[t] for t in TERMS)  # noqa: E731
        ndvi = lin("ndvi") + resid["ndvi"]
        ndbi = lin("ndbi") + resid["ndbi"]
        mndwi = lin("mndwi") + resid["mndwi"]
        albedo = sum(C["albedo"][t] * X[t] for t in TERMS if t != "roof") + roof * alb + resid["albedo"]
        return (np.clip(ndvi, -0.4, 0.95), np.clip(ndbi, -0.7, 0.6),
                np.clip(mndwi, -0.8, 0.9), np.clip(albedo, 0.03, 0.6))

    return forward


def load_dataset(source: str | None = None) -> Dataset:
    source = source or os.environ.get("CLIMATETWIN_DATA") or ("real" if REAL_CSV.exists() else "synthetic")
    if source == "real":
        df = pd.read_csv(REAL_CSV)
        fwd = json.loads((DATA / "forward_model.json").read_text())
        info = json.loads((DATA / "sources.json").read_text())
        return Dataset(df=df, forward=make_forward(fwd), source="real", info={**info, "forward_model": fwd})
    if source == "synthetic":
        return Dataset(df=synth.generate(synth.SEED), forward=synth.spectral_indices, source="synthetic",
                       info={"season": "synthetic prototype layer"})
    raise ValueError(f"unknown data source {source!r}")
