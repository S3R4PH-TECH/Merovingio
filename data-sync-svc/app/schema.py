"""
Pydantic schemas for data-sync-svc.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SyncResponse(BaseModel):
    dataset: str
    status: str
    snapshot_version: str
    count: int
    latest_manifest: Dict[str, Any]


class CveRecord(BaseModel):
    cve_id: str
    cvss_v3: Optional[float] = None
    cwe: List[str] = Field(default_factory=list)
    summary: str
    references: List[str] = Field(default_factory=list)
    poc_found: bool = False
    source_provenance: List[str] = Field(default_factory=list)
    published_at: str
    updated_at: str
