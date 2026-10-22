import hashlib

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.settings import settings

KEY = "0123-4567-89ab-cdef"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    return TestClient(app)


def save(client, data: bytes, last_known_hash: str | None = None):
    form = {"lastKnownHash": last_known_hash} if last_known_hash else {}
    return client.post(f"/api/storage/{KEY}", files={"data": ("blob", data)}, data=form).json()


def test_load_missing(client):
    assert client.get(f"/api/storage/{KEY}").status_code == 404


def test_invalid_key(client):
    assert client.get("/api/storage/../../etc/passwd").status_code == 404
    assert client.get("/api/storage/not-a-key").status_code == 422


def test_save_and_load(client, tmp_path):
    response = save(client, b"v1")
    assert response == {"success": True, "oldHash": None, "newHash": hashlib.sha256(b"v1").hexdigest()}

    r = client.get(f"/api/storage/{KEY}")
    assert r.status_code == 200
    assert r.content == b"v1"
    assert r.headers["content-type"] == "application/octet-stream"

    etag = r.headers["etag"]
    assert client.get(f"/api/storage/{KEY}", headers={"If-None-Match": etag}).status_code == 304


def test_overwrite_requires_matching_hash(client, tmp_path):
    h1 = save(client, b"v1")["newHash"]

    assert save(client, b"v2") == {"error": "Invalid parameters: Hash missing."}
    assert save(client, b"v2", "wrong") == {"error": "Local database out of date. Please reload."}

    response = save(client, b"v2", h1)
    assert response["success"] and response["oldHash"] == h1
    assert client.get(f"/api/storage/{KEY}").content == b"v2"

    backups = list(tmp_path.glob(f"{KEY}__*.bin"))
    assert len(backups) == 1 and backups[0].read_bytes() == b"v1"


def test_save_empty(client):
    assert save(client, b"") == {"error": "Received empty data"}
