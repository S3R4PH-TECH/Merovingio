"""
Pydantic request/response schemas for data-indexer.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AssetIndexRequest(BaseModel):
    id: str
    program_id: str
    target_id: str
    run_id: str
    type: str
    value: str
    source_tool: str
    asset_metadata: Dict[str, Any] = Field(default_factory=dict)


class FindingIndexRequest(BaseModel):
    id: str
    program_id: str
    target_id: str
    run_id: str
    severity: str
    title: str
    description: Optional[str] = None
    evidence: Dict[str, Any] = Field(default_factory=dict)
    status: str = "open"
    cve_refs: List[str] = Field(default_factory=list)


class SearchQueryRequest(BaseModel):
    query: Optional[str] = None
    program_id: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class SearchHit(BaseModel):
    id: str
    score: float
    source: Dict[str, Any]


class SearchResponse(BaseModel):
    total: int
    hits: List[SearchHit]
