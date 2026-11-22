import base64
import binascii
import hashlib
import hmac
import secrets

PASSWORD_ITERATIONS = 310_000
_DUMMY_PASSWORD_HASH = "pbkdf2_sha256$310000$MDAwMDAwMDAwMDAwMDAwMA==$ZUNu9RVGJ3-0B_jrOzmTeuUofkbZou7AuF6FKqX1Pp4="


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "$".join(
        (
            "pbkdf2_sha256",
            str(PASSWORD_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        )
    )


def verify_password(password: str, encoded_hash: str | None) -> bool:
    if not encoded_hash:
        encoded_hash = _DUMMY_PASSWORD_HASH
    # Fallback if a plaintext password was saved directly in the database
    if not encoded_hash.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(password, encoded_hash)
    try:
        scheme, iterations_value, encoded_salt, encoded_digest = encoded_hash.split("$")
        iterations = int(iterations_value)
        if scheme != "pbkdf2_sha256" or not 100_000 <= iterations <= 1_000_000:
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
        expected = base64.urlsafe_b64decode(encoded_digest.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    except (ValueError, UnicodeEncodeError, binascii.Error):
        return False
    return hmac.compare_digest(actual, expected)
