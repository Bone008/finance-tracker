import importlib

import pytest
from fastapi.testclient import TestClient

import app.main
from app.settings import settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "main.abc.js").write_text("js")
    monkeypatch.setattr(settings, "frontend_dir", tmp_path)
    # The frontend is mounted at import time, so reload with patched settings.
    yield TestClient(importlib.reload(app.main).app)
    monkeypatch.undo()
    importlib.reload(app.main)


def test_serves_static_files(client):
    r = client.get("/main.abc.js")
    assert r.text == "js"
    assert "no-cache" not in r.headers.get("cache-control", "")


@pytest.mark.parametrize("path", ["/", "/money/transactions"])
def test_falls_back_to_index(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert r.text == "<html>app</html>"
    assert r.headers["cache-control"] == "no-cache"


def test_api_takes_precedence(client):
    assert client.get("/api/storage/0123-4567-89ab-cdef").status_code == 404
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/api/openapi.json").status_code == 200
