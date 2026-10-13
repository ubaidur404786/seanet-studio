"""
End-to-end tests of the API with the real ONNX model.

TestClient (from FastAPI/Starlette) calls the app directly in memory, so no server has to run.
The LLM key is forced to empty, so /explain must fall back to the template - the tests never call
a paid or rate-limited service.
"""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(Settings(llm_api_key=""))) as c:   # "with" runs the start-up code
        yield c


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and "webtraffic-seanet" in r["models"]
    assert r["llm"]["check"] == "off (no LLM key)"


def test_models_card(client):
    card = client.get("/api/models").json()[0]
    assert card["id"] == "webtraffic-seanet"          # "order": 1 in its manifest, so it comes first
    assert card["input_length"] == 1008
    assert len(card["classes"]) == 10
    assert "timestep_attribution" in card["outputs"]


def test_every_domain_is_complete(client):
    """Each shipped domain: a known template, a full test check that matches training, real samples."""
    cards = client.get("/api/models").json()
    assert len(cards) == 4
    for card in cards:
        assert card["domain"]["template"] in {"monitoring", "clinical", "industrial", "energy"}
        check = card["test_check"]
        assert check is not None and check["matches_training"], card["id"]
        assert len(check["per_class"]) == len(card["classes"])
        assert card["runtime"]["input_shape"] == [1, 1, card["input_length"]]
        samples = client.get(f"/api/models/{card['id']}/samples").json()
        assert samples
        full = client.get(f"/api/models/{card['id']}/samples/{samples[0]['id']}").json()
        r = client.post(f"/api/models/{card['id']}/predict", json={"values": full["values"]}).json()
        assert r["mode"] == "exact" and len(r["windows"]) == 1


def test_demo_samples_are_mostly_right(client):
    """The shipped test series should mostly be classified correctly (model test acc is 0.94)."""
    samples = client.get("/api/models/webtraffic-seanet/samples").json()
    correct = 0
    for s in samples:
        full = client.get(f"/api/models/webtraffic-seanet/samples/{s['id']}").json()
        r = client.post("/api/models/webtraffic-seanet/predict", json={"values": full["values"]}).json()
        assert r["mode"] == "exact" and len(r["windows"]) == 1
        w = r["windows"][0]
        correct += w["prediction"]["class_id"] == s["true_class"]
        assert abs(sum(p["probability"] for p in w["probabilities"]) - 1) < 1e-3
        assert len(w["attribution"]["values"]) == 1008
        assert [st["key"] for st in r["steps"]] == ["read", "prepare", "model", "run", "results"]
    assert correct / len(samples) >= 0.8


def test_other_lengths_are_resampled(client):
    values = [float(i % 50) for i in range(500)]
    r = client.post("/api/models/webtraffic-seanet/predict", json={"values": values}).json()
    assert r["mode"] == "resampled" and len(r["windows"][0]["attribution"]["values"]) == 500


def test_long_series_is_cut_into_windows(client):
    values = [float(i % 144) for i in range(2500)]          # 2500 = 1008 + 1008 + 484 left over
    r = client.post("/api/models/webtraffic-seanet/predict", json={"values": values}).json()
    assert r["mode"] == "windows"
    assert [(w["start"], w["end"]) for w in r["windows"]] == [(0, 1007), (1008, 2015), (1492, 2499)]
    for w in r["windows"]:
        assert len(w["attribution"]["values"]) == 1008
        for reg in w["regions"]:                             # regions are in full-series positions
            assert w["start"] <= reg["start"] <= reg["end"] <= w["end"]


def test_example_files(client):
    card = client.get("/api/models").json()[0]
    assert card["examples"]
    for e in card["examples"]:
        r = client.get(f"/api/models/webtraffic-seanet/examples/{e['name']}")
        assert r.status_code == 200 and len(r.text.splitlines()) == e["points"] + 1   # + header
    assert client.get("/api/models/webtraffic-seanet/examples/..%2Fmanifest.json").status_code == 404


def test_bad_input_is_422(client):
    r = client.post("/api/models/webtraffic-seanet/predict", json={"values": [1, 2, 3]})
    assert r.status_code == 422


def test_unknown_model_is_404(client):
    assert client.post("/api/models/nope/predict", json={"values": [1.0] * 100}).status_code == 404


def test_explain_falls_back_to_template(client):
    sid = client.get("/api/models/webtraffic-seanet/samples").json()[0]["id"]
    values = client.get(f"/api/models/webtraffic-seanet/samples/{sid}").json()["values"]
    r = client.post("/api/models/webtraffic-seanet/explain", json={"values": values}).json()
    assert r["explanation"]["source"] == "template"
    assert "What the model found" in r["explanation"]["text"]
    assert r["step"]["key"] == "explain"
    # the overall accuracy is kept away from the LLM - it once turned it into a made-up count
    assert "model_test_accuracy" not in r["explanation"]["facts"]


def test_weak_class_gets_a_warning(client):
    """ECG test-3782 is predicted 'Early beat (PVC)', a class the model finds only 32 of 86 times."""
    values = client.get("/api/models/ecg5000-seanet/samples/test-3782").json()["values"]
    r = client.post("/api/models/ecg5000-seanet/explain", json={"values": values}).json()
    assert r["result"]["windows"][0]["prediction"]["key"] == "pvc"
    assert r["explanation"]["facts"]["found_on_test_data"] == {"found": 32, "of": 86, "share": 0.3721}
    assert "Be careful" in r["explanation"]["text"]
    # a strong class (normal beats, 99.9%) gets no such fact
    values = client.get("/api/models/ecg5000-seanet/samples/test-1342").json()["values"]
    r = client.post("/api/models/ecg5000-seanet/explain", json={"values": values}).json()
    assert "found_on_test_data" not in r["explanation"]["facts"]


def test_explain_a_window(client):
    values = [float(i % 144) for i in range(2500)]
    r = client.post("/api/models/webtraffic-seanet/explain", json={"values": values, "window": 2}).json()
    assert "window 3 of 3" in r["explanation"]["text"]
    bad = client.post("/api/models/webtraffic-seanet/explain", json={"values": values, "window": 9})
    assert bad.status_code == 422
