import os
import json
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.models import Member, MemberExpense, CallForFunds, BankTransaction, MemberLedgerEntry, Task, BankAccount
from app.services.treasury_service import (
    get_member_balance,
    get_member_covered_months,
    add_ledger_entry,
    get_member_treasury_summary,
    get_all_treasury_summaries
)
from app.services.reconciliation_service import ReconciliationService
from app.services.call_for_funds_service import calculate_member_call_for_funds


@pytest.fixture
def test_db():
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def setup_member(test_db):
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

    member = Member(
        name="Henri Jamet",
        prenom="Henri",
        email="henri@example.com",
        monthly_contribution=50.0,
        payment_reference="HLV-HENRI",
        is_coordinator=True
    )
    test_db.add(member)
    test_db.commit()
    test_db.refresh(member)
    test_db.refresh(acc)
    member.bank_acc_id = acc.id
    return member


def test_advance_150_covers_3_months(test_db, setup_member):
    """Vérifie qu'une avance de 150 € couvre 3 mois d'échéances à 50 €/mois."""
    member = setup_member

    # Ajout d'une avance validée de 150 €
    entry = add_ledger_entry(
        db=test_db,
        member_id=member.id,
        entry_type="AVANCE",
        amount=150.0,
        description="Avance outillage jardin"
    )

    balance = get_member_balance(test_db, member.id)
    assert balance == 150.0

    covered = get_member_covered_months(balance, member.monthly_contribution)
    assert covered == 3

    # Appel de fonds mensuel : solde >= 50 € -> statut COUVERT et reliquat dû à 0 €
    call_calc = calculate_member_call_for_funds(test_db, member, year=2026, month=10)
    assert call_calc["status"] == "COUVERT"
    assert call_calc["amount_due"] == 0.0
    assert call_calc["balance_before"] == 150.0


def test_virement_600_covers_12_months(test_db, setup_member):
    """Vérifie qu'un virement de 600 € couvre 12 mois complets."""
    member = setup_member

    add_ledger_entry(
        db=test_db,
        member_id=member.id,
        entry_type="VIREMENT",
        amount=600.0,
        description="Virement annuel anticipé"
    )

    balance = get_member_balance(test_db, member.id)
    assert balance == 600.0

    covered = get_member_covered_months(balance, member.monthly_contribution)
    assert covered == 12

    summary = get_member_treasury_summary(test_db, member)
    assert summary["balance"] == 600.0
    assert summary["covered_months"] == 12
    assert summary["payment_reference"] == "HLV-HENRI"


def test_expense_rejection_workflow(test_db, setup_member, client):
    """Vérifie le cycle de rejet d'une avance de frais avec tâche de validation associée."""
    member = setup_member

    # Création d'une dépense en statut PENDING
    expense_data = {
        "member_id": member.id,
        "title": "Avance peinture salon",
        "amount": 75.0,
        "expense_date": "2026-10-01",
        "category": "Travaux"
    }
    create_res = client.post("/api/finances/expenses", data=expense_data)
    assert create_res.status_code == 201
    exp_json = create_res.json()
    assert exp_json["status"] == "PENDING"
    assert exp_json["task_id"] is not None

    task_id = exp_json["task_id"]
    test_db.rollback()
    task = test_db.query(Task).filter(Task.id == task_id).first()
    assert task is not None
    assert task.status == "A_FAIRE"

    # Aucune écriture au grand livre tant que l'avance n'est pas validée
    assert get_member_balance(test_db, member.id) == 0.0

    # Rejet de l'avance
    reject_res = client.post(
        f"/api/finances/expenses/{exp_json['id']}/reject",
        json={"rejection_reason": "Facture manquante"}
    )
    assert reject_res.status_code == 200
    rej_json = reject_res.json()
    assert rej_json["status"] == "REJECTED"
    assert rej_json["rejection_reason"] == "Facture manquante"

    # Vérification que la tâche associée est clôturée
    test_db.rollback()
    updated_task = test_db.query(Task).filter(Task.id == task_id).first()
    assert updated_task.status in ["REJECTED", "ANNULEE", "INVALIDE"]

    # Le solde de trésorerie reste intact à 0 €
    assert get_member_balance(test_db, member.id) == 0.0


