"""Merge rules for Lane A's secondary read. No network."""

from lane_a_refine import apply_secondary_read
from lanes import LaneResult


def _lane(score: float, confidence: float = 0.5) -> LaneResult:
    return LaneResult("A", "Local synthesis (trained)", score, confidence, ["base"])


def test_low_assist_confidence_is_noop():
    original = _lane(0.2)
    out = apply_secondary_read(original, True, 0.4)
    assert out.score == 0.2
    assert out.reasons == ["base"]


def test_synthetic_raises_score():
    out = apply_secondary_read(_lane(0.2), True, 0.9)
    assert out.score >= 0.82
    assert out.lane == "A"
    assert out.name == "Local synthesis (trained)"
    joined = " ".join(out.reasons).lower()
    assert "groq" not in joined
    assert "qwen" not in joined
    assert "llm" not in joined
    assert "api" not in joined


def test_real_lowers_false_positive():
    out = apply_secondary_read(_lane(0.96), False, 0.9)
    assert out.score <= 0.15


def test_real_does_not_move_already_low_score():
    out = apply_secondary_read(_lane(0.2), False, 0.9)
    assert out.score == 0.2
