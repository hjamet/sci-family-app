import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import BankAccount, BankTransaction, BankAuthSession
from app.services.banking import enable_banking_service

client = TestClient(app, follow_redirects=False)


@pytest.fixture
def db_session():
    """Fournit une session de test propre isolée."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestBankingCallbackAndSync:
    """Suite de tests unitaires pour la gestion défensive du callback bancaire Enable Banking."""

    def test_extract_account_id_str(self):
        """Vérifie l'extraction robuste de l'identifiant compte sous toutes ses formes."""
        extractor = enable_banking_service._extract_account_id_str
        
        # Cas 1 : String pure (UUID Enable Banking)
        assert extractor("f7af9598-108e-4c33-846d-b829a015c149") == "f7af9598-108e-4c33-846d-b829a015c149"
        
        # Cas 2 : Dict avec uid
        assert extractor({"uid": "uuid-1234", "name": "Swan"}) == "uuid-1234"
        
        # Cas 3 : Dict avec id
        assert extractor({"id": "id-5678"}) == "id-5678"
        
        # Cas 4 : Dict avec account_id en string
        assert extractor({"account_id": "FR7616945000000000000000000"}) == "FR7616945000000000000000000"
        
        # Cas 5 : Dict avec account_id en sous-dict
        assert extractor({"account_id": {"iban": "FR7616945000000000000000000"}}) == "FR7616945000000000000000000"
        
        # Cas 6 : Valeurs nulles ou invalides
        assert extractor(None) is None
        assert extractor("") is None
        assert extractor([]) is None

    def test_sync_database_with_list_of_strings(self, db_session):
        """Vérifie que la synchronisation d'une session avec comptes sous forme de strings (cas Swan réel) ne lève pas AttributeError."""
        test_session_id = "test_sess_str_accounts_123"
        test_acc_uid = "f7af9598-108e-4c33-846d-b829a015c149"

        # Nettoyage préalable pour idempotence des tests
        db_session.query(BankTransaction).filter(BankTransaction.transaction_id.like("tx_swan_test_%")).delete()
        db_session.query(BankAccount).filter(BankAccount.account_id == test_acc_uid).delete()
        db_session.commit()

        # Création ou réinitialisation d'une session autorisée
        sess = db_session.query(BankAuthSession).filter(BankAuthSession.session_id == test_session_id).first()
        if not sess:
            sess = BankAuthSession(
                session_id=test_session_id,
                aspsp_name="Swan",
                status="AUTHORIZED",
                accounts_data=json.dumps([test_acc_uid])
            )
            db_session.add(sess)
            db_session.commit()
        else:
            sess.status = "AUTHORIZED"
            sess.accounts_data = json.dumps([test_acc_uid])
            db_session.commit()

        # Mock des appels d'API Enable Banking
        mock_accounts_api = []
        mock_session_detail = {
            "session_id": test_session_id,
            "status": "AUTHORIZED",
            "accounts": [test_acc_uid]  # LIST OF STRINGS
        }
        mock_account_details = {
            "account_id": {"iban": "FR7616945000000000000000000"},
            "name": "Compte Principal Swan SCI",
            "currency": "EUR",
            "uid": test_acc_uid
        }
        mock_balances = [
            {
                "balance_amount": {"amount": "14520.50", "currency": "EUR"},
                "balance_type": "interimAvailable"
            }
        ]
        mock_transactions = [
            {
                "transaction_id": "tx_swan_test_001",
                "booking_date": "2026-09-26",
                "transaction_amount": {"amount": "500.00", "currency": "EUR"},
                "credit_debit_indicator": "CRDT",
                "remittance_information": ["Virement Apport Henri CCA"],
                "creditor": {"name": "SCI Domaine d'Hellenvilliers"}
            }
        ]

        with patch.object(enable_banking_service, "get_accounts", return_value=mock_accounts_api), \
             patch.object(enable_banking_service, "get_session", return_value=mock_session_detail), \
             patch.object(enable_banking_service, "get_account_details", return_value=mock_account_details), \
             patch.object(enable_banking_service, "get_account_balances", return_value=mock_balances), \
             patch.object(enable_banking_service, "get_account_transactions", return_value=mock_transactions):

            # Exécution de la synchronisation - Doit réussir SANS exception AttributeError
            result = enable_banking_service.sync_database(db=db_session, session_id=test_session_id)

            assert result["success"] is True
            assert result["accounts_synced"] >= 1
            assert result["transactions_synced"] >= 1

            # Vérification de l'insertion en base
            acc_in_db = db_session.query(BankAccount).filter(BankAccount.account_id == test_acc_uid).first()
            assert acc_in_db is not None
            assert acc_in_db.balance == 14520.50
            assert acc_in_db.iban == "FR7616945000000000000000000"

            tx_in_db = db_session.query(BankTransaction).filter(BankTransaction.transaction_id == "tx_swan_test_001").first()
            assert tx_in_db is not None
            assert tx_in_db.amount == 500.00
            assert tx_in_db.category == "Apport Compte Courant d'Associé (CCA)"

    def test_sync_database_with_list_of_dicts(self, db_session):
        """Vérifie que la synchronisation d'une session avec comptes sous forme de dictionnaires fonctionne parfaitement."""
        test_session_id = "test_sess_dict_accounts_456"
        test_acc_uid = "acc_uid_dict_789"

        # Nettoyage préalable
        db_session.query(BankAccount).filter(BankAccount.account_id == test_acc_uid).delete()
        db_session.commit()

        sess = db_session.query(BankAuthSession).filter(BankAuthSession.session_id == test_session_id).first()
        if not sess:
            sess = BankAuthSession(
                session_id=test_session_id,
                aspsp_name="Swan",
                status="AUTHORIZED",
                accounts_data=json.dumps([{"uid": test_acc_uid, "name": "Compte Swan Dict"}])
            )
            db_session.add(sess)
            db_session.commit()

        mock_accounts_api = [
            {
                "uid": test_acc_uid,
                "account_id": {"iban": "FR7616945111111111111111111"},
                "name": "Compte Dict Swan",
                "currency": "EUR"
            }
        ]
        mock_balances = [
            {
                "balance_amount": {"amount": "23400.00", "currency": "EUR"},
                "balance_type": "interimAvailable"
            }
        ]
        mock_transactions = []

        with patch.object(enable_banking_service, "get_accounts", return_value=mock_accounts_api), \
             patch.object(enable_banking_service, "get_account_balances", return_value=mock_balances), \
             patch.object(enable_banking_service, "get_account_transactions", return_value=mock_transactions):

            result = enable_banking_service.sync_database(db=db_session, session_id=test_session_id)
            assert result["success"] is True
            assert result["accounts_synced"] >= 1

            acc_in_db = db_session.query(BankAccount).filter(BankAccount.account_id == test_acc_uid).first()
            assert acc_in_db is not None
            assert acc_in_db.balance == 23400.00

    def test_callback_endpoint_success_with_strings(self, db_session):
        """Vérifie que l'endpoint GET /api/banking/callback redirige vers /admin?banking=success avec des comptes strings."""
        mock_session_res = {
            "session_id": "sess_swan_valid_999",
            "accounts": ["f7af9598-108e-4c33-846d-b829a015c149"]  # STRINGS
        }

        with patch.object(enable_banking_service, "authorize_session", return_value=mock_session_res), \
             patch.object(enable_banking_service, "sync_database", return_value={"success": True, "accounts_synced": 1, "transactions_synced": 0}):

            response = client.get("/api/banking/callback?code=mock_swan_code_123&state=test_state")
            assert response.status_code == 307 or response.status_code == 302
            assert response.headers["location"] == "/admin?banking=success"

    def test_callback_endpoint_error_redirect(self):
        """Vérifie que les erreurs dans le callback bancaire sont correctement URL-encodées et redirigées vers ?banking=error."""
        response = client.get("/api/banking/callback?error=access_denied_user_cancelled")
        assert response.status_code in [302, 307]
        assert "banking=error" in response.headers["location"]
        assert "access_denied_user_cancelled" in response.headers["location"]
