"""Lane D — capture attestation: prove a photo came from the device's live
capture path, not just a client-asserted flag.

Flow: client GETs a nonce, signs `nonce_bytes + subject_sha256_bytes` with the
device's Ed25519 key (already generated/stored client-side, see lib/crypto.ts),
and sends the signature back with the image. We verify it here.
"""

from __future__ import annotations

import secrets
import time

import nacl.exceptions
import nacl.signing

NONCE_TTL_SECONDS = 120

# ponytail: plain dict, single-process only, resets on restart. Fine for a
# single-worker demo service; upgrade to Redis/DB-backed store if this ever
# runs behind multiple workers or needs to survive a restart.
_nonces: dict[str, float] = {}


def _sweep_expired() -> None:
    now = time.time()
    expired = [n for n, issued_at in _nonces.items() if now - issued_at > NONCE_TTL_SECONDS]
    for n in expired:
        del _nonces[n]


def issue_nonce() -> dict:
    _sweep_expired()
    nonce = secrets.token_hex(32)
    _nonces[nonce] = time.time()
    return {"nonce": nonce, "expires_in": NONCE_TTL_SECONDS}


def verify_attestation(nonce: str, signature: str, public_key: str, subject_sha256: str) -> tuple[bool, str]:
    """Validate the nonce (exists, unexpired) and the Ed25519 signature.

    Always consumes the nonce on the way out, success or failure — single-use
    means no retries, including after a bad signature.
    """
    issued_at = _nonces.pop(nonce, None)
    if issued_at is None:
        return False, "unknown or already-used nonce"
    if time.time() - issued_at > NONCE_TTL_SECONDS:
        return False, "expired nonce"

    try:
        message = bytes.fromhex(nonce) + bytes.fromhex(subject_sha256)
        verify_key = nacl.signing.VerifyKey(bytes.fromhex(public_key))
        verify_key.verify(message, bytes.fromhex(signature))
    except (nacl.exceptions.BadSignatureError, ValueError):
        return False, "bad signature"

    return True, "ok"
