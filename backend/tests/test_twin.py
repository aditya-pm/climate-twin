"""Smoke & invariant tests:  .venv/bin/python -m pytest -q"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from climatetwin.model import FEATURES
from climatetwin.data import load_dataset


@pytest.fixture(scope="module")
def client():
    import app
    return TestClient(app.app)


def test_dataset_is_stable_and_clean():
    a, b = load_dataset().df, load_dataset().df
    assert a[FEATURES + ["lst_observed"]].equals(b[FEATURES + ["lst_observed"]])
    assert not a[FEATURES + ["lst_observed"]].isna().any().any()
    assert a.lst_observed.between(15, 65).all()
    assert len(a) > 1500


def test_fractions_sum_to_one():
    d = load_dataset().df
    total = d.vegetation + d.impervious + d.water + d.bare
    assert np.allclose(total, 1.0, atol=1e-5)


def test_model_beats_baseline(client):
    m = client.get("/api/meta").json()["metrics"]["models"]
    assert m["XGBoost"]["r2"] > 0.6
    assert m["XGBoost"]["rmse"] < m["Ridge (linear)"]["rmse"]


def test_no_intervention_means_no_change(client):
    r = client.post("/api/simulate", json={}).json()
    assert max(abs(x) for x in r["delta"]) == 0


def test_interventions_only_cool_and_stay_in_scope(client):
    r = client.post("/api/simulate", json={"trees": 20, "cool_roofs": 60, "scope": "localities",
                                           "localities": ["T. Nagar"]}).json()
    grid = client.get("/api/grid").json()
    deltas = np.array(r["delta"])
    outside = np.array([loc != "T. Nagar" for loc in grid["locality"]])
    assert (deltas <= 0).all()
    assert (deltas[outside] == 0).all()
    assert r["summary"]["mean_delta_targeted"] < -0.5


def test_more_canopy_cools_more(client):
    lo = client.post("/api/simulate", json={"trees": 5}).json()["summary"]["mean_delta_city"]
    hi = client.post("/api/simulate", json={"trees": 25}).json()["summary"]["mean_delta_city"]
    assert hi < lo


def test_cell_explanation_adds_up(client):
    c = client.get("/api/cell/100").json()
    ex = c["explanation"]
    total = ex["base"] + sum(x["shap"] for x in ex["contributions"])
    assert abs(total - ex["prediction"]) < 0.05
