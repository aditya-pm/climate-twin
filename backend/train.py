"""Reproducible training & evaluation pipeline for the ClimateTwin LST model.

    .venv/bin/python train.py            # writes reports/ and artifacts/

Steps
  1. Build the dataset (fixed seed) and run data-quality checks + EDA.
  2. Split on 3 km spatial blocks: 80 % train / 20 % held-out test (no block in both).
  3. Model selection with 5-fold GroupKFold CV on the training blocks only
     (Ridge, Random Forest, XGBoost with a small hyper-parameter grid).
  4. Refit the winner on all training data, score once on the held-out test set.
  5. Contrast with a naive random split to quantify spatial-leakage optimism.
"""
from __future__ import annotations

import itertools
import json
import platform
import time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from climatetwin.engine import CATEGORIES, Twin, category_of
from climatetwin.model import FEATURES, XGB_PARAMS, spatial_blocks
from climatetwin.data import load_dataset
from climatetwin.synth import SEED

ROOT = Path(__file__).parent
REPORTS = ROOT / "reports"
ARTIFACTS = ROOT / "artifacts"
TARGET = "lst_observed"


def metrics(y, p) -> dict:
    return {
        "r2": float(r2_score(y, p)),
        "mae": float(mean_absolute_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "mape": float(mean_absolute_percentage_error(y, p) * 100),
        "bias": float(np.mean(p - y)),
    }


def eda(df: pd.DataFrame) -> dict:
    X = df[FEATURES]
    y = df[TARGET]
    q1, q3 = y.quantile([0.25, 0.75])
    iqr = q3 - q1
    corr = X.corr()
    # Variance inflation factors via R² of each feature on the rest
    vif = {}
    for f in FEATURES:
        others = [o for o in FEATURES if o != f]
        A = np.c_[np.ones(len(X)), X[others].to_numpy()]
        coef, *_ = np.linalg.lstsq(A, X[f].to_numpy(), rcond=None)
        r2 = 1 - np.var(X[f].to_numpy() - A @ coef) / np.var(X[f].to_numpy())
        vif[f] = float(1 / max(1 - r2, 1e-6))
    hist, edges = np.histogram(y, bins=np.arange(22, 49, 1.0))
    return {
        "rows": int(len(df)),
        "features": len(FEATURES),
        "missing_values": int(df[FEATURES + [TARGET]].isna().sum().sum()),
        "duplicate_cells": int(df.duplicated(["lat", "lon"]).sum()),
        "target": {k: float(v) for k, v in y.describe().items()},
        "target_outliers_iqr": int(((y < q1 - 1.5 * iqr) | (y > q3 + 1.5 * iqr)).sum()),
        "target_hist": [{"t": float(e), "n": int(n)} for e, n in zip(edges[:-1], hist)],
        "feature_summary": {f: {k: float(v) for k, v in X[f].describe().items()} for f in FEATURES},
        "corr_with_target": {f: float(np.corrcoef(X[f], y)[0, 1]) for f in FEATURES},
        "max_abs_feature_corr": float((corr.abs() - np.eye(len(FEATURES))).max().max()),
        "corr_pairs": sorted(
            [{"a": a, "b": b, "r": float(corr.loc[a, b])} for a, b in itertools.combinations(FEATURES, 2)],
            key=lambda d: -abs(d["r"]),
        )[:6],
        "vif": vif,
        "population_total": float(df.population.sum()),
    }


def main():
    t0 = time.time()
    REPORTS.mkdir(exist_ok=True)
    ARTIFACTS.mkdir(exist_ok=True)

    # 1 ── data + EDA ----------------------------------------------------------
    data = load_dataset()
    df = data.df
    df.to_csv(REPORTS / "chennai_grid.csv", index=False)
    report_eda = eda(df)

    # 2 ── spatial split -------------------------------------------------------
    groups = spatial_blocks(df, block_km=3.0)
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    tr_idx, te_idx = next(gss.split(df, groups=groups))
    tr, te = df.iloc[tr_idx], df.iloc[te_idx]
    g_tr = groups[tr_idx]
    assert not set(g_tr) & set(groups[te_idx]), "block leakage between train and test"
    Xtr, ytr = tr[FEATURES].to_numpy(), tr[TARGET].to_numpy()
    Xte, yte = te[FEATURES].to_numpy(), te[TARGET].to_numpy()

    # 3 ── model selection (CV on train only) --------------------------------
    candidates = {"Ridge (linear)": [{"alpha": a} for a in (0.1, 1.0, 10.0)],
                  "Random Forest": [{"n_estimators": 300, "min_samples_leaf": l, "max_features": m}
                                    for l in (1, 3) for m in (0.6, 1.0)],
                  "XGBoost": [{**XGB_PARAMS, "max_depth": d, "learning_rate": lr}
                              for d in (3, 5, 7) for lr in (0.035, 0.08)]}

    def make(name, params):
        if name == "Ridge (linear)":
            return make_pipeline(StandardScaler(), Ridge(**params))  # scaler fit inside each fold
        if name == "Random Forest":
            return RandomForestRegressor(**params, n_jobs=-1, random_state=SEED)
        return xgb.XGBRegressor(**params, random_state=SEED)

    cv = GroupKFold(n_splits=5)
    search = []
    for name, grid in candidates.items():
        for params in grid:
            fold_scores = []
            for a, b in cv.split(Xtr, ytr, g_tr):
                m = make(name, params).fit(Xtr[a], ytr[a])
                fold_scores.append(metrics(ytr[b], m.predict(Xtr[b])))
            search.append({
                "model": name,
                "params": {k: v for k, v in params.items() if k in ("alpha", "min_samples_leaf", "max_features", "max_depth", "learning_rate")},
                "cv_rmse_mean": float(np.mean([s["rmse"] for s in fold_scores])),
                "cv_rmse_std": float(np.std([s["rmse"] for s in fold_scores])),
                "cv_r2_mean": float(np.mean([s["r2"] for s in fold_scores])),
                "cv_mae_mean": float(np.mean([s["mae"] for s in fold_scores])),
            })
            print(f"  {name:15s} {search[-1]['params']}  CV RMSE {search[-1]['cv_rmse_mean']:.3f}")
    best_per_model = {}
    for s in search:
        if s["model"] not in best_per_model or s["cv_rmse_mean"] < best_per_model[s["model"]]["cv_rmse_mean"]:
            best_per_model[s["model"]] = s
    winner = min(best_per_model.values(), key=lambda s: s["cv_rmse_mean"])

    # 4 ── held-out test ------------------------------------------------------
    test = {}
    preds = {}
    for name, s in best_per_model.items():
        params = next(p for p in candidates[name] if all(p.get(k) == v for k, v in s["params"].items()))
        m = make(name, params).fit(Xtr, ytr)
        preds[name] = m.predict(Xte)
        test[name] = metrics(yte, preds[name])
        if name == winner["model"]:
            final = m
    best_pred = preds[winner["model"]]
    resid = best_pred - yte
    cat_true = category_of_lst(te, yte)
    cat_pred = category_of_lst(te, best_pred)
    confusion = [[int(((cat_true == i) & (cat_pred == j)).sum()) for j in range(4)] for i in range(4)]

    # 5 ── naive random split (leakage check) ------------------------------
    a, b = train_test_split(np.arange(len(df)), test_size=0.2, random_state=SEED)
    m_rand = make(winner["model"], next(p for p in candidates[winner["model"]] if all(p.get(k) == v for k, v in winner["params"].items())))
    m_rand.fit(df[FEATURES].to_numpy()[a], df[TARGET].to_numpy()[a])
    random_split = metrics(df[TARGET].to_numpy()[b], m_rand.predict(df[FEATURES].to_numpy()[b]))

    if isinstance(final, xgb.XGBRegressor):
        final.save_model(ARTIFACTS / "lst_xgboost.json")
        imp = dict(zip(FEATURES, map(float, final.feature_importances_)))
    else:
        imp = {}

    report = {
        "seed": SEED,
        "data_source": data.source,
        "data_info": {k: v for k, v in data.info.items() if k != "forward_model"},
        "environment": {"python": platform.python_version(), "sklearn": sklearn.__version__, "xgboost": xgb.__version__,
                        "numpy": np.__version__, "pandas": pd.__version__},
        "eda": report_eda,
        "split": {"strategy": "GroupShuffleSplit on 3 km spatial blocks", "blocks_total": int(len(set(groups))),
                  "train_cells": int(len(tr)), "test_cells": int(len(te)),
                  "train_blocks": int(len(set(g_tr))), "test_blocks": int(len(set(groups[te_idx]))),
                  "test_ids": [int(i) for i in te.id]},
        "cv": {"folds": 5, "strategy": "GroupKFold on training blocks", "search": search,
               "best_per_model": best_per_model, "winner": winner},
        "test": test,
        "test_residuals": {"mean": float(resid.mean()), "std": float(resid.std()),
                           "p95_abs": float(np.percentile(np.abs(resid), 95)),
                           "within_1C": float((np.abs(resid) <= 1).mean())},
        "test_scatter": [{"obs": float(o), "pred": float(p)} for o, p in zip(yte, best_pred)],
        "hvi_class_confusion": confusion,
        "hvi_class_accuracy": float(np.trace(np.array(confusion)) / max(1, np.sum(confusion))),
        "random_split": random_split,
        "gain_importance": imp,
        "seconds": time.time() - t0,
    }
    (REPORTS / "metrics.json").write_text(json.dumps(report, indent=2))
    print(f"\nWinner: {winner['model']} {winner['params']}")
    print(f"Held-out spatial test: {json.dumps(test[winner['model']], indent=None)}")
    print(f"Random split (optimistic): RMSE {random_split['rmse']:.3f}")
    print(f"Wrote {REPORTS/'metrics.json'} in {report['seconds']:.1f}s")


def category_of_lst(frame: pd.DataFrame, lst: np.ndarray) -> np.ndarray:
    """HVI class each test cell would get if its LST were `lst` (other HVI inputs fixed)."""
    twin = _twin()
    idx = frame.index.to_numpy()
    hvi_all, _ = twin.hvi(twin.df.lst_observed.to_numpy(), twin.df.green_access.to_numpy())
    full = twin.df.lst_observed.to_numpy().copy()
    full[idx] = lst
    hvi, _ = twin.hvi(full, twin.df.green_access.to_numpy())
    return category_of(hvi[idx])


_T = None


def _twin():
    global _T
    if _T is None:
        _T = Twin()
    return _T


if __name__ == "__main__":
    main()
