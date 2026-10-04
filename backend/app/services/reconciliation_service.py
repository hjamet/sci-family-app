import re
import json
import logging
import unicodedata
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from ..models import Member, BankTransaction, CallForFunds, MemberLedgerEntry
from .treasury_service import add_ledger_entry

logger = logging.getLogger(__name__)


def normalize_alphanumeric(text: Optional[str]) -> str:
    """
    Supprime les accents, les espaces, les tirets et la ponctuation,
    et passe la chaîne en majuscules pour une comparaison tolérante.
    Ex: 'HLV-HENRI' -> 'HLVHENRI', 'AF-202610-HENRI' -> 'AF202610HENRI', 'Frédéric' -> 'FREDERIC'.
    """
    if not text:
        return ""
    # Dé-accentuation NFKD
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_text = nfkd.encode("ASCII", "ignore").decode("utf-8")
    # Conserver uniquement les caractères alphanumériques
    return re.sub(r"[^A-Za-z0-9]", "", ascii_text).upper()


class ReconciliationService:
    @staticmethod
    def normalize(text: Optional[str]) -> str:
        return normalize_alphanumeric(text)

    @classmethod
    def run_reconciliation(cls, db: Session) -> Dict[str, Any]:
        """
        Exécute l'automate de lettrage bancaire sur toutes les transactions créditrices :
        - Vérifie l'unicité stricte (aucune transaction déjà lettrée n'est re-créditée).
        - Niveau 1 (Certifié) : Référence normalisée (permanente ou mensuelle) trouvée.
        - Niveau 2 (À vérifier) : Nom de l'émetteur (debtor_name) correspondant à un membre.
        """
        members = db.query(Member).all()
        # Préparer les signatures des membres
        member_lookup = {}
        for m in members:
            # Référence permanente
            norm_pref = cls.normalize(m.payment_reference or f"HLV-{m.prenom}")
            # Prénom normalisé
            norm_prenom = cls.normalize(m.prenom)
            # Nom complet normalisé
            norm_fullname = cls.normalize(m.name)
            member_lookup[m.id] = {
                "member": m,
                "norm_pref": norm_pref,
                "norm_prenom": norm_prenom,
                "norm_fullname": norm_fullname
            }

        # Transactions créditrices (amount > 0)
        transactions = db.query(BankTransaction).filter(
            BankTransaction.amount > 0
        ).order_by(BankTransaction.booking_date.asc(), BankTransaction.id.asc()).all()

        level_1_matches = []
        level_2_pending = []
        already_reconciled = 0
        unmatched = []

        for tx in transactions:
            # 1. Contrainte d'unicité absolue : vérifier si déjà inscrite au grand livre
            existing_entry = db.query(MemberLedgerEntry).filter(
                MemberLedgerEntry.bank_transaction_id == tx.id
            ).first()
            if existing_entry:
                already_reconciled += 1
                continue

            # Extraire les champs textuels de la transaction
            remittance = tx.remittance_information or ""
            debtor = tx.debtor_name or ""
            raw_str = tx.raw_json or ""
            
            combined_text = f"{remittance} {raw_str}"
            norm_combined = cls.normalize(combined_text)
            norm_debtor = cls.normalize(debtor)

            matched_member = None
            match_type = None
            matched_ref = None

            # --- NIVEAU 1 : RÉFÉRENCE FORMELLE ---
            # 1.1 Recherche par référence permanente (ex: HLV-HENRI -> HLVHENRI)
            for m_id, m_info in member_lookup.items():
                if m_info["norm_pref"] and m_info["norm_pref"] in norm_combined:
                    matched_member = m_info["member"]
                    match_type = "PERMANENT_REFERENCE"
                    matched_ref = m_info["norm_pref"]
                    break

            # 1.2 Recherche par référence mensuelle canonique (ex: AF-202610-HENRI, AF-102026-HENRI, AF-HENRI)
            if not matched_member:
                for m_id, m_info in member_lookup.items():
                    prenom_norm = m_info["norm_prenom"]
                    # Pattern AF + éventuel millésime 4 ou 6 chiffres + Prénom
                    pattern = rf"AF(?:\d{{4,6}})?{prenom_norm}"
                    if re.search(pattern, norm_combined):
                        matched_member = m_info["member"]
                        match_type = "MONTHLY_REFERENCE"
                        matched_ref = f"AF-{prenom_norm}"
                        break

            # 1.3 Recherche par numéro d'avis d'appel de fonds (ex: CFF-202610-01, CFF-1)
            if not matched_member:
                cff_match = re.search(r"CFF(?:(\d{6}))?(\d+)", norm_combined)
                if cff_match:
                    try:
                        cff_id = int(cff_match.group(2))
                        cff_rec = db.query(CallForFunds).filter(CallForFunds.id == cff_id).first()
                        if cff_rec and cff_rec.member_id in member_lookup:
                            matched_member = member_lookup[cff_rec.member_id]["member"]
                            match_type = "CALL_FOR_FUNDS_NUMBER"
                            matched_ref = f"CFF-{cff_id}"
                    except Exception:
                        pass

            # Si match Niveau 1 certifié
            if matched_member:
                # Écriture immédiate au grand livre
                entry_date = None
                if tx.booking_date:
                    try:
                        entry_date = datetime.strptime(tx.booking_date, "%Y-%m-%d")
                    except Exception:
                        pass

                ledger_entry = add_ledger_entry(
                    db=db,
                    member_id=matched_member.id,
                    entry_type="VIREMENT",
                    amount=float(tx.amount),
                    description=f"Virement bancaire lettré auto ({matched_ref}) : {tx.amount:.2f} €",
                    bank_transaction_id=tx.id,
                    entry_date=entry_date
                )

                # Rapprochement d'un éventuel avis d'appel de fonds en attente pour ce membre
                pending_call = db.query(CallForFunds).filter(
                    CallForFunds.member_id == matched_member.id,
                    CallForFunds.status.in_(["EMIS", "PENDING_SWAN_IBAN"])
                ).order_by(CallForFunds.year.asc(), CallForFunds.month.asc()).first()

                if pending_call:
                    pending_call.status = "REGLE"
                    pending_call.bank_transaction_id = tx.id
                    pending_call.paid_at = entry_date or datetime.utcnow()
                    db.commit()

                # Mise à jour des métadonnées de la transaction
                try:
                    meta = json.loads(tx.raw_json) if tx.raw_json else {}
                    meta["reconciliation"] = {
                        "status": "MATCHED",
                        "level": 1,
                        "type": match_type,
                        "matched_ref": matched_ref,
                        "member_id": matched_member.id,
                        "member_prenom": matched_member.prenom,
                        "matched_at": datetime.utcnow().isoformat()
                    }
                    tx.raw_json = json.dumps(meta, ensure_ascii=False)
                    db.commit()
                except Exception as meta_err:
                    logger.warning(f"Notice meta reconciliation tx {tx.id}: {meta_err}")

                level_1_matches.append({
                    "transaction_id": tx.id,
                    "amount": tx.amount,
                    "member_id": matched_member.id,
                    "member_prenom": matched_member.prenom,
                    "matched_ref": matched_ref,
                    "match_type": match_type
                })
                continue

            # --- NIVEAU 2 : NOM DE L'ÉMETTEUR (DEBTOR_NAME) ---
            candidate_member = None
            if norm_debtor:
                for m_id, m_info in member_lookup.items():
                    if len(m_info["norm_prenom"]) >= 3 and m_info["norm_prenom"] in norm_debtor:
                        candidate_member = m_info["member"]
                        break
                    elif len(m_info["norm_fullname"]) >= 5 and m_info["norm_fullname"] in norm_debtor:
                        candidate_member = m_info["member"]
                        break

            if candidate_member:
                # Placer dans la file « à vérifier par Henri » sans crédit automatique
                try:
                    meta = json.loads(tx.raw_json) if tx.raw_json else {}
                    meta["reconciliation"] = {
                        "status": "PENDING_VERIFICATION",
                        "level": 2,
                        "candidate_member_id": candidate_member.id,
                        "candidate_member_prenom": candidate_member.prenom,
                        "debtor_name": debtor
                    }
                    tx.raw_json = json.dumps(meta, ensure_ascii=False)
                    db.commit()
                except Exception:
                    pass

                level_2_pending.append({
                    "transaction_id": tx.id,
                    "amount": tx.amount,
                    "booking_date": tx.booking_date,
                    "debtor_name": debtor,
                    "remittance_information": remittance,
                    "candidate_member_id": candidate_member.id,
                    "candidate_member_prenom": candidate_member.prenom
                })
            else:
                unmatched.append({
                    "transaction_id": tx.id,
                    "amount": tx.amount,
                    "booking_date": tx.booking_date,
                    "debtor_name": debtor,
                    "remittance_information": remittance
                })

        logger.info(
            f"[RECONCILIATION] {len(level_1_matches)} certifiés (N1), "
            f"{len(level_2_pending)} à vérifier (N2), {len(unmatched)} non appariés, "
            f"{already_reconciled} déjà lettrés."
        )

        return {
            "success": True,
            "level_1_matches": level_1_matches,
            "level_2_pending": level_2_pending,
            "unmatched": unmatched,
            "already_reconciled": already_reconciled,
            "total_processed": len(transactions)
        }

    @classmethod
    def get_unmatched_and_pending_transactions(cls, db: Session) -> Dict[str, Any]:
        """
        Retourne la liste des transactions non encore lettrées avec la file de vérification (Niveau 2).
        """
        # Récupérer les transactions créditrices sans écriture de grand livre
        reconciled_tx_ids = set(
            row[0] for row in db.query(MemberLedgerEntry.bank_transaction_id).filter(
                MemberLedgerEntry.bank_transaction_id.isnot(None)
            ).all()
        )

        unreconciled_txs = db.query(BankTransaction).filter(
            BankTransaction.amount > 0,
            ~BankTransaction.id.in_(reconciled_tx_ids) if reconciled_tx_ids else True
        ).order_by(BankTransaction.booking_date.desc()).all()

        pending_verification = []
        unmatched = []

        for tx in unreconciled_txs:
            meta = {}
            if tx.raw_json:
                try:
                    meta = json.loads(tx.raw_json)
                except Exception:
                    pass

            rec_data = meta.get("reconciliation", {})
            if rec_data.get("status") == "PENDING_VERIFICATION":
                pending_verification.append({
                    "id": tx.id,
                    "booking_date": tx.booking_date,
                    "amount": tx.amount,
                    "debtor_name": tx.debtor_name,
                    "remittance_information": tx.remittance_information,
                    "candidate_member_id": rec_data.get("candidate_member_id"),
                    "candidate_member_prenom": rec_data.get("candidate_member_prenom")
                })
            else:
                unmatched.append({
                    "id": tx.id,
                    "booking_date": tx.booking_date,
                    "amount": tx.amount,
                    "debtor_name": tx.debtor_name,
                    "remittance_information": tx.remittance_information
                })

        return {
            "pending_verification": pending_verification,
            "unmatched": unmatched,
            "total_unreconciled": len(unreconciled_txs)
        }

    @classmethod
    def assign_transaction_manually(
        cls,
        db: Session,
        transaction_id: int,
        member_id: int,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Attribution manuelle certifiée d'un virement à un membre par Henri.
        Crée l'écriture au grand livre, rapproche les appels si possible, et met à jour les métadonnées.
        """
        tx = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
        if not tx:
            raise ValueError(f"Transaction bancaire #{transaction_id} introuvable.")

        member = db.query(Member).filter(Member.id == member_id).first()
        if not member:
            raise ValueError(f"Membre #{member_id} introuvable.")

        # Vérification d'unicité
        existing = db.query(MemberLedgerEntry).filter(
            MemberLedgerEntry.bank_transaction_id == tx.id
        ).first()
        if existing:
            raise ValueError(f"Cette transaction #{tx.id} a déjà été lettrée pour le membre #{existing.member_id}.")

        entry_date = None
        if tx.booking_date:
            try:
                entry_date = datetime.strptime(tx.booking_date, "%Y-%m-%d")
            except Exception:
                pass

        ledger_entry = add_ledger_entry(
            db=db,
            member_id=member.id,
            entry_type="VIREMENT",
            amount=float(tx.amount),
            description=f"Virement lettré manuellement ({member.prenom}) : {tx.amount:.2f} €",
            bank_transaction_id=tx.id,
            entry_date=entry_date
        )

        # Rapprochement appel en attente
        pending_call = db.query(CallForFunds).filter(
            CallForFunds.member_id == member.id,
            CallForFunds.status.in_(["EMIS", "PENDING_SWAN_IBAN"])
        ).order_by(CallForFunds.year.asc(), CallForFunds.month.asc()).first()

        if pending_call:
            pending_call.status = "REGLE"
            pending_call.bank_transaction_id = tx.id
            pending_call.paid_at = entry_date or datetime.utcnow()
            db.commit()

        # Métadonnées
        try:
            meta = json.loads(tx.raw_json) if tx.raw_json else {}
            meta["reconciliation"] = {
                "status": "MATCHED",
                "level": "MANUAL",
                "member_id": member.id,
                "member_prenom": member.prenom,
                "notes": notes,
                "assigned_at": datetime.utcnow().isoformat()
            }
            tx.raw_json = json.dumps(meta, ensure_ascii=False)
            db.commit()
        except Exception:
            pass

        return {
            "success": True,
            "message": f"Transaction #{tx.id} de {tx.amount:.2f} € attribuée avec succès à {member.prenom}.",
            "ledger_entry_id": ledger_entry.id,
            "member_id": member.id,
            "member_prenom": member.prenom,
            "amount": tx.amount
        }
