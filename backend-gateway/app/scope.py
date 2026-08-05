"""
Scope resolution for the Backend Gateway — the multi-Target evolution of
Pentesters-Team's scope_guard.

Design decision (ARCHITECTURE_AND_ROADMAP.md, section 10): the *algorithm*
in scope_guard.is_in_scope() (exact/suffix match) is reused verbatim, never
reimplemented, to avoid Gateway and TES ever diverging on what "in scope"
means — exactly why services/recon-runner/app/scope.py already imports it
via sys.path instead of duplicating it. This module follows the identical
bridging pattern.

What's new here (does not exist in scope_guard.py, which has no CIDR
concept): CIDR matching for a Target's `cidrs` list, and Postgres-backed
resolution of a Target's full allow-list instead of a single global
scope.json. scope_guard.py itself is not modified by this change.
"""
from __future__ import annotations

import ipaddress
import os
import sys
from typing import Iterable, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Target

_APP_DIR = os.path.dirname(os.path.abspath(__file__))  # .../backend-gateway/app
_GATEWAY_DIR = os.path.dirname(_APP_DIR)  # .../Workspace/Merovingio/backend-gateway
# .../Workspace/Merovingio/backend-gateway -> .../Workspace/Merovingio
#   -> .../Workspace -> .../S3R4PH TECH (repo root, sibling of Pentesters-Team)
_REPO_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(_GATEWAY_DIR)))
_PENTESTERS_TEAM_DIR = os.path.join(_REPO_ROOT_DIR, "Pentesters-Team")
_MCP_SERVERS_DIR = os.environ.get("MCP_SERVERS_DIR") or os.path.join(_PENTESTERS_TEAM_DIR, "mcp_servers")

if _MCP_SERVERS_DIR not in sys.path:
    sys.path.insert(0, _MCP_SERVERS_DIR)

import scope_guard  # noqa: E402  (sys.path must be adjusted before this import)


def domain_in_scope(hostname: str, root_domains: Iterable[str]) -> bool:
    """Delegates to scope_guard.is_in_scope() — same suffix-match algorithm
    used by pentest_mcp.py and recon-runner, applied to a Target's
    root_domains instead of the global scope.json."""
    return scope_guard.is_in_scope(hostname, list(root_domains))


def ip_in_scope(ip: str, cidrs: Iterable[str]) -> bool:
    """New logic (scope_guard has no CIDR concept). Returns False on any
    unparseable input rather than raising, matching is_in_scope()'s
    fail-closed behavior on empty/invalid hostnames."""
    try:
        addr = ipaddress.ip_address((ip or "").strip())
    except ValueError:
        return False
    for raw_cidr in cidrs:
        try:
            network = ipaddress.ip_network((raw_cidr or "").strip(), strict=False)
        except ValueError:
            continue
        if addr in network:
            return True
    return False


async def resolve_target_scope(db: AsyncSession, target_id) -> Target | None:
    """Loads a Target (excluding soft-deleted ones) for scope checks."""
    result = await db.execute(
        select(Target).where(Target.id == target_id, Target.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


def value_in_target_scope(target: Target, value: str) -> bool:
    """True if `value` (a hostname or IP) is authorized by `target`, and not
    explicitly excluded via out_of_scope. out_of_scope is checked with the
    same suffix-match semantics as root_domains so excluding "internal.example.com"
    also excludes "*.internal.example.com"."""
    value = (value or "").strip()
    if not value:
        return False

    if domain_in_scope(value, target.out_of_scope):
        return False

    if domain_in_scope(value, target.root_domains):
        return True
    return ip_in_scope(value, target.cidrs)


def allowed_domains_snapshot(targets: List[Target]) -> List[str]:
    """Flattens root_domains across a set of Targets — used to hand a TES
    lease its `allowed_domains` subset (see Backend section A.3)."""
    domains: List[str] = []
    for target in targets:
        domains.extend(target.root_domains)
    return domains
