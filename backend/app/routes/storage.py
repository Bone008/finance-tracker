"""Storage of client databases as opaque binary blobs, identified by a data key.

Clients must send the hash of the version they last loaded when overwriting an
existing database, which prevents accidentally overwriting changes made by
other clients. Every overwritten version is kept as a backup.
"""

import hashlib
import shutil
import threading
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Form, Header, HTTPException, UploadFile
from fastapi import Path as PathParam
from fastapi.responses import Response

from app.settings import settings

router = APIRouter(prefix="/storage", tags=["storage"])

DataKey = Annotated[str, PathParam(pattern=r"^[0-9a-f]{4}(-[0-9a-f]{4}){3}$")]

# Makes checking the last known hash and replacing the file atomic.
_write_lock = threading.Lock()


def _data_file(key: str) -> Path:
    return settings.storage_dir / f"{key}.bin"


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@router.get("/{key}", response_class=Response)
def load(
    key: DataKey, if_none_match: Annotated[str | None, Header()] = None
) -> Response:
    try:
        data = _data_file(key).read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=404)

    etag = f'"{_hash(data)}"'
    if if_none_match == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(
        data, media_type="application/octet-stream", headers={"ETag": etag}
    )


@router.post("/{key}")
def save(
    key: DataKey,
    data: UploadFile,
    last_known_hash: Annotated[str | None, Form(alias="lastKnownHash")] = None,
) -> dict:
    new_data = data.file.read()
    if not new_data:
        return {"error": "Received empty data"}

    path = _data_file(key)
    with _write_lock:
        current_hash = None
        if path.exists():
            # Validate the sent hash.
            if last_known_hash is None:
                return {"error": "Invalid parameters: Hash missing."}
            current_hash = _hash(path.read_bytes())
            if last_known_hash != current_hash:
                return {"error": "Local database out of date. Please reload."}

            # Create backup of old file.
            old_version = datetime.fromtimestamp(path.stat().st_mtime)
            backup_name = f"{key}__{old_version:%Y-%m-%d-%H-%M-%S}.bin"
            shutil.copy2(path, path.with_name(backup_name))

        # Write to a temporary file first, so readers never see partial data.
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_bytes(new_data)
        tmp_path.replace(path)

    return {
        "success": True,
        "oldHash": current_hash,
        "newHash": _hash(new_data),
    }
