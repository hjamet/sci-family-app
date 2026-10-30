"""
Script 1-clic de réconciliation du grand livre pour les appels de fonds de Novembre 2026.
Détecte et crédite les avances de frais membres approuvées/payées/validées orphelines
(n'ayant pas encore d'écriture MemberLedgerEntry de type 'AVANCE').

Usage :
  python backend/scripts/reconcile_nov2026_ledger.py            # Mode --dry-run (lecture seule par défaut)
  python backend/scripts/reconcile_nov2026_ledger.py --apply    # Application réelle en base
"""

import os
import sys
import argparse
from typing import List, Dict, Any, Optional
from datetime import datetime

# Assurer l'accès au package backend
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.models import Member, MemberExpense, MemberLedgerEntry
from app.services.treasury_service import add_ledger_entry, get_member_balance
from app.services.call_for_funds_service import (
    calculate_member_call_for_funds,
    reconcile_open_calls_for_member,
    is_bank_account_active
)


def find_unreconciled_expenses(db: Session) -> List[MemberExpense]:
    """
    Identifie toutes les avances de frais membres approuvées/payées/validées
    qui n'ont pas encore été créditées au grand livre individuel (MemberLedgerEntry).
    """
    all_expenses = db.query(MemberExpense).all()
    unreconciled = []

    for exp in all_expenses:
        st = (exp.status or "").strip().upper()
        payer = (exp.payer_type or "member").strip().lower()
        if st in ("APPROVED", "PAID", "VALIDATED") and payer != "sci" and exp.member_id:
            # Vérifier présence dans MemberLedgerEntry
            has_ledger = db.query(MemberLedgerEntry).filter(
                MemberLedgerEntry.expense_id == exp.id,
                MemberLedgerEntry.entry_type == "AVANCE"
            ).first()
            if not has_ledger:
                unreconciled.append(exp)

    return unreconciled


def reconcile_member_expenses(db: Session, dry_run: bool = True) -> List[Dict[str, Any]]:
    """
    Réconcilie les avances orphelines. En dry_run=True, aucune écriture n'est persistée.
    """
    unreconciled = find_unreconciled_expenses(db)
    results = []

    for exp in unreconciled:
        member = db.query(Member).filter(Member.id == exp.member_id).first()
        member_name = f"{member.prenom} {member.name}" if member else f"Membre #{exp.member_id}"
        item = {
            "expense_id": exp.id,
            "member_id": exp.member_id,
            "member_name": member_name,
            "title": exp.title,
            "amount": float(exp.amount),
            "status": exp.status,
            "task_id": exp.task_id,
            "applied": False
        }
        if not dry_run:
            add_ledger_entry(
                db=db,
                member_id=exp.member_id,
                entry_type="AVANCE",
                amount=float(exp.amount),
                description=f"Avance validée : {exp.title}",
                expense_id=exp.id
            )
            reconcile_open_calls_for_member(db, exp.member_id)
            item["applied"] = True

        results.append(item)

    return results


def display_calls_summary(db: Session, title: str, extra_balances: Optional[Dict[int, float]] = None):
    """
    Affiche le récapitulatif des appels de fonds pour Novembre 2026 pour tous les membres.
    Si extra_balances est fourni (en simulation dry-run), ajuste le solde calculé.
    """
    print(f"\n--- {title} (Novembre 2026) ---")
    members = db.query(Member).order_by(Member.id).all()
    print(f"{'ID':<4} | {'Membre':<22} | {'Quote-part':<12} | {'Solde Avant':<12} | {'Net Réclamé':<12} | {'Statut'}")
    print("-" * 80)

    for m in members:
        call = calculate_member_call_for_funds(db, m, 2026, 11)
        bal = call["balance_before"]
        theo = call["theoretical_contribution"]

        if extra_balances and m.id in extra_balances:
            bal = round(bal + extra_balances[m.id], 2)
            if theo <= 0:
                net = 0.0
                st = "COUVERT"
            elif bal >= theo:
                net = 0.0
                st = "COUVERT"
            elif bal > 0:
                net = round(theo - bal, 2)
                st = call["status"]
            else:
                net = theo
                st = call["status"]
        else:
            net = call["net_amount"]
            st = call["status"]

        m_name = m.name if m.name else (m.prenom or f"Membre #{m.id}")
        print(f"{m.id:<4} | {m_name:<22} | {theo:>8.2f} € | {bal:>8.2f} € | {net:>8.2f} € | {st}")


def main():
    parser = argparse.ArgumentParser(description="Réconciliation Grand Livre & Appels de Fonds Novembre 2026")
    parser.add_argument("--apply", action="store_true", help="Applique réellement les écritures au Grand Livre")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Mode lecture seule sans écriture (par défaut)")
    parser.add_argument("--db-url", type=str, default=None, help="URL de la base de données cible (optionnel)")
    args = parser.parse_args()

    is_dry_run = not args.apply

    mode_str = "[DRY-RUN - LECTURE SEULE]" if is_dry_run else "[APPLY - APPLICATION REELLE]"
    print(f"=== {mode_str} Script de Réconciliation du Grand Livre (Novembre 2026) ===")

    # Déterminer la connexion DB
    if args.db_url:
        db_url = args.db_url
    else:
        env_file = os.path.join(BACKEND_DIR, ".env")
        load_dotenv(env_file)
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            print("Erreur: DATABASE_URL introuvable dans backend/.env.")
            sys.exit(1)

    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+pg8000://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
        db_url = db_url.replace("postgresql://", "postgresql+pg8000://", 1)

    engine = create_engine(db_url)
    SessionClass = sessionmaker(bind=engine)
    session = SessionClass()

    try:
        # 1. Détection des avances orphelines
        unreconciled = find_unreconciled_expenses(session)
        print(f"\nAvances orphelines détectées : {len(unreconciled)}")
        for exp in unreconciled:
            m = session.query(Member).filter(Member.id == exp.member_id).first()
            prenom = m.prenom if m else f"#{exp.member_id}"
            print(f"  * Dépense #{exp.id} | Membre: {prenom} | Titre: '{exp.title}' | Montant: {exp.amount:.2f} € | Statut: {exp.status} | Task ID: {exp.task_id}")

        # 2. Récapitulatif avant réconciliation
        display_calls_summary(session, "AVANT réconciliation")

        # 3. Application ou simulation
        if is_dry_run:
            extra_sim = {}
            for exp in unreconciled:
                extra_sim[exp.member_id] = extra_sim.get(exp.member_id, 0.0) + float(exp.amount)
            display_calls_summary(session, "APRÈS réconciliation (SIMULATION DRY-RUN)", extra_balances=extra_sim)
            print("\n[INFO] Mode --dry-run : aucune écriture n'a été insérée en base.")
            print("[INFO] Pour persister ces écritures, relancez avec : python backend/scripts/reconcile_nov2026_ledger.py --apply")
        else:
            reconcile_results = reconcile_member_expenses(session, dry_run=False)
            print(f"\n[SUCCÈS] {len(reconcile_results)} écriture(s) ajoutée(s) au Grand Livre.")
            display_calls_summary(session, "APRÈS réconciliation (RÉEL)")

    except Exception as e:
        session.rollback()
        print(f"\nErreur durant la réconciliation : {e}")
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
