from __future__ import annotations

import sys
import asyncio
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class LocalClient:
    """Synchronous test facade over ASGITransport; it never opens a network port."""

    def __init__(self, app: object) -> None:
        self.app = app

    def request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(send())

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("DELETE", url, **kwargs)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LocalClient:
    from fastapi import Header

    from app import db
    from app.core.config import get_settings
    from app.deps import current_user
    from app.main import app

    settings = get_settings()
    isolated_data = tmp_path / "data"
    monkeypatch.setattr(settings, "data_dir", isolated_data)
    monkeypatch.setattr(settings, "database_path", isolated_data / "test.sqlite3")
    monkeypatch.setattr(settings, "model_cache_dir", tmp_path / "models")
    monkeypatch.setattr(db, "_initialized", False)

    async def local_current_user(authorization: str | None = Header(default=None)) -> dict:
        # Keep the auth lookup real while avoiding the environment's broken sync
        # dependency threadpool under Python 3.14 in ASGI-only tests.
        return current_user(authorization)

    monkeypatch.setitem(app.dependency_overrides, current_user, local_current_user)

    db.init_db()
    return LocalClient(app)


@pytest.fixture
def create_account(client: LocalClient) -> Callable[..., dict[str, object]]:
    def create(
        *,
        email: str = "candidate@example.test",
        name: str = "Test Candidate",
        password: str = "local-test-password-123",
        role: str = "candidate",
        company: str | None = None,
    ) -> dict[str, object]:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": name,
                "email": email,
                "password": password,
                "role": role,
                "company": company,
            },
        )
        assert response.status_code == 200, response.text
        result = response.json()
        return {"token": result["token"], "user": result["user"], "password": password}

    return create


@pytest.fixture
def auth_headers() -> Callable[[dict[str, object]], dict[str, str]]:
    def headers(account: dict[str, object]) -> dict[str, str]:
        return {"Authorization": f"Bearer {account['token']}"}

    return headers
