"""
data-indexer — Microservice for indexing & searching assets/findings in OpenSearch.
"""
from __future__ import annotations

import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.internal_auth import require_internal_token
from app.opensearch_client import ASSETS_ALIAS, FINDINGS_ALIAS, get_opensearch_client, init_indices
from app.schema import AssetIndexRequest, FindingIndexRequest, SearchHit, SearchQueryRequest, SearchResponse

app = FastAPI(title="data-indexer")

# Every index/search route sits behind the shared internal token. /healthz
# stays open on `app` itself because Docker's healthcheck calls it with no
# credentials (see docker-compose.yml).
router = APIRouter(dependencies=[Depends(require_internal_token)])


@app.on_event("startup")
def startup_event():
    try:
        init_indices()
    except Exception:
        pass


@app.get("/healthz")
async def healthz() -> JSONResponse:
    try:
        client = get_opensearch_client()
        cluster_info = client.info()
        return JSONResponse(status_code=200, content={"status": "ok", "cluster_name": cluster_info.get("cluster_name")})
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(exc)})


@router.post("/index/asset", status_code=201)
async def index_asset(payload: AssetIndexRequest) -> Dict[str, Any]:
    try:
        client = get_opensearch_client()
        doc = payload.model_dump()
        doc["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        res = client.index(index=ASSETS_ALIAS, id=payload.id, body=doc, refresh=True)
        return {"status": "indexed", "id": payload.id, "result": res.get("result")}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"indexing_failed: {exc}")


@router.post("/index/finding", status_code=201)
async def index_finding(payload: FindingIndexRequest) -> Dict[str, Any]:
    try:
        client = get_opensearch_client()
        doc = payload.model_dump()
        doc["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        res = client.index(index=FINDINGS_ALIAS, id=payload.id, body=doc, refresh=True)
        return {"status": "indexed", "id": payload.id, "result": res.get("result")}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"indexing_failed: {exc}")


@router.post("/search/assets", response_model=SearchResponse)
async def search_assets(payload: SearchQueryRequest) -> SearchResponse:
    try:
        client = get_opensearch_client()
        must_clauses: List[Dict[str, Any]] = []

        if payload.query:
            must_clauses.append({"match": {"value": payload.query}})
        if payload.program_id:
            must_clauses.append({"term": {"program_id": payload.program_id}})
        if payload.type:
            must_clauses.append({"term": {"type": payload.type}})

        query_body = {
            "from": payload.offset,
            "size": payload.limit,
            "query": {"bool": {"must": must_clauses}} if must_clauses else {"match_all": {}},
        }

        res = client.search(index=ASSETS_ALIAS, body=query_body)
        total = res["hits"]["total"]["value"]
        hits = [
            SearchHit(id=hit["_id"], score=hit["_score"] or 1.0, source=hit["_source"])
            for hit in res["hits"]["hits"]
        ]
        return SearchResponse(total=total, hits=hits)
    except Exception as exc:
        # Fallback empty search if index is not ready
        return SearchResponse(total=0, hits=[])


@router.post("/search/findings", response_model=SearchResponse)
async def search_findings(payload: SearchQueryRequest) -> SearchResponse:
    try:
        client = get_opensearch_client()
        must_clauses: List[Dict[str, Any]] = []

        if payload.query:
            must_clauses.append({"multi_match": {"query": payload.query, "fields": ["title", "description"]}})
        if payload.program_id:
            must_clauses.append({"term": {"program_id": payload.program_id}})
        if payload.severity:
            must_clauses.append({"term": {"severity": payload.severity}})

        query_body = {
            "from": payload.offset,
            "size": payload.limit,
            "query": {"bool": {"must": must_clauses}} if must_clauses else {"match_all": {}},
        }

        res = client.search(index=FINDINGS_ALIAS, body=query_body)
        total = res["hits"]["total"]["value"]
        hits = [
            SearchHit(id=hit["_id"], score=hit["_score"] or 1.0, source=hit["_source"])
            for hit in res["hits"]["hits"]
        ]
        return SearchResponse(total=total, hits=hits)
    except Exception as exc:
        return SearchResponse(total=0, hits=[])


app.include_router(router)
