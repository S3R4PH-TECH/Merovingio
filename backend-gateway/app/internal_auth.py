"""
Auth for the /internal/* surface — called by n8n workflow nodes, never by
end users. Same header-shared-secret pattern recon-runner already uses for
its own X-Internal-Token (see services/recon-runner/app/main.py), not the
per-user JWT scheme in app/auth.py.

This is a known PoC-level simplification: ARCHITECTURE_AND_ROADMAP.md
(section 5, C) calls for mTLS or a token issued per-TES via Vault. A single
static shared secret is the honest MVP-vertical-slice version of that —
tracked as the same "graduate to Vault" item already called out for
recon-runner's own token (roadmap section 7, C.2).
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException


def _expected_token() -> Optional[str]:
    # Read fresh on every call, same rationale as recon-runner's
    # _expected_token(): lets tests set/change it via monkeypatch/env.
    return os.getenv("GATEWAY_INTERNAL_TOKEN")


async def require_internal_token(x_internal_token: Optional[str] = Header(default=None)) -> None:
    expected = _expected_token()
    if not expected or not x_internal_token or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
