"""
Test single-origin SPA serving from FastAPI backend.
"""
from fastapi.testclient import TestClient
from main import app


def test_spa_root_served():
    client = TestClient(app)
    res = client.get("/")
    assert res.status_code == 200
    assert "MoneyCouncil" in res.text
    assert '<div id="root"></div>' in res.text


def test_spa_fallback_route():
    client = TestClient(app)
    res = client.get("/budgets")
    assert res.status_code == 200
    assert '<div id="root"></div>' in res.text
