"""
Auth for data-indexer's index/search surface.

This service holds every discovered asset and finding across every Program on
the platform, and it sits on control_net alongside the n8n workers — which
execute node graphs authored by users. Leaving it unauthenticated made the
Gateway's whole Program-level tenancy boundary bypassable by anything that
could open a socket on that network.

Mirrors backend-gateway/app/internal_auth.py: same shared-header-secret
pattern, same "read the env var on every call rather than caching it at
import time" rationale (lets tests swap it via monkeypatch without a module
reload). Same known limitation, too — a single static shared secret is the
MVP stand-in for the per-service token the roadmap calls for.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException


def _expected_token() -> Optional[str]:
    return os.getenv("DATA_INDEXER_TOKEN")


async def require_internal_token(x_internal_token: Optional[str] = Header(default=None)) -> None:
    expected = _expected_token()
    if not expected or not x_internal_token or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
