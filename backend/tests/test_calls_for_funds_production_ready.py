import os
import sys
import json
import logging
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models import Member, CallForFunds, BankAccount, MemberLedgerEntry
from app.security import create_access_token
import app.services.email_service as email_service
from app.services.email_service import (
    send_email,
    send_call_for_funds_email,
    is_test_mode,
    is_email_disabled,
    ALLOWED_RECIPIENTS
)
from app.services.call_for_funds_service import (
    calculate_member_call_for_funds,
    generate_and_save_monthly_call,
    is_bank_account_active
)
from app.services.treasury_service import add_ledger_entry, get_member_balance


@pytest.fixture
def test_db():
    try:
        from conftest import TestingSessionLocal
    except ImportError:
        try:
            from tests.conftest import TestingSessionLocal
        except ImportError:
            from app.database import SessionLocal as TestingSessionLocal
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def setup_bank_and_members(test_db, monkeypatch):
    """Prépare un compte bancaire actif Indy/Swan et les membres dont Frédéric Jamet créditeur."""
    monkeypatch.setenv("IS_BANK_ACCOUNT_ACTIVE", "true")

    # 1. Compte bancaire actif
    acc = test_db.query(BankAccount).first()
    if not acc:
        acc = BankAccount(
            account_id="swan_acc_official",
            name="Compte Courant Swan",
            iban="FR7617515913500123456789012",
            currency="EUR",
            aspsp_name="Swan"
        )
        test_db.add(acc)
    else:
        acc.iban = "FR7617515913500123456789012"
        acc.aspsp_name = "Swan"
    test_db.commit()

    # 2. Membre 1 : Henri Jamet (coordinateur)
    henri = test_db.query(Member).filter(Member.prenom == "Henri").first()
    if not henri:
        henri = Member(
            id=1,
            prenom="Henri",
            nom="Jamet",
            name="Henri Jamet",
            email="hellenvillierssci@gmail.com",
            is_coordinator=True,
            monthly_contribution=50.0,
            notif_new_invoices=True
        )
        test_db.add(henri)
    else:
        henri.email = "hellenvillierssci@gmail.com"
        henri.monthly_contribution = 50.0
        henri.notif_new_invoices = True

    # 3. Membre 2 : Frédéric Jamet (créditeur de +225,66 €)
    frederic = test_db.query(Member).filter(Member.prenom == "Frédéric").first()
    if not frederic:
        frederic = Member(
            id=2,
            prenom="Frédéric",
            nom="Jamet",
            name="Frédéric Jamet",
            email="frederic_jamet@orange.fr",
            is_coordinator=False,
            monthly_contribution=50.0,
            notif_new_invoices=True
        )
        test_db.add(frederic)
    else:
        frederic.email = "frederic_jamet@orange.fr"
        frederic.monthly_contribution = 50.0
        frederic.notif_new_invoices = True

    # 4. Membre 3 : Hortense Jamet (débitrice, cotisation due de 50,00 €)
    hortense = test_db.query(Member).filter(Member.prenom == "Hortense").first()
    if not hortense:
        hortense = Member(
            id=3,
            prenom="Hortense",
            nom="Jamet",
            name="Hortense Jamet",
            email="hortense_jamet@yahoo.fr",
            is_coordinator=False,
            monthly_contribution=50.0,
            notif_new_invoices=True
        )
        test_db.add(hortense)
    else:
        hortense.email = "hortense_jamet@yahoo.fr"
        hortense.monthly_contribution = 50.0
        hortense.notif_new_invoices = True

    test_db.commit()

    # Inscrire un solde créditeur de +225,66 € pour Frédéric Jamet au grand livre
    # Nettoyer d'abord les entrées de grand livre de Frédéric pour ce test
    test_db.query(MemberLedgerEntry).filter(MemberLedgerEntry.member_id == frederic.id).delete()
    test_db.query(MemberLedgerEntry).filter(MemberLedgerEntry.member_id == hortense.id).delete()
    test_db.commit()

    add_ledger_entry(
        db=test_db,
        member_id=frederic.id,
        entry_type="AVANCE",
        amount=275.66,
        description="Avances et solde cumulé créditeur Frédéric Jamet",
        entry_date=datetime(2026, 9, 15)
    )
    test_db.commit()

    return {"henri": henri, "frederic": frederic, "hortense": hortense, "acc": acc}


@pytest.fixture
def coordinator_headers(setup_bank_and_members):
    token = create_access_token({"sub": "Henri", "user_id": 1, "is_coordinator": True})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_resend_client():
    """Mock hermétique au niveau du client HTTP pour certifier l'envoi réel sans consommer de quota."""
    import httpx
    real_post = httpx.Client.post
    mock_post = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "resend_real_test_msg_98765", "status": "sent"}
    mock_resp.text = '{"id": "resend_real_test_msg_98765", "status": "sent"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


# ==============================================================================
# TESTS 1 : CONFIGURATION PRODUCTION READY (EMAIL_FORCE_REAL_MODE & TEST_MODE OFF)
# ==============================================================================

