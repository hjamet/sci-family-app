import os
import re
import json
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models import Member, MemberExpense, CallForFunds, BankTransaction, MemberLedgerEntry, Task, BankAccount
from app.security import create_access_token
from app.services.treasury_service import (
    get_member_balance,
    get_member_covered_months,
    add_ledger_entry,
    get_member_treasury_summary,
    get_all_treasury_summaries
)
from app.services.reconciliation_service import ReconciliationService
from app.services.call_for_funds_service import (
    calculate_member_call_for_funds,
    generate_and_save_monthly_call,
    is_treasury_contributions_started
)


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
def setup_members(test_db):
    test_db.query(MemberLedgerEntry).delete()
    test_db.query(CallForFunds).delete()
    test_db.query(MemberExpense).delete()
    test_db.query(BankTransaction).delete()
    test_db.query(BankAccount).delete()
    test_db.query(Task).delete()
    test_db.query(Member).delete()
    test_db.commit()

    acc = BankAccount(
        account_id="ACC-001",
        name="Compte Courant SCI",
        iban="FR7612345678901234567890123",
        currency="EUR"
    )
    test_db.add(acc)

    coord = Member(
        name="Henri Jamet",
        prenom="Henri",
        email="henri@example.com",
        monthly_contribution=50.0,
        payment_reference="HLV-HENRI",
        is_coordinator=True
    )
    regular = Member(
        name="Marguerite Jamet",
        prenom="Marguerite",
        email="marguerite@example.com",
        monthly_contribution=50.0,
        payment_reference="HLV-MARGUERITE",
        is_coordinator=False
    )
    test_db.add(coord)
    test_db.add(regular)
    test_db.commit()
    test_db.refresh(coord)
    test_db.refresh(regular)
    test_db.refresh(acc)

    coord.bank_acc_id = acc.id
    regular.bank_acc_id = acc.id
    test_db.commit()

    return {"coord": coord, "member": regular, "acc": acc}


