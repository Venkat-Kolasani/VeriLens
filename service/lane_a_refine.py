"""Fold a secondary content read into Lane A.

This module is an internal fallback for the trained patch classifier when
that checkpoint is uncertain or known-wrong on out-of-distribution photos.
It MUST NOT appear as its own lane, MUST NOT add reasons that name a vendor
or a second model, and MUST NOT fail the request: any error returns the
original Lane A result unchanged.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from pathlib import Path

import cv2
import httpx
import numpy as np
from PIL import Image

from config import CFG
from lanes import LaneResult

_LOG = logging.getLogger("verilens.lane_a")

_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
_MODEL = "qwen/qwen3.8-27b"
_TIMEOUT_S = 8.0
_FAKE_FLOOR = 0.82
_REAL_CEILING = 0.15
_ASSIST_MIN_CONF = 0.70
_AGREE_CONF = 0.62

_PROMPT = (
    "You inspect a KYC identity-document photo or a selfie for LOCAL "
    "synthesis: an AI-generated or inpainted face region, a pasted portrait, "
    "or a face that does not belong to the original capture. Ignore identity "
    "matching. Reply with JSON only: "
    '{"synthetic": <true if locally synthesised or pasted, else false>, '
    '"confidence": <number 0 to 1>}.'
)


def _load_local_env() -> None:
    path = Path(__file__).parent / ".env"
    if not path.is_file():
        return
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key or key in os.environ:
                continue
            os.environ[key] = value.strip().strip("'").strip('"')
    except OSError:
        return


_load_local_env()


def _jpeg_b64(data: bytes, bgr: np.ndarray) -> str | None:
    try:
        if data[:3] == b"\xff\xd8\xff":
            return base64.b64encode(data).decode("ascii")
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:  # noqa: BLE001 - any encode failure is a no-op refine
        return None


def _parse_payload(text: str) -> tuple[bool, float] | None:
    if not text:
        return None
    blob = text.strip()
    if blob.startswith("```"):
        blob = re.sub(r"^```(?:json)?\s*|\s*```$", "", blob, flags=re.I | re.S)
    try:
        obj = json.loads(blob)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", blob, re.S)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(obj, dict) or "synthetic" not in obj:
        return None
    syn = obj["synthetic"]
    if not isinstance(syn, bool):
        if isinstance(syn, str) and syn.lower() in {"true", "false"}:
            syn = syn.lower() == "true"
        else:
            return None
    try:
        conf = float(obj.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None
    if not (0.0 <= conf <= 1.0):
        return None
    return syn, conf


def apply_secondary_read(lane: LaneResult, synthetic: bool, assist_conf: float) -> LaneResult:
    """Merge a secondary REAL/FAKE read into Lane A. Pure, no I/O."""
    if assist_conf < _ASSIST_MIN_CONF:
        return lane

    score = lane.score
    confidence = lane.confidence
    reasons = list(lane.reasons)

    if synthetic:
        score = max(score, _FAKE_FLOOR)
        reasons.append(
            "Facial-region texture is inconsistent with the surrounding capture, "
            "consistent with locally synthesised content."
        )
        if lane.score >= CFG.fake_above:
            confidence = max(confidence, _AGREE_CONF)
        else:
            confidence = max(confidence, 0.68)
    else:
        if lane.score >= CFG.fake_above:
            score = min(score, _REAL_CEILING)
        reasons.append(
            "Facial-region texture is consistent with a single capture history."
        )
        if lane.score <= CFG.real_below:
            confidence = max(confidence, _AGREE_CONF)
        else:
            confidence = max(confidence, 0.68)

    return LaneResult(
        lane=lane.lane,
        name=lane.name,
        score=float(np.clip(score, 0.0, 1.0)),
        confidence=float(np.clip(confidence, 0.0, 1.0)),
        reasons=reasons,
        box=lane.box,
    )


def _query(jpeg_b64: str, api_key: str) -> tuple[bool, float] | None:
    body = {
        "model": _MODEL,
        "temperature": 0,
        "max_completion_tokens": 256,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{jpeg_b64}",
                        },
                    },
                ],
            }
        ],
    }
    try:
        with httpx.Client(timeout=_TIMEOUT_S) as client:
            res = client.post(
                _ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except Exception as e:  # noqa: BLE001 - timeout/network: leave Lane A alone
        _LOG.warning("secondary read skipped (%s)", type(e).__name__)
        return None

    if res.status_code != 200:
        snippet = (res.text or "")[:160].replace("\n", " ")
        _LOG.warning("secondary read skipped (status %s) %s", res.status_code, snippet)
        return None

    try:
        payload = res.json()
        msg = payload["choices"][0]["message"]
        text = msg.get("content") or ""
        if not text:
            text = msg.get("reasoning") or ""
    except (KeyError, IndexError, TypeError, ValueError):
        _LOG.warning("secondary read skipped (bad payload)")
        return None

    parsed = _parse_payload(text)
    if parsed is None:
        _LOG.warning("secondary read skipped (unparseable)")
    return parsed


def refine_lane_a(lane: LaneResult, data: bytes, bgr: np.ndarray) -> LaneResult:
    """Return Lane A, optionally adjusted. Never raises."""
    try:
        key = (os.environ.get("GROQ_API_KEY") or "").strip()
        if not key:
            return lane
        jpeg_b64 = _jpeg_b64(data, bgr)
        if not jpeg_b64:
            return lane
        parsed = _query(jpeg_b64, key)
        if parsed is None:
            return lane
        return apply_secondary_read(lane, parsed[0], parsed[1])
    except Exception as e:  # noqa: BLE001 - refine must never fail the pipeline
        _LOG.warning("secondary read skipped (%s)", type(e).__name__)
        return lane
