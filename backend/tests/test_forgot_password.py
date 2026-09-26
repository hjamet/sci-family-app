import os
import sys
import unittest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app, get_db
from app.models import Base, Member, User
from app.security import verify_password
from app.services.email_service import send_password_reset_email

client = TestClient(app)

class TestForgotPassword(unittest.TestCase):

    @patch("app.main.send_password_reset_email")
    def test_forgot_password_success_prenom(self, mock_send_email):
        mock_send_email.return_value = {"id": "mock_msg_123", "status": "sent"}

        resp = client.post("/api/auth/forgot-password", json={"prenom": "Henri"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["message"], "Un nouveau mot de passe a été envoyé par e-mail.")

        # Verify email call
        self.assertTrue(mock_send_email.called)
        call_args = mock_send_email.call_args[1]
        self.assertEqual(call_args["to_email"], "hellenvillierssci@gmail.com")
        self.assertEqual(call_args["member_name"], "Henri")
        temp_pw = call_args["new_temporary_password"]
        
        # Verify password strength (16 characters, uppercase, lowercase, digit)
        self.assertEqual(len(temp_pw), 16)
        self.assertTrue(any(c.isupper() for c in temp_pw))
        self.assertTrue(any(c.islower() for c in temp_pw))
        self.assertTrue(any(c.isdigit() for c in temp_pw))

        # Verify that login with the new temporary password succeeds!
        login_resp = client.post("/api/auth/login", json={"prenom": "Henri", "password": temp_pw})
        self.assertEqual(login_resp.status_code, 200)
        login_data = login_resp.json()
        self.assertIn("access_token", login_data)

    @patch("app.main.send_password_reset_email")
    def test_forgot_password_accent_insensitive(self, mock_send_email):
        mock_send_email.return_value = {"id": "mock_msg_456"}

        # "eugenie" without accent should find "Eugénie"
        resp = client.post("/api/auth/forgot-password", json={"prenom": "eugenie"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(mock_send_email.called)
        call_args = mock_send_email.call_args[1]
        self.assertEqual(call_args["to_email"], "eugenie_jamet@yahoo.fr")

    @patch("app.main.send_password_reset_email")
    def test_forgot_password_by_member_id(self, mock_send_email):
        mock_send_email.return_value = {"id": "mock_msg_789"}

        resp = client.post("/api/auth/forgot-password", json={"member_id": 1})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(mock_send_email.called)

    def test_forgot_password_unknown_member(self):
        resp = client.post("/api/auth/forgot-password", json={"prenom": "InconnuXYZ"})
        self.assertEqual(resp.status_code, 404)
        self.assertIn("Membre introuvable", resp.json()["detail"])

    @patch("app.services.email_service.send_email")
    def test_email_template_rendering(self, mock_send_email):
        # 1. Under circuit breaker (DISABLE_ALL_EMAILS = True)
        res_blocked = send_password_reset_email(
            to_email="hellenvillierssci@gmail.com",
            member_name="Henri",
            new_temporary_password="Abc123Xyz456Def7"
        )
        self.assertEqual(res_blocked, {"status": "disabled", "id": "mock_emergency_off"})
        self.assertFalse(mock_send_email.called)

        # 2. When circuit breaker is temporarily lifted for template validation
        with patch("app.services.email_service.DISABLE_ALL_EMAILS", False), \
             patch.dict(os.environ, {"DISABLE_ALL_EMAILS": "false"}):
            mock_send_email.return_value = {"id": "mock_template_123"}
            res = send_password_reset_email(
                to_email="hellenvillierssci@gmail.com",
                member_name="Henri",
                new_temporary_password="Abc123Xyz456Def7"
            )

            self.assertTrue(mock_send_email.called)
            call_args = mock_send_email.call_args[1]
            self.assertEqual(call_args["to_email"], "hellenvillierssci@gmail.com")
            self.assertEqual(call_args["subject"], "[SCI Hellenvilliers] Réinitialisation de votre mot de passe")
            
            html = call_args["html_content"]
            # Brand colors and styling
            self.assertIn("#1e3a2f", html)
            self.assertIn("#b89047", html)
            self.assertIn("#faf9f6", html)
            self.assertIn("DOMAINE D'HELLENVILLIERS", html)
            self.assertIn("SCI Familiale", html)
            # Cartouche styling
            self.assertIn("font-family: monospace", html)
            self.assertIn("letter-spacing: 2px", html)
            self.assertIn("font-size: 18px", html)
            self.assertIn("border: 1px dashed #b89047", html)

        # Password itself
        self.assertIn("Abc123Xyz456Def7", html)
        # Recommendation
        self.assertIn("Paramètres", html)

if __name__ == "__main__":
    unittest.main()
