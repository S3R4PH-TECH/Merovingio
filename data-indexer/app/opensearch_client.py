"""
OpenSearch client integration & index initialization module.
"""
from __future__ import annotations

import os
import logging
from typing import Any, Dict, List, Optional

from opensearchpy import OpenSearch, exceptions

logger = logging.getLogger("data-indexer.opensearch")

_OPENSEARCH_HOST = os.getenv("OPENSEARCH_HOST", "opensearch")
_OPENSEARCH_PORT = int(os.getenv("OPENSEARCH_PORT", "9200"))

ASSETS_INDEX = "assets_v1"
ASSETS_ALIAS = "assets"
FINDINGS_INDEX = "findings_v1"
FINDINGS_ALIAS = "findings"


def get_opensearch_client() -> OpenSearch:
    return OpenSearch(
        hosts=[{"host": _OPENSEARCH_HOST, "port": _OPENSEARCH_PORT}],
        http_compress=True,
        use_ssl=False,
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )


def init_indices(client: Optional[OpenSearch] = None) -> None:
    if client is None:
        client = get_opensearch_client()

    # Asset Index Mapping
    asset_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "program_id": {"type": "keyword"},
                "target_id": {"type": "keyword"},
                "run_id": {"type": "keyword"},
                "type": {"type": "keyword"},
                "value": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "source_tool": {"type": "keyword"},
                "timestamp": {"type": "date"},
            }
        }
    }

    # Finding Index Mapping
    finding_mapping = {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "program_id": {"type": "keyword"},
                "target_id": {"type": "keyword"},
                "run_id": {"type": "keyword"},
                "severity": {"type": "keyword"},
                "title": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "description": {"type": "text"},
                "status": {"type": "keyword"},
                "cve_refs": {"type": "keyword"},
                "timestamp": {"type": "date"},
            }
        }
    }

    for index_name, alias_name, mapping in [
        (ASSETS_INDEX, ASSETS_ALIAS, asset_mapping),
        (FINDINGS_INDEX, FINDINGS_ALIAS, finding_mapping),
    ]:
        try:
            if not client.indices.exists(index=index_name):
                client.indices.create(index=index_name, body=mapping)
                client.indices.put_alias(index=index_name, name=alias_name)
                logger.info(f"Created index {index_name} with alias {alias_name}")
        except Exception as exc:
            logger.warning(f"Could not initialize OpenSearch index {index_name}: {exc}")
