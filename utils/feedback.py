"""Append-only feedback writer that pushes JSONL rows to an HF Dataset."""

from __future__ import annotations

import io
import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from huggingface_hub import HfApi

_MAX_TEXT = 1000


@dataclass
class FeedbackEntry:
    rating: str  # "up" | "down"
    comment: str
    email: str | None
    model: str
    mutation: str | None
    hla: list[str] = field(default_factory=list)
    last_user_msg: str = ""
    last_assistant_msg: str = ""

    def to_row(self) -> dict:
        d = asdict(self)
        d["ts"] = datetime.now(timezone.utc).isoformat()
        d["last_user_msg"] = (d["last_user_msg"] or "")[:_MAX_TEXT]
        d["last_assistant_msg"] = (d["last_assistant_msg"] or "")[:_MAX_TEXT]
        d["comment"] = (d["comment"] or "")[:_MAX_TEXT]
        return d


def submit_feedback(
    entry: FeedbackEntry,
    repo_id: str,
    token: str,
) -> None:
    """Upload one JSONL line to repo_id as a new file (immutable, append-safe)."""
    row = entry.to_row()
    payload = (json.dumps(row) + "\n").encode()
    fname = f"feedback_{int(time.time())}_{uuid.uuid4().hex[:8]}.jsonl"

    api = HfApi(token=token)
    api.upload_file(
        path_or_fileobj=io.BytesIO(payload),
        path_in_repo=fname,
        repo_id=repo_id,
        repo_type="dataset",
    )
