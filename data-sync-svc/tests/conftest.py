"""
Fixtures for data-sync-svc tests.
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Mock upload_snapshot to prevent needing live MinIO during unit tests
    from app import main
    monkeypatch.setattr(
        main,
        "upload_snapshot",
        lambda bucket_name, dataset_name, content_bytes, item_count=0: {
            "dataset": dataset_name,
            "timestamp": "20260805_120000",
            "snapshot_path": f"{dataset_name}/20260805_120000.data",
            "size_bytes": len(content_bytes),
            "count": item_count,
            "updated_at": "2026-08-05T12:00:00Z",
        },
    )

    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
