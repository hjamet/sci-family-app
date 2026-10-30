"""
Tests unitaires hermétiques pour la réconciliation du Grand Livre et des Appels de Fonds de Novembre 2026.
Vérifie :
1. L'idempotence de la création de MemberLedgerEntry(entry_type="AVANCE") lors d'un PUT /api/finances/expenses/{id}.
2. Le calcul d'appel de fonds de Novembre 2026 pour Frédéric Jamet :
   - Solde avant réconciliation : 225.66 € (Avance 225.66 € - Echéance 1000 € + Virement 1000 €)
   - Net dû avant : 774.34 €
   - Réconciliation avance "Sepase Annexe 11 rue 2026" (+61.78 €)
   - Solde après réconciliation : 287.44 €
   - Net dû après : 712.56 €
3. Les fonctions find_unreconciled_expenses et reconcile_member_expenses du script.
"""

import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.models import Member, MemberExpense, MemberLedgerEntry, BankAccount
from app.security import create_access_token
from app.services.treasury_service import add_ledger_entry, get_member_balance
from app.services.call_for_funds_service import calculate_member_call_for_funds
from scripts.reconcile_nov2026_ledger import (
    find_unreconciled_expenses,
    reconcile_member_expenses
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
def coordinator_token():
    return create_access_token({"sub": "Henri", "user_id": 1, "is_coordinator": True})


@pytest.fixture
def coordinator_headers(coordinator_token):
    return {"Authorization": f"Bearer {coordinator_token}"}


def test_put_expense_creates_ledger_entry_idempotently(test_db, client, coordinator_headers):
    """
    Vérifie qu'un PUT /api/finances/expenses/{id} passant une avance membre à status='PAID'
    crée bien l'écriture MemberLedgerEntry(entry_type='AVANCE') de manière strictement idempotente.
    """
    # 1. Créer une avance en attente
    member = test_db.query(Member).filter(Member.prenom == "Frédéric").first()
    assert member is not None

    exp = MemberExpense(
        member_id=member.id,
        member_prenom=member.prenom,
        payer_type="member",
        expense_date="2026-10-25",
        title="Test Avance Matériel Bricolage",
        amount=120.50,
        category="Entretien",
        status="PENDING"
    )
    test_db.add(exp)
    test_db.commit()
    test_db.refresh(exp)

    # Vérifier qu'aucune écriture de grand livre n'existe pour cette dépense
    ledger_entries = test_db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.expense_id == exp.id,
        MemberLedgerEntry.entry_type == "AVANCE"
    ).all()
    assert len(ledger_entries) == 0

    # 2. Premier PUT pour passer à status='PAID'
    resp = client.put(
        f"/api/finances/expenses/{exp.id}",
        json={"status": "PAID"},
        headers=coordinator_headers
    )
    assert resp.status_code == 200

    # Vérifier la création de l'entrée au grand livre
    ledger_entries = test_db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.expense_id == exp.id,
        MemberLedgerEntry.entry_type == "AVANCE"
    ).all()
    assert len(ledger_entries) == 1
    assert ledger_entries[0].amount == 120.50
    assert ledger_entries[0].member_id == member.id

    # 3. Deuxième PUT avec le même statut ou mise à jour de notes (vérification d'idempotence)
    resp2 = client.put(
        f"/api/finances/expenses/{exp.id}",
        json={"status": "PAID", "notes": "Note complémentaire"},
        headers=coordinator_headers
    )
    assert resp2.status_code == 200

    # L'écriture au grand livre ne doit pas être dupliquée
    ledger_entries_after = test_db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.expense_id == exp.id,
        MemberLedgerEntry.entry_type == "AVANCE"
    ).all()
    assert len(ledger_entries_after) == 1