@pytest.fixture
def coord_headers(setup_members):
    coord = setup_members["coord"]
    token = create_access_token({"sub": "Henri", "user_id": coord.id, "email": coord.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def member_headers(setup_members):
    member = setup_members["member"]
    token = create_access_token({"sub": "Marguerite", "user_id": member.id, "email": member.email})
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# B1 & RBAC : TESTS D'AUTHENTIFICATION STRICTE ET DE CONTRÔLE D'ACCÈS
# ==============================================================================

def test_b1_rbac_routes_security(client, setup_members, member_headers, coord_headers):
    """Vérifie que les routes financières rejettent les requêtes sans jeton (401) et non autorisées (403)."""
    coord = setup_members["coord"]
    member = setup_members["member"]

    # 1. GET /api/finances/treasury/summary
    assert client.get("/api/finances/treasury/summary").status_code == 401
    assert client.get("/api/finances/treasury/summary", headers=member_headers).status_code == 403
    assert client.get("/api/finances/treasury/summary", headers=coord_headers).status_code == 200

    # 2. GET /api/finances/calls-for-funds/preview
    assert client.get("/api/finances/calls-for-funds/preview").status_code == 401
    assert client.get("/api/finances/calls-for-funds/preview", headers=member_headers).status_code == 403
    assert client.get("/api/finances/calls-for-funds/preview", headers=coord_headers).status_code == 200

    # 3. GET /api/finances/treasury/members/{member_id}
    # Un membre ne peut pas voir le solde d'un autre membre
    assert client.get(f"/api/finances/treasury/members/{coord.id}", headers=member_headers).status_code == 403
    # Un membre peut voir son propre solde
    assert client.get(f"/api/finances/treasury/members/{member.id}", headers=member_headers).status_code == 200
    # Le coordinateur peut voir les soldes de tous les membres
    assert client.get(f"/api/finances/treasury/members/{member.id}", headers=coord_headers).status_code == 200

    # 4. GET /api/finances/treasury/me
    assert client.get("/api/finances/treasury/me").status_code == 401
    res_me = client.get("/api/finances/treasury/me", headers=member_headers)
    assert res_me.status_code == 200
    assert res_me.json()["member_id"] == member.id

    # 5. POST /api/finances/expenses : membre ne peut déclarer pour autrui
    exp_forbidden = client.post(
        "/api/finances/expenses",
        data={"member_id": coord.id, "title": "Tentative fraude", "amount": 10.0},
        headers=member_headers
    )
    assert exp_forbidden.status_code == 403


# ==============================================================================
# B2 : REJEU DE VALIDATION & DÉTECTION 409 CONFLICT
# ==============================================================================

def test_b2_replay_validation_returns_409_conflict(client, setup_members, coord_headers, member_headers):
    """Vérifie qu'une avance ne peut être validée qu'une seule fois (rejeu -> 409 Conflict)."""
    member = setup_members["member"]

    # 1. Création d'une avance par le membre
    create_res = client.post(
        "/api/finances/expenses",
        data={"member_id": member.id, "title": "Achat serrure", "amount": 60.0},
        headers=member_headers
    )
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    # 2. Tentative de validation par un membre simple -> 403 Forbidden
    assert client.post(f"/api/finances/expenses/{exp_id}/validate", headers=member_headers).status_code == 403

    # 3. 1ère validation par le coordinateur -> 200 OK
    val_1 = client.post(f"/api/finances/expenses/{exp_id}/validate", headers=coord_headers)
    assert val_1.status_code == 200
    assert val_1.json()["status"] == "VALIDATED"

    # 4. 2ème validation (rejeu réseau ou double clic) -> 409 Conflict
    val_2 = client.post(f"/api/finances/expenses/{exp_id}/validate", headers=coord_headers)
    assert val_2.status_code == 409
    assert "pas en attente de validation" in val_2.json()["detail"] or "déjà" in val_2.json()["detail"]

    # 5. Tentative de refus d'une avance déjà validée -> 409 Conflict
    rej_after = client.post(
        f"/api/finances/expenses/{exp_id}/reject",
        json={"rejection_reason": "Trop tard"},
        headers=coord_headers
    )
    assert rej_after.status_code == 409


# ==============================================================================
# B4 : ÉCHÉANCE PARTIELLE & DÉBIT INTÉGRAL DE LA QUOTE-PART
# ==============================================================================

def test_b4_partial_call_for_funds_full_debit_ledger(test_db, setup_members):
    """
    Vérifie l'exactitude comptable : solde initial 20 € -> échéance -50 € -> solde -30 € -> virement 30 € -> 0.00 €.
    """
    member = setup_members["coord"]

    # 1. Solde créditeur initial de 20,00 €
    add_ledger_entry(
        db=test_db,
        member_id=member.id,
        entry_type="AVANCE",
        amount=20.0,
        description="Solde initial résiduel"
    )
    assert get_member_balance(test_db, member.id) == 20.0

    # 2. Appel de fonds du mois (quote-part statutaire = 50,00 €)
    with patch("app.services.call_for_funds_service.is_treasury_contributions_started", return_value=True):
        call_obj = generate_and_save_monthly_call(test_db, member, year=2026, month=11)

    assert call_obj.theoretical_contribution == 50.0
    assert call_obj.balance_before == 20.0
    assert call_obj.amount_due == 30.0

    # 3. Le grand livre DOIT avoir débité la quote-part intégrale (-50.00 €), solde = -30.00 €
    balance_after_call = get_member_balance(test_db, member.id)
    assert balance_after_call == -30.0

    # 4. Réception du virement de règlement de 30,00 €
    tx = BankTransaction(
        transaction_id="TX-REGLEMENT-30",
        account_id=member.bank_acc_id,
        booking_date="2026-11-05",
        amount=30.0,
        currency="EUR",
        debtor_name="HENRI JAMET",
        remittance_information="COTISATION HLV-HENRI 30 EUR"
    )
    test_db.add(tx)
    test_db.commit()

    rec_res = ReconciliationService.run_reconciliation(test_db)
    assert rec_res["success"] is True
    assert len(rec_res["level_1_matches"]) == 1

    # 5. Le solde final revient EXACTEMENT à 0,00 € (zéro surplus indu !)
    final_balance = get_member_balance(test_db, member.id)
    assert final_balance == 0.0


# ==============================================================================
# B3 : DÉCOUPLAGE REPORTLAB EN CAS D'ABSENCE SUR SERVERLESS
# ==============================================================================

def test_b3_reportlab_decoupled_safe_generation(test_db, setup_members):
    """Vérifie que l'indisponibilité de ReportLab n'empêche pas l'écriture comptable."""
    member = setup_members["coord"]

    with patch("app.services.call_for_funds_service.REPORTLAB_AVAILABLE", False), \
         patch("app.services.call_for_funds_service.is_treasury_contributions_started", return_value=True):

        # La génération ne doit pas lever RuntimeError mais se terminer proprement
        call_obj = generate_and_save_monthly_call(test_db, member, year=2026, month=12)
        assert call_obj is not None
        assert call_obj.theoretical_contribution == 50.0


# ==============================================================================
# M1 : UNICITÉ STRICTE DU GRAND LIVRE (PAS DE DOUBLE ENREGISTREMENT)
# ==============================================================================

def test_m1_unique_constraint_bank_transaction_id(test_db, setup_members):
    """Vérifie qu'un même bank_transaction_id ne peut pas être inséré deux fois dans le grand livre."""
    member = setup_members["coord"]
    acc = setup_members["acc"]

    tx = BankTransaction(
        transaction_id="TX-UNIQ-001",
        account_id=acc.id,
        booking_date="2026-10-04",
        amount=50.0,
        currency="EUR"
    )
    test_db.add(tx)
    test_db.commit()

    e1 = add_ledger_entry(
        db=test_db,
        member_id=member.id,
        entry_type="VIREMENT",
        amount=50.0,
        bank_transaction_id=tx.id
    )
    assert e1.id is not None

    # Deuxième tentative d'insertion de la même transaction bancaire
    e2 = add_ledger_entry(
        db=test_db,
        member_id=member.id,
        entry_type="VIREMENT",
        amount=50.0,
        bank_transaction_id=tx.id
    )
    # add_ledger_entry intercepte le conflit et retourne l'écriture existante sans doubler
    assert e2.id == e1.id
    assert get_member_balance(test_db, member.id) == 50.0


# ==============================================================================
# M2 : AUCUN DÉBIT D'ÉCHÉANCE SI COMPTE INACTIF OU AVANT DÉMARRAGE
# ==============================================================================

def test_m2_no_debit_when_bank_inactive_or_before_start_period(test_db, setup_members):
    """Vérifie que 0 débit d'échéance n'est inscrit au grand livre tant que le compte est inactif."""
    member = setup_members["coord"]

    # Simuler compte inactif
    with patch("app.services.call_for_funds_service.is_bank_account_active", return_value=False):
        call_obj = generate_and_save_monthly_call(test_db, member, year=2026, month=10)
        assert call_obj.status == "PENDING_SWAN_IBAN"
        # 0 écriture au grand livre
        assert get_member_balance(test_db, member.id) == 0.0


# ==============================================================================
# m1 : SÉCURITÉ CRONS VERCEL (SECRETS.COMPARE_DIGEST & BEARER UNIQUEMENT)
# ==============================================================================

def test_m1_cron_secrets_compare_digest_bearer_only(client):
    """Vérifie que verify_cron_auth utilise Bearer uniquement et refuse ?secret=."""
    with patch.dict(os.environ, {"CRON_SECRET": "cle_secrete_longue_et_robuste"}):
        # 1. Sans token -> 401
        assert client.get("/api/cron/banking-sync").status_code == 401
        assert client.get("/api/cron/calls-for-funds").status_code == 401

        # 2. Token passé en query parameter (?secret=) -> REFUSÉ (401)
        assert client.get("/api/cron/banking-sync?secret=cle_secrete_longue_et_robuste").status_code == 401

        # 3. Mauvais token en Bearer -> 401
        assert client.get(
            "/api/cron/banking-sync",
            headers={"Authorization": "Bearer mauvais_jeton"}
        ).status_code == 401

        # 4. Bon token en Bearer -> 200
        res_sync = client.get(
            "/api/cron/banking-sync",
            headers={"Authorization": "Bearer cle_secrete_longue_et_robuste"}
        )
        assert res_sync.status_code == 200

        res_cff = client.get(
            "/api/cron/calls-for-funds",
            headers={"Authorization": "Bearer cle_secrete_longue_et_robuste"}
        )
        assert res_cff.status_code == 200


# ==============================================================================
# POINT 5 : FORMATS AF ET CFF RECONNUS PAR LE LETTRAGE
# ==============================================================================

def test_point5_reconciliation_af_and_cff_reference_formats(test_db, setup_members):
    """Vérifie la détection Niveau 1 des formats AF-AAAAMM-PRENOM et CFF-XX."""
    coord = setup_members["coord"]

    # Transaction avec format AF-202610-HENRI
    tx1 = BankTransaction(
        transaction_id="TX-AF-001",
        account_id=coord.bank_acc_id,
        booking_date="2026-10-04",
        amount=50.0,
        currency="EUR",
        debtor_name="HENRI JAMET",
        remittance_information="VIREMENT REF AF-202610-HENRI MENSUEL"
    )
    test_db.add(tx1)
    test_db.commit()

    rec_res = ReconciliationService.run_reconciliation(test_db)
    assert len(rec_res["level_1_matches"]) == 1
    assert rec_res["level_1_matches"][0]["member_id"] == coord.id
    assert "AF-HENRI" in rec_res["level_1_matches"][0]["matched_ref"]


# ==============================================================================
# CYCLE DE REJET & SUPPRESSION AVEC PERMISSION COORDINATEUR
# ==============================================================================

def test_expense_rejection_and_purge_workflows(test_db, setup_members, client, coord_headers, member_headers):
    """Vérifie le rejet d'une avance puis la purge définitive réservée au coordinateur."""
    member = setup_members["member"]

    create_res = client.post(
        "/api/finances/expenses",
        data={"member_id": member.id, "title": "Avance outillage", "amount": 40.0},
        headers=member_headers
    )
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    # Rejet par coordinateur -> 200
    rej_res = client.post(
        f"/api/finances/expenses/{exp_id}/reject",
        json={"rejection_reason": "Facture illisible"},
        headers=coord_headers
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "REJECTED"

    # Membre simple tente de supprimer l'avance -> 403 Forbidden
    assert client.delete(f"/api/finances/expenses/{exp_id}", headers=member_headers).status_code == 403

    # Coordinateur supprime l'avance -> 200 OK
    del_res = client.delete(f"/api/finances/expenses/{exp_id}", headers=coord_headers)
    assert del_res.status_code == 200

    test_db.rollback()
    assert test_db.query(MemberExpense).filter(MemberExpense.id == exp_id).first() is None


def test_b3_reportlab_and_qrcode_importable_and_available():
    """Vérifie le comportement de génération PDF et le découplage selon la présence de reportlab."""
    from app.services.call_for_funds_service import REPORTLAB_AVAILABLE, generate_call_for_funds_pdf
    
    if REPORTLAB_AVAILABLE:
        import reportlab
        import qrcode
        dummy_call_data = {
            "reference": "TEST-PDF-001",
            "year": 2026,
            "month": 10,
            "period_label": "Octobre 2026",
            "theoretical_contribution": 50.0,
            "approved_expenses_total": 0.0,
            "net_amount": 50.0,
            "amount_due": 50.0,
            "balance_before": 0.0,
            "status": "EMIS",
            "payment_reference": "HLV-HENRI",
            "deducted_expenses": []
        }
        class DummyMember:
            name = "Henri Jamet"
            prenom = "Henri"
            role = "Coordinateur"
            email = "henri.jamet@example.com"
        
        pdf_bytes = generate_call_for_funds_pdf(
            call_data=dummy_call_data,
            member=DummyMember(),
            bank_info={"iban": "FR7612345678901234567890189", "bic": "SWNBFR22"},
            is_bank_pending=False
        )
        assert pdf_bytes is not None
        assert pdf_bytes.startswith(b"%PDF")
    else:
        # En environnement sans reportlab, la fonction retourne None sans crash
        assert generate_call_for_funds_pdf({}, None, {}) is None


def test_parental_couple_reconciliation_pooling(test_db, setup_members):
    """
    Vérifie la mutualisation des virements du couple parental Frédéric & Élisabeth :
    - Échéance foyer : 1 000,00 €/mois portée par Frédéric, 0,00 € pour Maman.
    - Virement Maman de 300,00 € + Virement Frédéric de 700,00 € = Foyer soldé (solde = 0,00 €).
    - Aucun seuil arbitraire : même < 500 €, le virement de Maman abonde le compte foyer.
    """
    acc = setup_members["acc"]

    frederic = Member(
        name="Frédéric Jamet",
        prenom="Frédéric",
        email="frdjamet@gmail.com",
        monthly_contribution=1000.0,
        payment_reference="HLV-FREDERIC",
        is_coordinator=False
    )
    maman = Member(
        name="Elizabeth Jamet",
        prenom="Maman",
        email="elizabeth_jamet@yahoo.fr",
        monthly_contribution=0.0,
        payment_reference="HLV-MAMAN",
        is_coordinator=False
    )
    test_db.add(frederic)
    test_db.add(maman)
    test_db.commit()
    test_db.refresh(frederic)
    test_db.refresh(maman)

    # 1. Échéance mensuelle de 1 000 € appelée sur le compte foyer de Frédéric
    add_ledger_entry(
        db=test_db,
        member_id=frederic.id,
        entry_type="ECHEANCE",
        amount=-1000.0,
        description="Appel de fonds Octobre 2026 (Foyer couple)"
    )

    # Vérification initiale : Frédéric débiteur de -1000 €, Maman à 0 €
    assert get_member_balance(test_db, frederic.id) == -1000.0
    assert get_member_balance(test_db, maman.id) == 0.0

    # 2. Virement de Maman de 300 € (< 500 €) avec sa référence permanente
    tx_maman = BankTransaction(
        transaction_id="TX-PARENT-MAMAN-300",
        account_id=acc.id,
        amount=300.0,
        currency="EUR",
        booking_date="2026-10-02",
        debtor_name="Elizabeth Jamet",
        remittance_information="Virement mensuel HLV-MAMAN"
    )
    # 3. Virement de Frédéric de 700 € avec sa référence permanente
    tx_frederic = BankTransaction(
        transaction_id="TX-PARENT-FREDERIC-700",
        account_id=acc.id,
        amount=700.0,
        currency="EUR",
        booking_date="2026-10-03",
        debtor_name="Frédéric Jamet",
        remittance_information="Cotisation HLV-FREDERIC solde"
    )
    test_db.add(tx_maman)
    test_db.add(tx_frederic)
    test_db.commit()

    # 4. Exécution du lettrage automatique
    res = ReconciliationService.run_reconciliation(test_db)
    assert res["success"] is True
    assert len(res["level_1_matches"]) == 2

    # 5. Vérification du solde du foyer :
    # - Maman n'a aucun débit/crédit parasite (solde = 0.0 €)
    # - Frédéric a reçu les deux virements (+300 € et +700 €), solde = 0.0 € (foyer soldé pour le mois !)
    balance_maman = get_member_balance(test_db, maman.id)
    balance_frederic = get_member_balance(test_db, frederic.id)
    assert balance_maman == 0.0
    assert balance_frederic == 0.0

    # Vérification des écritures au grand livre de Frédéric
    entries = test_db.query(MemberLedgerEntry).filter(MemberLedgerEntry.member_id == frederic.id).all()
    assert len(entries) == 3  # 1 ECHEANCE (-1000) + 2 VIREMENTS (+300, +700)
    virements = [e for e in entries if e.entry_type == "VIREMENT"]
    assert len(virements) == 2
    amounts = sorted([v.amount for v in virements])
    assert amounts == [300.0, 700.0]


