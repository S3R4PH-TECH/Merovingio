"""
MinIO client integration & snapshot manifest versioning module.
Implements s3://<bucket>/<timestamp>/ snapshot layout + latest.json manifest.
"""
from __future__ import annotations

import io
import json
import os
import datetime
import logging
from typing import Any, Dict, Optional

from minio import Minio

logger = logging.getLogger("data-sync-svc.minio")

_MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
_MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
_MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")


def get_minio_client() -> Minio:
    return Minio(
        _MINIO_ENDPOINT,
        access_key=_MINIO_ACCESS_KEY,
        secret_key=_MINIO_SECRET_KEY,
        secure=False,
    )


def ensure_bucket(bucket_name: str, client: Optional[Minio] = None) -> None:
    if client is None:
        client = get_minio_client()
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            logger.info(f"Created MinIO bucket {bucket_name}")
    except Exception as exc:
        logger.warning(f"Could not ensure MinIO bucket {bucket_name}: {exc}")


def upload_snapshot(
    bucket_name: str,
    dataset_name: str,
    content_bytes: bytes,
    content_type: str = "application/json",
    item_count: int = 0,
    client: Optional[Minio] = None,
) -> Dict[str, Any]:
    if client is None:
        client = get_minio_client()

    ensure_bucket(bucket_name, client)

    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    snapshot_path = f"{dataset_name}/{timestamp}.data"
    latest_path = f"{dataset_name}/latest.json"

    # Upload snapshot object
    client.put_object(
        bucket_name,
        snapshot_path,
        io.BytesIO(content_bytes),
        len(content_bytes),
        content_type=content_type,
    )

    manifest = {
        "dataset": dataset_name,
        "timestamp": timestamp,
        "snapshot_path": snapshot_path,
        "size_bytes": len(content_bytes),
        "count": item_count,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
    client.put_object(
        bucket_name,
        latest_path,
        io.BytesIO(manifest_bytes),
        len(manifest_bytes),
        content_type="application/json",
    )

    return manifest