def test_frederic_nov2026_call_reconciliation_math(test_db):
    """
    Vérifie le calcul complet de l'appel de fonds de Frédéric Jamet pour Novembre 2026 :
    - Avance sepase rosing 2026 (+225.66 €)
    - Echéance octobre (-1000.0 €)
    - Virement octobre (+1000.0 €)
    - Solde avant réconciliation : 225.66 €
    - Appel de fonds théorique : 1000.00 €
    - Net réclamé avant réconciliation : 774.34 €
    - Réconciliation avance Sepase Annexe 11 rue 2026 (+61.78 €)
    - Solde après réconciliation : 287.44 €
    - Net réclamé après réconciliation : 712.56 €
    """
    frederic = test_db.query(Member).filter(Member.prenom == "Frédéric").first()
    assert frederic is not None
    frederic.monthly_contribution = 1000.0
    test_db.commit()

    # Nettoyer d'éventuelles écritures antérieures sur ce membre
    test_db.query(MemberLedgerEntry).filter(MemberLedgerEntry.member_id == frederic.id).delete()
    test_db.commit()

    # 1. Écriture avance "sepase rosing 2026" (+225.66 €)
    add_ledger_entry(
        db=test_db,
        member_id=frederic.id,
        entry_type="AVANCE",
        amount=225.66,
        description="Avance validée : sepase rosing 2026",
        entry_date=datetime(2026, 9, 20)
    )

    # 2. Échéance octobre 2026 (-1000.0 €)
    add_ledger_entry(
        db=test_db,
        member_id=frederic.id,
        entry_type="ECHEANCE",
        amount=-1000.00,
        description="Quote-part Octobre 2026",
        entry_date=datetime(2026, 10, 1)
    )

    # 3. Virement octobre 2026 (+1000.0 €)
    add_ledger_entry(
        db=test_db,
        member_id=frederic.id,
        entry_type="VIREMENT",
        amount=1000.00,
        description="Virement reçu Octobre 2026",
        entry_date=datetime(2026, 10, 5)
    )

    # Vérification du solde avant réconciliation
    bal_before = get_member_balance(test_db, frederic.id)
    assert bal_before == 225.66

    # Calcul de l'appel de fonds avant réconciliation pour Novembre 2026
    call_before = calculate_member_call_for_funds(test_db, frederic, 2026, 11)
    assert call_before["balance_before"] == 225.66
    assert call_before["theoretical_contribution"] == 1000.00
    assert call_before["net_amount"] == 774.34

    # 4. Création de la dépense orpheline Sepase Annexe 11 rue 2026 (id=9, 61.78 €, PAID)
    exp_orphan = MemberExpense(
        id=9,
        member_id=frederic.id,
        member_prenom=frederic.prenom,
        payer_type="member",
        expense_date="2026-10-26",
        title="Sepase Annexe 11 rue 2026",
        amount=61.78,
        category="Assainissement",
        status="PAID"
    )
    test_db.add(exp_orphan)
    test_db.commit()

    # Détection par le script
    unrec = find_unreconciled_expenses(test_db)
    assert len(unrec) >= 1
    assert any(e.id == 9 for e in unrec)

    # Simulation dry-run
    results_dry = reconcile_member_expenses(test_db, dry_run=True)
    assert any(r["expense_id"] == 9 and not r["applied"] for r in results_dry)
    # Vérifier que rien n'a été inséré
    assert get_member_balance(test_db, frederic.id) == 225.66

    # 5. Application réelle de la réconciliation
    results_applied = reconcile_member_expenses(test_db, dry_run=False)
    assert any(r["expense_id"] == 9 and r["applied"] for r in results_applied)

    # Vérification du nouveau solde
    bal_after = get_member_balance(test_db, frederic.id)
    assert bal_after == 287.44

    # Calcul de l'appel de fonds après réconciliation pour Novembre 2026
    call_after = calculate_member_call_for_funds(test_db, frederic, 2026, 11)
    assert call_after["balance_before"] == 287.44
    assert call_after["net_amount"] == 712.56

    # Idempotence : une 2e passe ne doit rien trouver et ne rien modifier
    unrec_after = find_unreconciled_expenses(test_db)
    assert not any(e.id == 9 for e in unrec_after)
    reconcile_member_expenses(test_db, dry_run=False)
    assert get_member_balance(test_db, frederic.id) == 287.44
