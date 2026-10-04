import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ..models import Member, MemberLedgerEntry, BankAccount
from .call_for_funds_service import is_bank_account_active, get_official_bank_info

logger = logging.getLogger(__name__)


def get_member_balance(db: Session, member_id: int) -> float:
    """
    Calcule le solde cumulé illimité de la trésorerie du membre :
    + avances validées (entry_type='AVANCE')
    + virements bancaires lettrés (entry_type='VIREMENT')
    - cotisations mensuelles (entry_type='ECHEANCE')
    +/- régularisations manuelles (entry_type='AJUSTEMENT')
    """
    total = db.query(func.sum(MemberLedgerEntry.amount)).filter(
        MemberLedgerEntry.member_id == member_id
    ).scalar()
    return round(float(total or 0.0), 2)


def get_member_covered_months(balance: float, monthly_contribution: float = 50.0) -> int:
    """
    Calcule le nombre de mois d'échéances futures intégralement couverts par le solde créditeur.
    Ex: 150 € / 50 € = 3 mois ; 600 € / 50 € = 12 mois.
    """
    if monthly_contribution <= 0 or balance <= 0:
        return 0
    return max(0, int(balance // monthly_contribution))


def add_ledger_entry(
    db: Session,
    member_id: int,
    entry_type: str,
    amount: float,
    description: Optional[str] = None,
    expense_id: Optional[int] = None,
    bank_transaction_id: Optional[int] = None,
    call_for_funds_id: Optional[int] = None,
    entry_date: Optional[datetime] = None
) -> MemberLedgerEntry:
    """
    Enregistre une écriture comptable dans le grand livre de trésorerie du membre.
    entry_type: 'AVANCE', 'VIREMENT', 'ECHEANCE', 'AJUSTEMENT'.
    amount: positif pour crédit (+), négatif pour débit (-).
    """
    current_balance = get_member_balance(db, member_id)
    new_balance = round(current_balance + amount, 2)

    entry = MemberLedgerEntry(
        member_id=member_id,
        entry_type=entry_type,
        amount=round(amount, 2),
        balance_after=new_balance,
        description=description,
        expense_id=expense_id,
        bank_transaction_id=bank_transaction_id,
        call_for_funds_id=call_for_funds_id,
        entry_date=entry_date or datetime.utcnow()
    )
    try:
        db.add(entry)
        db.commit()
        db.refresh(entry)
    except IntegrityError as ie:
        db.rollback()
        logger.warning(
            f"[TREASURY CONFLICT] Contrainte d'unicité violée lors de l'enregistrement de l'écriture {entry_type}: {ie}"
        )
        if bank_transaction_id:
            existing = db.query(MemberLedgerEntry).filter(MemberLedgerEntry.bank_transaction_id == bank_transaction_id).first()
            if existing:
                return existing
        if expense_id:
            existing = db.query(MemberLedgerEntry).filter(MemberLedgerEntry.expense_id == expense_id).first()
            if existing:
                return existing
        raise
    logger.info(
        f"[TREASURY] Membre #{member_id} | {entry_type} | Montant: {amount:+.2f} € | Nouveau solde: {new_balance:.2f} €"
    )
    return entry


def get_member_treasury_summary(db: Session, member: Member) -> Dict[str, Any]:
    """
    Retourne le récapitulatif complet de la trésorerie pour un associé :
    - solde cumulé
    - nombre d'échéances couvertes
    - coordonnées bancaires (IBAN, BIC ou bandeau temporaire)
    - référence permanente normalisée
    - historique des dernières écritures
    """
    balance = get_member_balance(db, member.id)
    monthly_contrib = float(member.monthly_contribution or 50.0)
    covered_months = get_member_covered_months(balance, monthly_contrib)

    # Référence permanente du membre (normalisée sans accents)
    payment_ref = member.payment_reference or f"HLV-{member.prenom.upper()}"

    bank_active = is_bank_account_active(db)
    bank_info = get_official_bank_info(db)

    # Récupération des dernières écritures
    entries = db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.member_id == member.id
    ).order_by(
        MemberLedgerEntry.entry_date.desc(),
        MemberLedgerEntry.id.desc()
    ).limit(30).all()

    formatted_entries = []
    for e in entries:
        formatted_entries.append({
            "id": e.id,
            "entry_type": e.entry_type,
            "amount": e.amount,
            "balance_after": e.balance_after,
            "entry_date": e.entry_date.isoformat() if e.entry_date else None,
            "description": e.description,
            "expense_id": e.expense_id,
            "bank_transaction_id": e.bank_transaction_id,
            "call_for_funds_id": e.call_for_funds_id
        })

    return {
        "member_id": member.id,
        "member_name": member.name,
        "prenom": member.prenom,
        "balance": balance,
        "monthly_contribution": monthly_contrib,
        "covered_months": covered_months,
        "payment_reference": payment_ref,
        "is_bank_active": bank_active,
        "bank_status_notice": (
            "Coordonnées bancaires opérationnelles"
            if bank_active
            else "Compte bancaire en cours d'ouverture — coordonnées bientôt disponibles"
        ),
        "iban": bank_info.get("iban") if bank_active else None,
        "bic": bank_info.get("bic") if bank_active else None,
        "beneficiary": "SCI Hellenvilliers",
        "recent_entries": formatted_entries
    }


def get_all_treasury_summaries(db: Session) -> Dict[str, Any]:
    """
    Pour l'espace Administrateur :
    - Soldes de l'ensemble des associés
    - Total de trésorerie disponible
    - Total des échéances couvertes globales
    """
    members = db.query(Member).order_by(Member.id.asc()).all()
    summaries = [get_member_treasury_summary(db, m) for m in members]

    total_treasury = round(sum(s["balance"] for s in summaries), 2)
    bank_active = is_bank_account_active(db)
    bank_info = get_official_bank_info(db)

    return {
        "total_treasury": total_treasury,
        "is_bank_active": bank_active,
        "bank_status_notice": (
            "Coordonnées bancaires opérationnelles"
            if bank_active
            else "Compte bancaire en cours d'ouverture — coordonnées bientôt disponibles"
        ),
        "members": summaries
    }
