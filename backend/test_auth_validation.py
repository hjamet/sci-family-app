import os
import sys
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

from fastapi.testclient import TestClient
from app.main import app
from app.security import rate_limiter

client = TestClient(app)

def run_tests():
    print("==================================================")
    print("TEST SUITE: SCI FAMILIALE AUTHENTICATION & LOGIN")
    print("==================================================")

    # Clear rate limiter before tests to ensure hermetic execution
    rate_limiter.failed_logins.clear()
    rate_limiter.locked_until.clear()

    test_cases = [
        ("1. Login avec prenom: 'Henri'", {"prenom": "Henri", "password": "N8xK9mP2vQ5rT7wY"}),
        ("2. Login avec prenom: 'Henri Jamet'", {"prenom": "Henri Jamet", "password": "N8xK9mP2vQ5rT7wY"}),
        ("3. Login avec email: 'henri@sci-familiale.fr'", {"email": "henri@sci-familiale.fr", "password": "N8xK9mP2vQ5rT7wY"}),
        ("4. Login avec prenom: 'henri' (minuscules)", {"prenom": "henri", "password": "N8xK9mP2vQ5rT7wY"}),
        ("5. Login avec name: 'Henri Jamet'", {"name": "Henri Jamet", "password": "N8xK9mP2vQ5rT7wY"}),
        ("6. Login Marguerite Jamet", {"prenom": "Marguerite Jamet", "password": "B4vL7nP1wR9tY2mK"}),
        ("7. Login Hortense (email)", {"email": "hortense@sci-familiale.fr", "password": "Q2mK9vL5nR1wT7pY"}),
        ("8. Login Eugénie (accent)", {"prenom": "Eugénie", "password": "R9tY2mK9vL5nR1wP"}),
        ("9. Login Eugenie (sans accent)", {"prenom": "Eugenie", "password": "R9tY2mK9vL5nR1wP"}),
        ("10. Login Joséphine Jamet", {"prenom": "Joséphine Jamet", "password": "T7pY2mK9vL5nR1wQ"}),
        ("11. Login Maman (prenom: Maman)", {"prenom": "Maman", "password": "W1tY2mK9vL5nR1pT"}),
        ("12. Login Frédéric Jamet", {"prenom": "Frédéric Jamet", "password": "L5nR1wT7pY2mK9vQ"}),
    ]

    all_passed = True
    for title, payload in test_cases:
        res = client.post("/api/auth/login", json=payload)
        status_ok = res.status_code == 200
        print(f"\n--- {title} ---")
        print(f"Payload sent: {payload}")
        print(f"HTTP Status: {res.status_code} ({'OK' if status_ok else 'FAILED'})")
        if status_ok:
            data = res.json()
            print(f"Logged in user: {data.get('prenom')} ({data.get('name')}) - Role: {data.get('role')}")
            print(f"JWT Token generated: {data.get('access_token')[:35]}...")
        else:
            print(f"Error detail: {res.text}")
            all_passed = False

    print("\n==================================================")
    if all_passed:
        print("RESULT: ALL 12 AUTHENTICATION TESTS PASSED (100% HTTP 200 OK)")
    else:
        print("RESULT: SOME TESTS FAILED")
    print("==================================================")
    assert all_passed, "Authentication test failed!"

if __name__ == "__main__":
    run_tests()
