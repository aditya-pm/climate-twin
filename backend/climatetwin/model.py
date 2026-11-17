"""LST surrogate model: XGBoost + TreeSHAP, validated with spatial block CV."""
from __future__ import annotations

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "ndvi", "ndbi", "mndwi", "albedo", "tree_canopy", "impervious", "building_density",
    "dist_coast_km", "dist_water_km", "elevation_m", "anthropogenic_heat",
]

FEATURE_META = {
    "ndvi": {"label": "Vegetation index (NDVI)", "short": "NDVI", "unit": "", "source": "Sentinel-2 L2A B08/B04, Apr–Jun median"},
    "ndbi": {"label": "Built-up index (NDBI)", "short": "NDBI", "unit": "", "source": "Sentinel-2 L2A B11/B08, Apr–Jun median"},
    "mndwi": {"label": "Surface moisture (MNDWI)", "short": "MNDWI", "unit": "", "source": "Sentinel-2 L2A B03/B11, Apr–Jun median"},
    "albedo": {"label": "Surface albedo", "short": "Albedo", "unit": "", "source": "Landsat 8/9 SR, Liang (2001)"},
    "tree_canopy": {"label": "Tree canopy cover", "short": "Canopy", "unit": "%", "source": "ESA WorldCover 2021 (10 m)"},
    "impervious": {"label": "Impervious surface", "short": "Impervious", "unit": "%", "source": "ESA WorldCover 2021 built-up"},
    "building_density": {"label": "Building footprint density", "short": "Buildings", "unit": "%", "source": "JRC GHS-BUILT-S 2020"},
    "dist_coast_km": {"label": "Distance to coast", "short": "Coast dist.", "unit": "km", "source": "WorldCover sea mask"},
    "dist_water_km": {"label": "Distance to water body", "short": "Water dist.", "unit": "km", "source": "WorldCover water mask"},
    "elevation_m": {"label": "Elevation", "short": "Elevation", "unit": "m", "source": "Copernicus DEM GLO-30"},
    "anthropogenic_heat": {"label": "Non-residential building share", "short": "Non-resid.", "unit": "%", "source": "JRC GHS-BUILT-S NRES 2020"},
}

XGB_PARAMS = dict(
    # max_depth / learning_rate selected by grouped CV in train.py on the real Landsat dataset
    n_estimators=650, max_depth=7, learning_rate=0.035, subsample=0.85, colsample_bytree=0.85,
    min_child_weight=3, reg_lambda=1.5, objective="reg:squarederror", tree_method="hist",
)


def _metrics(y, p):
    return {
        "r2": float(r2_score(y, p)),
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
    }


def spatial_blocks(df: pd.DataFrame, block_km: float = 3.0) -> np.ndarray:
    by = np.floor((df.lat - df.lat.min()) * 110.57 / block_km).astype(int)
    bx = np.floor((df.lon - df.lon.min()) * 108.4 / block_km).astype(int)
    return (by * 1000 + bx).to_numpy()


def evaluate(df: pd.DataFrame, target: str = "lst_observed", folds: int = 5) -> dict:
    X, y = df[FEATURES].to_numpy(), df[target].to_numpy()
    groups = spatial_blocks(df)
    candidates = {
        "XGBoost": lambda: xgb.XGBRegressor(**XGB_PARAMS, random_state=0),
        "Random Forest": lambda: RandomForestRegressor(n_estimators=300, min_samples_leaf=2, n_jobs=-1, random_state=0),
        "Ridge (linear)": lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
    }
    out = {}
    oof_best = None
    for name, make in candidates.items():
        oof = np.zeros_like(y)
        for tr, te in GroupKFold(n_splits=folds).split(X, y, groups):
            m = make()
            m.fit(X[tr], y[tr])
            oof[te] = m.predict(X[te])
        out[name] = _metrics(y, oof)
        if name == "XGBoost":
            oof_best = oof
    return {"models": out, "oof": oof_best, "folds": folds, "block_km": 3.0}


class LSTModel:
    def __init__(self):
        self.model = xgb.XGBRegressor(**XGB_PARAMS, random_state=0)
        self._explainer = None

    def fit(self, df: pd.DataFrame, target: str = "lst_observed"):
        self.model.fit(df[FEATURES].to_numpy(), df[target].to_numpy())
        try:
            import shap  # noqa: F401
            self._explainer = shap.TreeExplainer(self.model)
        except Exception:  # pragma: no cover - fall back to XGBoost's native TreeSHAP
            self._explainer = None
        return self

    def predict(self, frame: pd.DataFrame) -> np.ndarray:
        return self.model.predict(frame[FEATURES].to_numpy())

    def shap(self, frame: pd.DataFrame) -> tuple[np.ndarray, float]:
        X = frame[FEATURES].to_numpy()
        if self._explainer is not None:
            vals = self._explainer.shap_values(X)
            base = float(np.atleast_1d(self._explainer.expected_value)[0])
            return np.asarray(vals), base
        contrib = self.model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)
        return contrib[:, :-1], float(contrib[0, -1])
