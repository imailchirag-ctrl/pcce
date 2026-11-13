"""Password hashing and opaque session tokens.

No third-party dependency is required: PBKDF2-HMAC-SHA256 is provided by the
Python standard library and session tokens are random 256-bit URL-safe strings
stored as SHA-256 digests, so a database leak never exposes a usable token.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 320_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algorithm, iterations, salt, expected = stored.split("$", 3)
    except ValueError:
        return False
    if algorithm != _ALGORITHM:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)
    )
    return hmac.compare_digest(digest.hex(), expected)


def new_session_token() -> str:
    return secrets.token_urlsafe(48)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
