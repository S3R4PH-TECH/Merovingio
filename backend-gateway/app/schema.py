"""Pydantic request/response models for the Backend Gateway's public API."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

WorkspaceRole = Literal["owner", "admin", "billing"]
ProgramRole = Literal["admin", "operator", "viewer"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    """Signup payload.

    The password rules live here rather than in the router so a malformed
    request is rejected by FastAPI as a 422 before any database work happens.
    `max_length=72` is not arbitrary: bcrypt silently truncates past 72 bytes,
    so accepting more would let a user believe characters count when they do
    not.
    """

    email: EmailStr
    password: str = Field(min_length=12, max_length=72)
    name: str = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def _password_is_mixed(cls, value: str) -> str:
        if not any(char.isdigit() for char in value):
            raise ValueError("password must contain at least one digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("password must contain at least one letter")
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password must be at most 72 bytes")
        return value

    @field_validator("name")
    @classmethod
    def _name_is_not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if trimmed == "":
            raise ValueError("name must not be blank")
        return trimmed


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: UUID
    email: str
    name: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9][a-z0-9-]*$")


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class ProgramResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ProgramMemberCreate(BaseModel):
    user_id: UUID
    role: ProgramRole


class TargetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    root_domains: List[str] = Field(default_factory=list)
    cidrs: List[str] = Field(default_factory=list)
    out_of_scope: List[str] = Field(default_factory=list)


class TargetUpdate(BaseModel):
    name: Optional[str] = None
    root_domains: Optional[List[str]] = None
    cidrs: Optional[List[str]] = None
    out_of_scope: Optional[List[str]] = None


class TargetResponse(BaseModel):
    id: UUID
    program_id: UUID
    name: str
    root_domains: List[str]
    cidrs: List[str]
    out_of_scope: List[str]
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScopeCheckRequest(BaseModel):
    value: str


class ScopeCheckResponse(BaseModel):
    value: str
    in_scope: bool


# --- Workflows & Runs ---


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    git_path: str = Field(min_length=1, max_length=500)
    current_version: str = Field(min_length=1, max_length=50)
    production_webhook_url: str = Field(min_length=1, max_length=500)


class WorkflowResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    git_path: str
    current_version: str
    production_webhook_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class RunTriggerRequest(BaseModel):
    target_id: UUID
    params: dict = Field(default_factory=dict)


class RunAccepted(BaseModel):
    run_id: UUID
    status: str


class ToolExecutionJobResponse(BaseModel):
    id: UUID
    tool_name: str
    status: str
    leased_at: datetime
    finished_at: Optional[datetime]
    error: Optional[str]

    model_config = {"from_attributes": True}


class AssetResponse(BaseModel):
    id: UUID
    type: str
    value: str
    source_tool: str

    model_config = {"from_attributes": True}


class RunResponse(BaseModel):
    id: UUID
    workflow_definition_id: UUID
    target_id: UUID
    program_id: UUID
    n8n_execution_id: Optional[str]
    status: str
    started_at: datetime
    finished_at: Optional[datetime]
    params: dict
    tool_execution_jobs: List[ToolExecutionJobResponse] = Field(default_factory=list)
    assets: List[AssetResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class HostItemResponse(BaseModel):
    host: str
    asset_count: int
    tools: List[str] = Field(default_factory=list)


class RunHostsResponse(BaseModel):
    run_id: UUID
    total_hosts: int
    hosts: List[HostItemResponse] = Field(default_factory=list)


# --- /internal/* (n8n workflow nodes -> Gateway; never called by end users) ---


class ExecutionStartedRequest(BaseModel):
    run_id: UUID
    execution_id: str


class TesLeaseRequest(BaseModel):
    tool_name: str
    run_id: UUID
    params: dict = Field(default_factory=dict)
    resume_url: Optional[str] = None
    # The concrete hostname/IP the workflow intends to hand the TES. Optional
    # because not every tool is invoked against a single value (some consume
    # the whole allowed_domains set), but when it IS present the Gateway
    # validates it against the Target before issuing a lease — the scope check
    # ARCHITECTURE_AND_ROADMAP.md section 5, A.3 calls for.
    target_value: Optional[str] = None


class TesLeaseResponse(BaseModel):
    tool_execution_job_id: UUID
    tes_base_url: str
    internal_token: Optional[str]
    allowed_domains: List[str]


class ToolExecutionEnvelope(BaseModel):
    """Generalizes recon-runner's ReconResult (see
    ARCHITECTURE_AND_ROADMAP.md, section 5, C) — the common shape every TES
    callback must conform to, regardless of which tool produced it."""

    tool_execution_job_id: UUID
    run_id: UUID
    status: Literal["done", "error"]
    assets: List[dict] = Field(default_factory=list)
    findings: List[dict] = Field(default_factory=list)
    raw_output: dict = Field(default_factory=dict)
    error: Optional[str] = None
    resume_url: Optional[str] = None


class N8nCallbackRequest(BaseModel):
    run_id: UUID
    execution_id: Optional[str] = None
    status: Literal["success", "error"]


# --- TES Registry Admin ---


class TesRegistryCreate(BaseModel):
    tool_name: str = Field(min_length=1, max_length=100)
    base_url: str = Field(min_length=1, max_length=500)
    vault_secret_path: Optional[str] = None
    static_token: Optional[str] = None
    max_concurrency: int = Field(default=3, ge=1)
    timeout_seconds: int = Field(default=200, ge=1)


class TesRegistryUpdate(BaseModel):
    base_url: Optional[str] = None
    health_status: Optional[str] = None
    vault_secret_path: Optional[str] = None
    static_token: Optional[str] = None
    max_concurrency: Optional[int] = Field(default=None, ge=1)
    timeout_seconds: Optional[int] = Field(default=None, ge=1)


class TesRegistryResponse(BaseModel):
    """Read shape for tes_registry — deliberately NOT symmetric with the
    create/update shapes.

    `static_token` is the shared secret a TES accepts as its own auth header;
    it is writable via POST/PATCH but must never be echoed back on a read, or
    every caller allowed to list the registry would also be able to
    impersonate the n8n workers against every TES. Callers that need to know
    whether a token is configured get `has_static_token` instead of the value.
    """

    id: UUID
    tool_name: str
    base_url: str
    health_status: str
    vault_secret_path: Optional[str]
    has_static_token: bool
    max_concurrency: int
    timeout_seconds: int
    updated_at: datetime



# --- Read/list shapes for the dashboard ---


class FindingResponse(BaseModel):
    id: UUID
    program_id: UUID
    target_id: UUID
    run_id: UUID
    asset_id: Optional[UUID]
    severity: str
    title: str
    description: Optional[str]
    status: str
    cve_refs: List[str] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetListItem(BaseModel):
    """Deliberately separate from AssetResponse, which is nested inside
    RunResponse: that one is intentionally minimal because a single Run can
    carry thousands of assets. This one is for the standalone /assets list,
    where the caller needs to know which run and target an asset came from.
    """

    id: UUID
    program_id: UUID
    target_id: UUID
    run_id: UUID
    type: str
    value: str
    source_tool: str
    first_seen_at: datetime
    last_seen_at: datetime

    model_config = {"from_attributes": True}
