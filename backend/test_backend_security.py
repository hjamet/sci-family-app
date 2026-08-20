from dotenv import load_dotenv
import os
import sys
from fastapi.testclient import TestClient

# Add app to path
sys.path.insert(0, os.path.dirname(__file__))

from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed import seed_database
from app.security import rate_limiter

client = TestClient(app)

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

def test_full_security():
    print("--- 1. Testing Database Seeding & User Passwords ---")
    with SessionLocal() as db:
        seed_database(db)
    print("Database seeded successfully.")

    members = [
        ("Henri", os.getenv("USER_HENRI_PASS")),
        ("Marguerite", os.getenv("USER_MARGUERITE_PASS")),
        ("Hortense", os.getenv("USER_HORTENSE_PASS")),
        ("Joséphine", os.getenv("USER_JOSEPHINE_PASS")),
        ("Eugénie", os.getenv("USER_EUGENIE_PASS")),
        ("Frédéric", os.getenv("USER_FREDERIC_PASS")),
        ("Maman", os.getenv("USER_MAMAN_PASS")),
    ]

    print("\n--- 2. Testing Login for all 7 Members ---")
    tokens = {}
    for prenom, pwd in members:
        res = client.post("/api/auth/login", json={"prenom": prenom, "password": pwd})
        assert res.status_code == 200, f"Login failed for {prenom}: {res.json()}"
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["prenom"] == prenom or (prenom == "Maman" and data["prenom"] == "Maman")
        tokens[prenom] = data["access_token"]
        print(f"[OK] Login OK for {prenom}: token length = {len(data['access_token'])}")

    print("\n--- 3. Testing GET /api/auth/me Endpoint & Role Verification ---")
    for prenom, token in tokens.items():
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, f"Auth me failed for {prenom}: {res.json()}"
        data = res.json()
        assert data["name"] is not None
        if prenom == "Maman":
            assert data["role"] == "Membre Associé", f"Expected 'Membre Associé' for Élisabeth, got {data['role']}"
        print(f"[OK] /api/auth/me OK for {prenom} (Role: {data['role']})")

    print("\n--- 3b. Testing Whitespace Trimming & Case/Accent Insensitive Login ---")
    # Henri with extra whitespace
    res_henri_ws = client.post("/api/auth/login", json={"prenom": "  Henri  ", "password": f" {os.getenv('USER_HENRI_PASS')}\n"})
    assert res_henri_ws.status_code == 200, f"Whitespace login failed for Henri: {res_henri_ws.json()}"
    print("[OK] Trimmed login success for Henri with padded whitespace")

    # Case-insensitive / lowercase
    res_henri_lc = client.post("/api/auth/login", json={"prenom": "henri", "password": os.getenv("USER_HENRI_PASS")})
    assert res_henri_lc.status_code == 200, f"Lowercase login failed for henri: {res_henri_lc.json()}"
    print("[OK] Lowercase prenom login success for 'henri'")

    # Accent-insensitive (josephine / elisabeth)
    res_jos_ai = client.post("/api/auth/login", json={"prenom": "josephine", "password": os.getenv("USER_JOSEPHINE_PASS")})
    assert res_jos_ai.status_code == 200, f"Accent-insensitive login failed for josephine: {res_jos_ai.json()}"
    print("[OK] Accent-insensitive prenom login success for 'josephine'")

    res_eli_ai = client.post("/api/auth/login", json={"prenom": "elisabeth", "password": os.getenv("USER_MAMAN_PASS")})
    assert res_eli_ai.status_code == 200, f"Accent-insensitive login failed for elisabeth: {res_eli_ai.json()}"
    assert res_eli_ai.json()["role"] == "Membre Associé"
    print("[OK] Alias/Accent-insensitive login success for 'elisabeth' (Role: Membre Associé)")

    print("\n--- 4. Testing Security Headers ---")
    res = client.get("/api/health")
    assert res.headers.get("x-frame-options") == "SAMEORIGIN"
    assert res.headers.get("x-content-type-options") == "nosniff"
    print("[OK] Security Headers present (X-Frame-Options, X-Content-Type-Options).")

    print("\n--- 5. Testing Anti-Brute Force (5 Failed Logins -> Lockout) ---")
    test_ip = "192.168.1.99"
    rate_limiter.failed_logins.pop(test_ip, None)
    rate_limiter.locked_until.pop(test_ip, None)

    for i in range(5):
        res = client.post(
            "/api/auth/login",
            json={"prenom": "Henri", "password": "wrong_password"},
            headers={"X-Forwarded-For": test_ip}
        )
        print(f"Attempt {i+1}: status = {res.status_code}, detail = {res.json().get('detail')}")

    # 6th attempt should be blocked with HTTP 429
    res_blocked = client.post(
        "/api/auth/login",
        json={"prenom": "Henri", "password": os.getenv("USER_HENRI_PASS")},
        headers={"X-Forwarded-For": test_ip}
    )
    assert res_blocked.status_code == 429, f"Expected 429, got {res_blocked.status_code}"
    print(f"[OK] Anti-Brute Force 429 Lockout verified: {res_blocked.json()['detail']}")

    print("\n--- 6. Testing Explicit ViCare Read-Only Guardrail (HTTP 403) ---")
    res_mode = client.post("/api/heating/mode", json={"mode": "dhw"})
    assert res_mode.status_code == 403
    print(f"[OK] ViCare Read-Only 403 verified: {res_mode.json()['detail']}")

    print("\nALL SECURITY TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_full_security()
