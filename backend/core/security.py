from cryptography.fernet import Fernet
from core.config import settings
import base64
import hashlib
from jose import jwt
from datetime import datetime, timedelta, timezone
import bcrypt

# JWT Configuration
ALGORITHM = "HS256"


def _get_fernet_key() -> bytes:
    # Ensure the key is exactly 32 url-safe base64-encoded bytes
    # We hash the SECRET_KEY to ensure it's the right length
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(key)


_fernet = Fernet(_get_fernet_key())


def encrypt_api_key(raw_key: str) -> str:
    return _fernet.encrypt(raw_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    return _fernet.decrypt(encrypted_key.encode()).decode()


def mask_api_key(raw_key: str) -> str:
    """Return masked version for display: sk-or-v1-••••••••2f3a"""
    if len(raw_key) <= 8:
        return "••••••••"
    return raw_key[:8] + "•" * (len(raw_key) - 12) + raw_key[-4:]


# Password Hashing and Verification using native bcrypt
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    # Generate salt and hash the password
    # Note: Bcrypt has a built-in max limit of 72 bytes for the input password.
    # To support longer passwords securely, we can pre-hash the password using SHA-256 before bcrypt,
    # but for standard requirements and to match the standard bcrypt limit, we truncate or hash.
    # Standard bcrypt checkpw handles up to 72 bytes, which is plenty for user passwords.
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


# JWT Access Token generation
def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=60 * 24 * 7
        )  # 7 days default
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
