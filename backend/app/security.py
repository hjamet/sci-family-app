import os
import time
import unicodedata
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from fastapi import Request, HTTPException, status
from passlib.context import CryptContext
from dotenv import load_dotenv

# Ensure environment variables are loaded
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)

SECRET_KEY = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY", "sci_family_super_secret_jwt_key_2026_hellenvilliers")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "525600"))

# Passlib Bcrypt Hashing Context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hashes plain password using passlib bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies plain password against bcrypt hashed password."""
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Fallback exact string match if plain stored (for smooth migration)
        return plain_password == hashed_password


def normalize_prenom(name: str) -> str:
    """Normalizes string by removing accents and converting to lowercase."""
    if not name:
        return ""
    nfkd_form = unicodedata.normalize('NFKD', name.strip())
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)]).lower()


# Try importing jose jwt, fallback to pyjwt
try:
    from jose import jwt, JWTError
except ImportError:
    import jwt
    class JWTError(Exception):
        pass


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and verifies a JWT access token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None


# --- Anti-Brute Force & Anti-DDoS Rate Limiter ---

class SlidingWindowRateLimiter:
    def __init__(self):
        # ip -> list of failed attempt timestamps
        self.failed_logins: Dict[str, List[float]] = {}
        # ip -> lockout until timestamp
        self.locked_until: Dict[str, float] = {}
        # ip -> list of general request timestamps
        self.general_requests: Dict[str, List[float]] = {}

    def get_client_ip(self, request: Request) -> str:
        """Extracts client IP from X-Forwarded-For header or request client address."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    def check_login_rate_limit(self, ip: str):
        """
        Anti-Brute Force rule:
        Max 5 failed login attempts per IP per 15 min -> 15 min lock out.
        """
        now = time.time()

        # Check active lockout
        lock_until = self.locked_until.get(ip, 0.0)
        if now < lock_until:
            remaining_seconds = int(lock_until - now)
            remaining_minutes = max(1, (remaining_seconds + 59) // 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"[Anti-Brute Force] Trop de tentatives de connexion échouées depuis l'adresse IP {ip}. "
                    f"Accès temporairement bloqué pendant encore {remaining_minutes} minute(s)."
                )
            )

        # Cleanup old failed attempts (> 15 minutes = 900 seconds)
        if ip in self.failed_logins:
            self.failed_logins[ip] = [ts for ts in self.failed_logins[ip] if now - ts < 900]

    def record_login_failure(self, ip: str):
        """Records a failed login attempt for the given IP address."""
        now = time.time()
        if ip not in self.failed_logins:
            self.failed_logins[ip] = []

        self.failed_logins[ip].append(now)
        # Filter to last 15 min
        self.failed_logins[ip] = [ts for ts in self.failed_logins[ip] if now - ts < 900]

        if len(self.failed_logins[ip]) >= 5:
            # Lock IP for 15 minutes (900 seconds)
            self.locked_until[ip] = now + 900
            print(f"[SECURITY ALERT] IP {ip} locked out for 15 min after 5 failed login attempts.")

    def record_login_success(self, ip: str):
        """Clears failed login counter and lockout on successful login."""
        self.failed_logins.pop(ip, None)
        self.locked_until.pop(ip, None)

    def check_general_rate_limit(self, ip: str):
        """
        Anti-DDoS rule:
        Max 100 requests per minute for general API requests.
        """
        now = time.time()
        if ip not in self.general_requests:
            self.general_requests[ip] = []

        # Filter timestamps to last 60 seconds
        self.general_requests[ip] = [ts for ts in self.general_requests[ip] if now - ts < 60]

        if len(self.general_requests[ip]) >= 100:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="[Anti-DDoS Rate Limit] Limite de débit dépassée (100 requêtes/min max). Veuillez rééditer votre requête."
            )

        self.general_requests[ip].append(now)


rate_limiter = SlidingWindowRateLimiter()