def test_reconciliation_level_1_and_idempotence(test_db, setup_member):
    """Vérifie le lettrage Niveau 1 certifié par référence permanente et l'unicité stricte."""
    member = setup_member

    # Appel de fonds en attente
    cff = CallForFunds(
        reference="AF-202610-HENRI",
        member_id=member.id,
        member_name=member.name,
        year=2026,
        month=10,
        period_label="Octobre 2026",
        theoretical_contribution=50.0,
        net_amount=50.0,
        amount_due=50.0,
        balance_before=0.0,
        payment_reference="HLV-HENRI",
        status="EMIS"
    )
    test_db.add(cff)

    # Transaction bancaire avec référence normalisée permanente
    tx = BankTransaction(
        transaction_id="TX-SWAN-001",
        account_id=member.bank_acc_id,
        booking_date="2026-10-04",
        amount=50.0,
        currency="EUR",
        debtor_name="HENRI JAMET",
        remittance_information="COTISATION MENSUELLE HLV-HENRI OCTOBRE"
    )
    test_db.add(tx)
    test_db.commit()

    # 1er passage de l'automate
    rec_res = ReconciliationService.run_reconciliation(test_db)
    assert rec_res["success"] is True
    assert len(rec_res["level_1_matches"]) == 1
    assert rec_res["level_1_matches"][0]["member_id"] == member.id
    assert rec_res["level_1_matches"][0]["matched_ref"] == "HLVHENRI"

    # Grand livre crédité
    balance = get_member_balance(test_db, member.id)
    assert balance == 50.0

    # Appel de fonds soldé
    test_db.refresh(cff)
    assert cff.status == "REGLE"
    assert cff.bank_transaction_id == tx.id

    # 2ème passage : idempotence stricte, aucun doublon
    rec_res_2 = ReconciliationService.run_reconciliation(test_db)
    assert rec_res_2["already_reconciled"] == 1
    assert len(rec_res_2["level_1_matches"]) == 0
    assert get_member_balance(test_db, member.id) == 50.0


def test_reconciliation_level_2_and_manual_assignment(test_db, setup_member):
    """Vérifie la détection Niveau 2 par nom émetteur puis l'attribution manuelle."""
    member = setup_member

    tx = BankTransaction(
        transaction_id="TX-SWAN-002",
        account_id=member.bank_acc_id,
        booking_date="2026-10-04",
        amount=50.0,
        currency="EUR",
        debtor_name="Henri Jamet",
        remittance_information="Virement compte perso sans reference"
    )
    test_db.add(tx)
    test_db.commit()

    # Automate : détection Niveau 2 sans crédit automatique
    rec_res = ReconciliationService.run_reconciliation(test_db)
    assert len(rec_res["level_1_matches"]) == 0
    assert len(rec_res["level_2_pending"]) == 1
    assert rec_res["level_2_pending"][0]["candidate_member_id"] == member.id
    assert get_member_balance(test_db, member.id) == 0.0

    # Attribution manuelle
    assign_res = ReconciliationService.assign_transaction_manually(
        db=test_db,
        transaction_id=tx.id,
        member_id=member.id,
        notes="Validation manuelle Henri"
    )
    assert assign_res["success"] is True
    assert assign_res["member_id"] == member.id

    # Solde maintenant crédité
    assert get_member_balance(test_db, member.id) == 50.0


def test_cron_authentication_security(client):
    """Vérifie que les endpoints cron Vercel exigent strictement CRON_SECRET (Fail-Fast 401)."""
    with patch.dict(os.environ, {"CRON_SECRET": "secret_super_securise_123"}):
        # 1. Sans secret -> 401
        res_no_auth = client.get("/api/cron/banking-sync")
        assert res_no_auth.status_code == 401

        # 2. Secret invalide -> 401
        res_bad_auth = client.get(
            "/api/cron/banking-sync",
            headers={"Authorization": "Bearer mauvais_token"}
        )
        assert res_bad_auth.status_code == 401

        # 3. Secret valide via Header Bearer -> 200
        res_good_auth = client.get(
            "/api/cron/banking-sync",
            headers={"Authorization": "Bearer secret_super_securise_123"}
        )
        assert res_good_auth.status_code == 200
        data = res_good_auth.json()
        assert data["success"] is True
        assert data["cron"] == "banking-sync"


def test_cron_banking_sync_drive_health(client):
    """Vérifie que le cron quotidien banking-sync audite l'état Google Drive sans masquage."""
    with patch.dict(os.environ, {"CRON_SECRET": "cron_key_drive_test"}), \
         patch("app.main.drive_jail_service.check_connection_status") as mock_drive:

        mock_drive.return_value = {
            "connected": False,
            "status": "expired",
            "message": "Le jeton Google Drive a expiré (invalid_grant)."
        }

        res = client.get(
            "/api/cron/banking-sync",
            headers={"Authorization": "Bearer cron_key_drive_test"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["drive_status"]["connected"] is False
        assert data["drive_status"]["status"] == "expired"
        assert "expiré" in data["drive_status"]["message"]


def test_delete_member_expense_and_purge(test_db, setup_member, client):
    """Vérifie la suppression définitive d'une avance (purge stricte sans résidu)."""
    member = setup_member
    exp = MemberExpense(
        member_id=member.id,
        member_prenom=member.prenom or "Henri",
        title="Test Avance Purge",
        amount=1.0,
        expense_date="2026-10-04",
        status="REJECTED"
    )
    test_db.add(exp)
    test_db.commit()
    test_db.refresh(exp)

    res = client.delete(f"/api/finances/expenses/{exp.id}")
    assert res.status_code == 200
    assert res.json()["success"] is True

    # Vérification en base : zéro enregistrement résiduel
    purged = test_db.query(MemberExpense).filter(MemberExpense.id == exp.id).first()
    assert purged is None