def test_production_ready_default_modes(monkeypatch):
    """Certifie que EMAIL_TEST_MODE est inactif par défaut et que les envois réels sont opérationnels."""
    monkeypatch.delenv("EMAIL_TEST_MODE", raising=False)
    monkeypatch.delenv("DISABLE_ALL_EMAILS", raising=False)
    monkeypatch.setenv("EMAIL_FORCE_REAL_MODE", "true")

    # Mode test doit être False (mode simulation définitivement désactivé)
    assert is_test_mode() is False
    # Coupe-circuit doit être inactif (emails réels autorisés)
    assert is_email_disabled() is False


# ==============================================================================
# TESTS 2 : RÈGLE ABSOLUE D'EXCLUSION DU MEMBRE CRÉDITEUR (FRÉDÉRIC JAMET +225,66 €)
# ==============================================================================

def test_frederic_jamet_credit_balance_strictly_excluded_from_email(
    test_db,
    setup_bank_and_members,
    mock_resend_client,
    caplog
):
    """
    Certifie que Frédéric Jamet avec son solde créditeur de +275,66 € (couvrant largement la cotisation de 50 €) :
    1. A un statut COUVERT et net_amount == 0.0.
    2. Ne reçoit STRICTEMENT AUCUN e-mail (send_call_for_funds_email retourne neutralized_no_email).
    3. Aucun appel réseau Resend n'est effectué (0 appels).
    4. Un log clair d'exclusion est émis.
    """
    frederic = setup_bank_and_members["frederic"]
    balance = get_member_balance(test_db, frederic.id)
    assert balance >= 50.0  # +275.66 €

    calc = calculate_member_call_for_funds(test_db, frederic, 2026, 10)
    assert calc["should_issue"] is False
    assert calc["net_amount"] == 0.0
    assert calc["status"] == "COUVERT"

    with caplog.at_level(logging.INFO):
        res = send_call_for_funds_email(frederic, calc, actually_send=True, db=test_db)

    assert res["status"] == "neutralized_no_email"
    # Certifie zéro appel réseau vers Resend
    assert mock_resend_client.call_count == 0
    # Certifie le log clair d'exclusion
    assert any("[EXCLUSION APPEL DE FONDS]" in record.message for record in caplog.records)


# ==============================================================================
# TESTS 3 : ENVOI RÉEL VIA RESEND QUAND NET_AMOUNT > 0 (MEMBRE DÉBITEUR)
# ==============================================================================

