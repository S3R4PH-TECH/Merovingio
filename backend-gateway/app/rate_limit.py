"""
Minimal in-process rate limiter for the login endpoint.

Scope of what this is and isn't: it caps credential-guessing against a single
Gateway process. It is **not** shared state — run two Gateway replicas and each
keeps its own counters, so the effective limit multiplies by the replica count.
That is acceptable while the platform is a single-container local deployment
(see CONTEXT.md), and it is the same reasoning that keeps secrets in .env
instead of Vault: solve it when there is a concrete trigger.

The graduation path is the Redis token-bucket the roadmap already specifies for
TES rate limiting (ARCHITECTURE_AND_ROADMAP.md, section 4, A.5) — Redis is
already in the stack for n8n's queue, so this becomes a shared limiter without
new infrastructure.
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Deque, Dict, Tuple

_MAX_ATTEMPTS = 10
_WINDOW_SECONDS = 300

_attempts: Dict[Tuple[str, str], Deque[float]] = {}
_lock = Lock()


def check_and_record(client_ip: str, identifier: str) -> bool:
    """Records an attempt and reports whether it is allowed.

    Keyed on (ip, identifier) rather than ip alone so that one shared NAT
    egress can't lock out every user behind it, and rather than identifier
    alone so an attacker can't lock a known account out from anywhere.
    """
    key = (client_ip, identifier.lower())
    now = time.monotonic()
    cutoff = now - _WINDOW_SECONDS

    with _lock:
        window = _attempts.setdefault(key, deque())
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= _MAX_ATTEMPTS:
            return False
        window.append(now)
        return True


def clear(client_ip: str, identifier: str) -> None:
    """Drops the counter after a successful login, so a user who mistyped a
    few times isn't still throttled once they get it right."""
    with _lock:
        _attempts.pop((client_ip, identifier.lower()), None)


def reset_all() -> None:
    """Test-only: counters are process-global and would otherwise leak between
    tests in the same run."""
    with _lock:
        _attempts.clear()
