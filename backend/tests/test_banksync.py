import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.settings import settings
from banksync import BankSyncError, sparkasse

REQUEST = {
    "bankType": "sparkasse",
    "bankUrl": "https://example.com",
    "loginName": " user ",
    "loginPassword": "secret",
    "maxTransactionAge": 30,
    "accountIndices": [0, 2],
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "debug", True)
    return TestClient(app)


def test_sparkasse_success(client, monkeypatch):
    calls = []

    def fake_export(base_url, user_id, user_pass, account_index, date_from, date_to):
        logging.getLogger("banksync.sparkasse").info("exporting %d", account_index)
        calls.append((user_id, account_index, (date_to - date_from).days))
        return None if account_index == 2 else "a;b\n1;2\n"

    monkeypatch.setattr(sparkasse, "export_transactions", fake_export)
    response = client.post("/api/banksync", json=REQUEST).json()

    assert calls == [("user", 0, 30), ("user", 2, 30)]
    assert response["success"] is True
    assert [r["data"] for r in response["results"]] == ["a;b\n1;2\n", None]
    assert "[INFO] exporting 2" in response["results"][0]["log"]


def test_sparkasse_error(client, monkeypatch):
    def fake_export(*args):
        raise BankSyncError("Login error: nope")

    monkeypatch.setattr(sparkasse, "export_transactions", fake_export)
    response = client.post("/api/banksync", json=REQUEST).json()
    assert response["error"] == "Login error: nope"


def test_dkb_rejects_multiple_accounts(client):
    response = client.post("/api/banksync", json={**REQUEST, "bankType": "dkb"}).json()
    assert "not supported" in response["error"]


@pytest.mark.parametrize("override", [
    {"bankType": "unknown"},
    {"loginName": "  "},
    {"maxTransactionAge": 0},
    {"accountIndices": []},
    {"accountIndices": [-1]},
])
def test_invalid_request(client, override):
    assert client.post("/api/banksync", json={**REQUEST, **override}).status_code == 422