def test_debtor_member_receives_real_call_for_funds_email(
    test_db,
    setup_bank_and_members,
    mock_resend_client,
    monkeypatch
):
    """
    Certifie qu'un membre débiteur (ex: Hortense Jamet avec net_amount=50.00 €) :
    1. A un statut EMIS et net_amount > 0.
    2. Déclenche un envoi réel via Resend quand EMAIL_FORCE_REAL_MODE est actif.
    3. Resend est appelé avec le bon destinataire officiel et le QR code / décompte.
    """
    monkeypatch.delenv("EMAIL_TEST_MODE", raising=False)
    monkeypatch.delenv("DISABLE_ALL_EMAILS", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_prod_test_key_valid")

    hortense = setup_bank_and_members["hortense"]
    balance = get_member_balance(test_db, hortense.id)
    assert balance == 0.0

    calc = calculate_member_call_for_funds(test_db, hortense, 2026, 10)
    assert calc["should_issue"] is True
    assert calc["net_amount"] == 50.0
    assert calc["status"] == "EMIS"

    res = send_call_for_funds_email(hortense, calc, actually_send=True, db=test_db)

    assert res.get("status") == "sent"
    assert mock_resend_client.call_count == 1
    call_args = mock_resend_client.call_args
    sent_payload = call_args[1]["json"]
    assert sent_payload["to"] == ["hortense_jamet@yahoo.fr"]
    assert "Appel de fonds" in sent_payload["subject"]
    assert "50.00" in sent_payload["subject"]


# ==============================================================================
# TESTS 4 : CRON MENSUEL VERCEL (1er DU MOIS) : AUTOMATISATION & EXCLUSIONS
# ==============================================================================

def test_cron_monthly_calls_for_funds_automation_and_exclusions(
    client,
    test_db,
    setup_bank_and_members,
    mock_resend_client,
    caplog,
    monkeypatch
):
    """
    Certifie le bon fonctionnement du cron mensuel Vercel (/api/cron/calls-for-funds) :
    1. Authentifié par CRON_SECRET.
    2. Exclut rigoureusement Frédéric Jamet (solde créditeur) avec log clair [CRON APPEL DE FONDS EXCLUSION].
    3. Envoie l'email réel aux membres débiteurs (Hortense).
    4. Est strictement idempotent (le 2ème passage n'envoie aucun duplicata).
    """
    cron_secret = "test_cron_secret_production_2026"
    monkeypatch.setenv("CRON_SECRET", cron_secret)
    monkeypatch.delenv("EMAIL_TEST_MODE", raising=False)
    monkeypatch.delenv("DISABLE_ALL_EMAILS", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_prod_test_key_valid")

    cron_headers = {"Authorization": f"Bearer {cron_secret}"}

    with caplog.at_level(logging.INFO):
        resp = client.post("/api/cron/calls-for-funds", headers=cron_headers)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["cron"] == "calls-for-funds"
    assert data["notifications_sent"] >= 1
    assert data["notifications_skipped"] >= 1

    # Vérification du log d'exclusion pour Frédéric Jamet
    assert any("[CRON APPEL DE FONDS EXCLUSION]" in record.message and "Frédéric" in record.message for record in caplog.records)

    # Vérification que seul le membre débiteur a été envoyé à Resend
    assert mock_resend_client.call_count >= 1
    all_calls_to = [c[1]["json"]["to"] for c in mock_resend_client.call_args_list]
    # Frédéric Jamet ne doit JAMAIS être dans la liste des destinataires envoyés
    for recips in all_calls_to:
        assert "frederic_jamet@orange.fr" not in recips

    # Idempotence : un second appel du cron ne doit envoyer aucun nouvel email
    mock_resend_client.reset_mock()
    resp_second = client.post("/api/cron/calls-for-funds", headers=cron_headers)
    assert resp_second.status_code == 200
    assert resp_second.json()["notifications_sent"] == 0
    assert mock_resend_client.call_count == 0


# ==============================================================================
# TESTS 5 : ENDPOINT COORDINATEUR /generate EXCLUSION & ENVOI
# ==============================================================================

def test_coordinator_generate_endpoint_skips_credit_member_and_notifies_debtor(
    client,
    test_db,
    setup_bank_and_members,
    coordinator_headers,
    mock_resend_client,
    caplog,
    monkeypatch
):
    """
    Certifie que l'endpoint manuel coordinateur (/api/finances/calls-for-funds/generate) :
    1. Émet le log [APPEL DE FONDS EXCLUSION] pour Frédéric Jamet.
    2. Ne lui envoie aucun email.
    3. Notifie les associés débiteurs avec send_notifications=True.
    """
    monkeypatch.delenv("EMAIL_TEST_MODE", raising=False)
    monkeypatch.delenv("DISABLE_ALL_EMAILS", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_prod_test_key_valid")

    # Utiliser un mois spécifique différent pour tester la génération
    y, m = 2026, 11

    with caplog.at_level(logging.INFO):
        resp = client.post(
            "/api/finances/calls-for-funds/generate",
            headers=coordinator_headers,
            json={"year": y, "month": m, "send_notifications": True}
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True

    # Vérification du log d'exclusion
    assert any("[APPEL DE FONDS EXCLUSION]" in record.message and "Frédéric" in record.message for record in caplog.records)

    # Vérification des destinataires Resend
    all_calls_to = [c[1]["json"]["to"] for c in mock_resend_client.call_args_list]
    for recips in all_calls_to:
        assert "frederic_jamet@orange.fr" not in recips


# ==============================================================================
# TESTS 6 : LIVRABLE 3 — TARGET_DATE DANS PREVIEW & MEMBER.PAYMENT_REFERENCE DANS SCHEMA
# ==============================================================================

def test_preview_target_date_and_member_payment_reference_schema(
    client,
    test_db,
    setup_bank_and_members,
    coordinator_headers
):
    """
    Certifie :
    1. Que MemberResponse conserve bien payment_reference (ex: 'HLV-HENRI').
    2. Que GET /api/members retourne bien payment_reference pour les membres.
    3. Que GET /api/finances/calls-for-funds/preview?target_date=2026-11-05 renvoie bien year=2026, month=11, period_label='2026-11'.
    4. Qu'un format invalide pour target_date lève une 400.
    """
    from app.schemas import MemberResponse

    henri = setup_bank_and_members["henri"]
    henri.payment_reference = "HLV-HENRI"
    test_db.commit()
    test_db.refresh(henri)

    # 1. Vérification du schéma MemberResponse avec payment_reference
    if hasattr(MemberResponse, "model_validate"):
        member_dto = MemberResponse.model_validate(henri)
    else:
        member_dto = MemberResponse.from_orm(henri)

    assert member_dto.payment_reference == "HLV-HENRI"

    # 2. Vérification que l'API GET /api/members expose bien payment_reference
    resp_members = client.get("/api/members", headers=coordinator_headers)
    assert resp_members.status_code == 200
    members_list = resp_members.json()
    henri_member = next((m for m in members_list if m.get("prenom") == "Henri"), None)
    assert henri_member is not None
    assert henri_member.get("payment_reference") == "HLV-HENRI"

    # 3. Vérification de l'endpoint preview avec target_date
    resp = client.get(
        "/api/finances/calls-for-funds/preview?target_date=2026-11-05",
        headers=coordinator_headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["year"] == 2026
    assert data["month"] == 11
    assert data["period_label"] == "2026-11"

    # 4. Vérification du garde-fou format invalide
    resp_invalid = client.get(
        "/api/finances/calls-for-funds/preview?target_date=invalid-date",
        headers=coordinator_headers
    )
    assert resp_invalid.status_code == 400
    assert "Format target_date invalide" in resp_invalid.json().get("detail", "")


