"""Lane E: face match between an ID document photo and a selfie.

The only lane that needs model weights, so it is the only optional one.
insightface + onnxruntime are imported lazily and their absence degrades to
(None, reason) instead of raising -- the base service ships on free CPU
hosting with requirements.txt alone and must keep working there.

Honesty rule: never invent a similarity. judge.py maps None -> identity=None
and a mid-band value -> INDETERMINATE, so abstaining is already the correct
downstream behaviour. A guessed number would silently become an identity call.
"""

from __future__ import annotations

import os

import numpy as np

# insightface writes/reads models under <root>/models/<name>. Gitignored.
_WEIGHTS_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")

# An embedding off a 30px thumbnail is noise wearing a 512-dim costume.
_MIN_FACE_PX = 40

_model = None  # module-level cache; see _get_model


def _get_model():
    """Build the ArcFace pipeline on first use, then reuse it.

    Not at import time: constructing it costs seconds (and a first-run
    download), which every service start would pay even when nobody calls
    Lane E. Raises ImportError if the optional deps are missing.
    """
    global _model
    if _model is None:
        from insightface.app import FaceAnalysis  # noqa: PLC0415 - optional dep

        os.makedirs(_WEIGHTS_ROOT, exist_ok=True)
        m = FaceAnalysis(
            name="buffalo_l",
            root=_WEIGHTS_ROOT,
            providers=["CPUExecutionProvider"],
        )
        m.prepare(ctx_id=-1, det_size=(640, 640))  # ctx_id=-1 => CPU
        _model = m
    return _model


def _bbox_px(face) -> float:
    x1, y1, x2, y2 = face.bbox
    return float(min(x2 - x1, y2 - y1))


def face_similarity(
    id_bgr: np.ndarray, selfie_bgr: np.ndarray
) -> tuple[float | None, list[str]]:
    """Cosine similarity between the ID-photo face and the selfie face.

    Returns (similarity, reasons), or (None, reasons) when no honest
    similarity exists: deps missing, no face in either image, more than one
    face in the selfie, or a face too small to embed.
    """
    reasons: list[str] = []

    try:
        model = _get_model()
    except ImportError:
        return None, ["Face matching unavailable: insightface not installed."]
    except Exception as e:  # noqa: BLE001 - model download/init failure is not a verdict
        return None, [f"Face matching unavailable: could not load face model ({e})."]

    id_faces = model.get(id_bgr)
    selfie_faces = model.get(selfie_bgr)
    reasons.append(
        f"Detected {len(id_faces)} face(s) in the ID photo and "
        f"{len(selfie_faces)} in the selfie."
    )

    if not id_faces:
        reasons.append("No face detected in the ID photo.")
        return None, reasons
    if not selfie_faces:
        reasons.append("No face detected in the selfie.")
        return None, reasons
    if len(selfie_faces) > 1:
        reasons.append(
            f"{len(selfie_faces)} faces in the selfie; cannot tell which one is "
            "the applicant."
        )
        return None, reasons

    # ID documents routinely carry a small ghost portrait alongside the main
    # one, so take the largest face rather than abstaining on count.
    id_face = max(id_faces, key=_bbox_px)
    selfie_face = selfie_faces[0]

    for face, where in ((id_face, "ID photo"), (selfie_face, "selfie")):
        px = _bbox_px(face)
        if px < _MIN_FACE_PX:
            reasons.append(
                f"Face in the {where} is only {px:.0f}px across; below "
                f"{_MIN_FACE_PX}px an embedding is unreliable."
            )
            return None, reasons

    a = np.asarray(id_face.normed_embedding, dtype=np.float64)
    b = np.asarray(selfie_face.normed_embedding, dtype=np.float64)
    sim = float(np.clip(np.dot(a, b), -1.0, 1.0))  # already unit-norm
    reasons.append(f"Cosine similarity between the two face embeddings: {sim:.3f}.")
    return sim, reasons


if __name__ == "__main__":
    print(face_similarity(np.zeros((256, 256, 3), np.uint8), np.zeros((256, 256, 3), np.uint8)))
