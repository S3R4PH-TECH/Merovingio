"""
Seeds the initial TES registry entries in the platform Postgres database.
Covers: theharvester, pd-recon, pd-vuln, net-scan, web-utils, pd-scan, pd-crawler, fuzz-svc.

Usage:
    PLATFORM_DATABASE_URL=postgresql+asyncpg://... python3 scripts/seed_tes.py
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select  # noqa: E402

from app.db import get_session_factory  # noqa: E402
from app.models import TesRegistry  # noqa: E402


async def seed() -> None:
    initial_tes = [
        {
            "tool_name": "theharvester",
            "base_url": "http://recon-runner:8000",
            "static_token": os.getenv("RECON_RUNNER_TOKEN", "dev-only-internal-token-change-me"),
            "max_concurrency": 3,
            "timeout_seconds": 200,
        },
        {
            "tool_name": "pd-recon",
            "base_url": "http://pd-recon:8000",
            "static_token": os.getenv("PD_RECON_TOKEN", "secret-tok"),
            "max_concurrency": 5,
            "timeout_seconds": 300,
        },
        {
            "tool_name": "pd-vuln",
            "base_url": "http://pd-vuln:8000",
            "static_token": os.getenv("PD_VULN_TOKEN", "secret-tok"),
            "max_concurrency": 2,
            "timeout_seconds": 300,
        },
        {
            "tool_name": "net-scan",
            "base_url": "http://net-scan:8000",
            "static_token": os.getenv("NET_SCAN_TOKEN", "secret-tok"),
            "max_concurrency": 3,
            "timeout_seconds": 300,
        },
        {
            "tool_name": "web-utils",
            "base_url": "http://web-utils:8000",
            "static_token": os.getenv("WEB_UTILS_TOKEN", "secret-tok"),
            "max_concurrency": 3,
            "timeout_seconds": 300,
        },
        # ── New TES: Nuclei scanner ─────────────────────────────────────────────
        {
            "tool_name": "pd-scan",
            "base_url": "http://pd-scan:8000",
            "static_token": os.getenv("PD_SCAN_TOKEN", "secret-tok"),
            "max_concurrency": 2,
            "timeout_seconds": 600,
        },
        # ── New TES: Web crawlers (Katana + GoSpider) ─────────────────────────
        {
            "tool_name": "pd-crawler",
            "base_url": "http://pd-crawler:8000",
            "static_token": os.getenv("PD_CRAWLER_TOKEN", "secret-tok"),
            "max_concurrency": 3,
            "timeout_seconds": 600,
        },
        # ── New TES: Web fuzzer (ffuf + dirsearch) ──────────────────────────
        {
            "tool_name": "fuzz-svc",
            "base_url": "http://fuzz-svc:8000",
            "static_token": os.getenv("FUZZ_SVC_TOKEN", "secret-tok"),
            "max_concurrency": 2,
            "timeout_seconds": 900,
        },
    ]

    async with get_session_factory()() as db:
        for entry in initial_tes:
            result = await db.execute(select(TesRegistry).where(TesRegistry.tool_name == entry["tool_name"]))
            existing = result.scalar_one_or_none()
            if existing is not None:
                print(f"TES {entry['tool_name']} already registered (id={existing.id})")
                continue

            tes = TesRegistry(
                tool_name=entry["tool_name"],
                base_url=entry["base_url"],
                static_token=entry["static_token"],
                max_concurrency=entry["max_concurrency"],
                timeout_seconds=entry["timeout_seconds"],
                health_status="healthy",
            )
            db.add(tes)
            await db.commit()
            await db.refresh(tes)
            print(f"Registered TES {entry['tool_name']} (id={tes.id}) -> {entry['base_url']}")


if __name__ == "__main__":
    asyncio.run(seed())
