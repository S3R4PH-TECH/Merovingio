"""
Outbound HTTP client as a FastAPI dependency, instead of constructing an
httpx.AsyncClient inline inside route handlers.

This isn't just style: `httpx.AsyncClient` is also the class the test
suite's own ASGI-transport test client is built from (see
tests/conftest.py). Patching `httpx.AsyncClient.post` at the class level to
mock an outbound webhook call would also intercept the test client's own
in-process calls into the app — dependency injection lets tests override
just this one dependency instead.
"""
from __future__ import annotations

from typing import AsyncIterator

import httpx


async def get_http_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        yield client
