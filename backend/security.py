"""Security utilities for ZeroFlash Blur license keys and webhooks."""

from __future__ import annotations

import hashlib
import hmac
import secrets

# Unambiguous uppercase alphanumeric set (excludes 0/O, 1/I/L)
_KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def generate_license_key(prefix: str = "ZF-PRO") -> str:
    """Generate a readable, cryptographically random license key."""
    groups = [
        "".join(secrets.choice(_KEY_ALPHABET) for _ in range(4))
        for _ in range(3)
    ]
    return f"{prefix}-{'-'.join(groups)}"


def verify_lemonsqueezy_signature(
    raw_body: bytes, signature_hex: str, secret: str
) -> bool:
    """Verify Lemon Squeezy X-Signature HMAC-SHA256 webhook digest."""
    if not secret or not signature_hex:
        return False
    expected = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_hex.strip().lower())


def verify_bearer_token(auth_header: str, expected_secret: str) -> bool:
    """Constant-time check for Authorization: Bearer <token>."""
    if not expected_secret or not auth_header:
        return False
    prefix = "Bearer "
    if not auth_header.startswith(prefix):
        return False
    provided = auth_header[len(prefix) :].strip()
    return hmac.compare_digest(provided, expected_secret)
