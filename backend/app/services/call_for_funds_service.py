import os
import io
import json
import logging
try:
    import qrcode
except ImportError:
    qrcode = None
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import extract, or_, and_

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    REPORTLAB_AVAILABLE = True
except ImportError:
    A4 = None
    colors = None
    SimpleDocTemplate = None
    Paragraph = Spacer = Table = TableStyle = Image = KeepTogether = HRFlowable = None
    getSampleStyleSheet = ParagraphStyle = cm = None
    REPORTLAB_AVAILABLE = False

from ..models import Member, BankAccount, BankTransaction, AdminDocument, CallForFunds, MemberExpense

logger = logging.getLogger("call_for_funds_service")

# --- Constantes Institutionnelles SCI Hellenvilliers ---
SCI_NAME = "SCI HELLENVILLIERS"
SCI_SIREN = "977 529 312"
SCI_RCS = "R.C.S. Évreux"
SCI_CAPITAL = "390 000,00 €"
SCI_ADDRESS = "8 rue de l'Ancienne Mairie, Hellenvilliers, 27240 Mesnil-sur-Iton"
SCI_EMAIL = "hellenvillierssci@gmail.com"
DEFAULT_BIC = os.getenv("ENABLE_BANKING_ASPSP_BIC", "SWNBFR22")

# Dossier d'archivage des documents d'appels de fonds (isolé des documents administratifs généraux)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCUMENTS_DIR = os.path.join(BASE_DIR, "uploads", "calls_for_funds")
try:
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
except OSError:
    pass

MONTH_NAMES_FR = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]


PLACEHOLDER_IBANS = {
    "FR7616945000000000000000000",
    "PENDING_SWAN_IBAN",
}


def is_bank_account_active(db: Optional[Session] = None) -> bool:
    """
    GARDE-FOU BANCAIRE STRICT :
    Vérifie si les coordonnées bancaires officielles Indy / Swan de la SCI sont validées et actives.
    Inspecte directement tous les comptes de `bank_accounts` : dès qu'un compte possède un IBAN
    non vide dont la version normalisée n'est pas dans PLACEHOLDER_IBANS et ne commence pas
    par FR7600000000, retourne True.
    """
    if db is not None:
        accounts = db.query(BankAccount).all()
        for account in accounts:
            if not account or not account.iban:
                continue
            clean_iban = account.iban.replace(" ", "").strip().upper()
            if (
                clean_iban
                and clean_iban not in PLACEHOLDER_IBANS
                and not clean_iban.startswith("FR7600000000")
                and "000000000000" not in clean_iban
            ):
                return True
        return False

    return os.getenv("IS_BANK_ACCOUNT_ACTIVE", "false").strip().lower() in ("true", "1", "yes")


def is_treasury_contributions_started(year: int, month: int, db: Optional[Session] = None) -> bool:
    """
    RÈGLE D'OR HENRI :
    AUCUNE échéance n'est débitée du grand livre de trésorerie tant que :
    1. Le compte bancaire officiel de la SCI n'est pas actif (verrou PENDING_SWAN_IBAN / is_bank_account_active).
    2. La période (year, month) n'a pas atteint la date de début paramétrable (TREASURY_START_PERIOD).
    Les membres ne doivent JAMAIS apparaître « Débiteur » avant de pouvoir payer sur le compte actif.
    """
    if not is_bank_account_active(db):
        return False

    start_env = os.getenv("TREASURY_START_PERIOD", "").strip()
    if start_env:
        try:
            import re
            parts = [int(p) for p in re.findall(r"\d+", start_env)]
            if len(parts) >= 2:
                start_y, start_m = parts[0], parts[1]
                if (year, month) < (start_y, start_m):
                    return False
            elif len(parts) == 1 and len(str(parts[0])) == 4:
                if year < parts[0]:
                    return False
        except Exception as e:
            logger.warning(f"Erreur parsing TREASURY_START_PERIOD: {e}")
    return True


def get_official_bank_info(db: Optional[Session] = None) -> Dict[str, str]:
    """Récupère les coordonnées bancaires officielles ou les coordonnées en attente."""
    iban = "FR76 1694 5000 0000 0000 0000 000"
    bic = DEFAULT_BIC
    bank_name = "Indy / Swan (BNP Paribas)"
    holder = SCI_NAME

    if db is not None:
        accounts = db.query(BankAccount).all()
        chosen = None
        for acc in accounts:
            if acc and acc.iban:
                clean = acc.iban.replace(" ", "").strip().upper()
                if clean and clean not in PLACEHOLDER_IBANS and not clean.startswith("FR7600000000"):
                    chosen = acc
                    break
        if not chosen and accounts:
            chosen = accounts[0]
        if chosen:
            if chosen.iban:
                iban = chosen.iban
            if chosen.aspsp_name:
                bank_name = chosen.aspsp_name

    return {
        "iban": iban,
        "bic": bic,
        "bank_name": bank_name,
        "holder": holder
    }


def generate_epc_qr_data(
    iban: str,
    bic: str,
    amount: float,
    beneficiary_name: str,
    remittance_info: str
) -> str:
    """
    Génère la chaîne de données standard EPC QR Code (European Payments Council - EPC069-12 SCT).
    Format officiel :
      Ligne 1: BCD (Service Tag)
      Ligne 2: 002 (Version)
      Ligne 3: 1 (Character set: 1=UTF-8)
      Ligne 4: SCT (SEPA Credit Transfer)
      Ligne 5: BIC de la banque bénéficiaire
      Ligne 6: Nom du bénéficiaire (max 70 chars)
      Ligne 7: IBAN du compte bénéficiaire sans espaces
      Ligne 8: Montant au format EURxx.xx
      Ligne 9: Purpose code (optionnel)
      Ligne 10: Référence structurée (optionnel)
      Ligne 11: Libellé libre du virement (max 140 chars)
      Ligne 12: Information complémentaire (optionnel)
    """
    clean_iban = iban.replace(" ", "").strip().upper()
    clean_bic = (bic or DEFAULT_BIC).replace(" ", "").strip().upper()
    clean_beneficiary = (beneficiary_name or SCI_NAME).strip()[:70]
    amount_str = f"EUR{amount:.2f}"
    clean_remittance = remittance_info.strip()[:140]

    lines = [
        "BCD",
        "002",
        "1",
        "SCT",
        clean_bic,
        clean_beneficiary,
        clean_iban,
        amount_str,
        "",
        "",
        clean_remittance,
        ""
    ]
    return "\n".join(lines)


def generate_epc_qr_image_bytes(
    iban: str,
    bic: str,
    amount: float,
    beneficiary_name: str,
    remittance_info: str,
    is_specimen: bool = False
) -> bytes:
    """Génère l'image PNG haute résolution du QR-Code EPC SEPA."""
    payload = generate_epc_qr_data(
        iban=iban,
        bic=bic,
        amount=amount,
        beneficiary_name=beneficiary_name,
        remittance_info=remittance_info
    )

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2
    )
    qr.add_data(payload)
    qr.make(fit=True)

    # Teinte émeraude institutionnelle SCI Hellenvilliers
    fill_color = "#064e3b" if not is_specimen else "#475569"
    img = qr.make_image(fill_color=fill_color, back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def get_member_expenses_for_period(
    db: Session,
    member_id: int,
    year: int,
    month: int
) -> List[Dict[str, Any]]:
    """
    Récupère toutes les dépenses avancées enregistrées pour le membre sur le mois spécifié :
    1. Depuis la table `member_expenses` (status in VALIDATED/PAID/APPROVED, du mois ou non encore rattachées à un appel antérieur).
    2. Depuis la table `bank_transactions` (dépenses manuelles rattachées au membre).
    """
    month_str = f"{month:02d}"
    prefix_date = f"{year}-{month_str}"

    member = db.query(Member).filter(Member.id == member_id).first()
    prenom = member.prenom if member else ""
    full_name = member.name if member else prenom

    existing_call = db.query(CallForFunds).filter(
        CallForFunds.member_id == member_id,
        CallForFunds.year == year,
        CallForFunds.month == month
    ).first()
    existing_call_id = existing_call.id if existing_call else None

    expenses = []

    # 1. Dépenses spécifiques dans member_expenses (uniquement avances de frais membres validées, pas les factures directes SCI ni les PENDING)
    period_cond = [MemberExpense.expense_date.like(f"{prefix_date}%")]
    if existing_call_id is not None:
        period_cond.append(MemberExpense.call_for_funds_id == existing_call_id)
    period_cond.append(
        and_(
            MemberExpense.call_for_funds_id.is_(None),
            MemberExpense.expense_date <= f"{prefix_date}-31"
        )
    )

    me_records = db.query(MemberExpense).filter(
        MemberExpense.member_id == member_id,
        MemberExpense.status.in_(["VALIDATED", "PAID", "APPROVED"]),
        or_(MemberExpense.payer_type == "member", MemberExpense.payer_type.is_(None)),
        or_(*period_cond)
    ).all()

    for me in me_records:
        if existing_call_id is not None:
            if me.call_for_funds_id is not None and me.call_for_funds_id != existing_call_id:
                continue
            if (
                existing_call.paid_at is not None
                and me.created_at is not None
                and me.created_at > existing_call.paid_at
                and me.call_for_funds_id != existing_call_id
            ):
                continue
        else:
            if me.call_for_funds_id is not None and not str(me.expense_date or "").startswith(prefix_date):
                continue
        expenses.append({
            "id": me.id,
            "source": "member_expense",
            "title": me.title,
            "amount": float(me.amount),
            "date": me.expense_date,
            "category": me.category,
            "document_id": me.document_id,
            "document_filename": me.document_filename or "Facture jointe"
        })

    # 2. Dépenses manuelles dans bank_transactions enregistrées par ce membre
    try:
        tx_records = db.query(BankTransaction).filter(
            BankTransaction.booking_date.like(f"{prefix_date}%"),
            BankTransaction.amount < 0
        ).all()

        for tx in tx_records:
            is_member_tx = False
            raw = {}
            if tx.raw_json:
                try:
                    raw = json.loads(tx.raw_json)
                    up_by = raw.get("uploaded_by", "").lower()
                    if prenom.lower() in up_by or full_name.lower() in up_by:
                        is_member_tx = True
                except Exception:
                    pass

            if is_member_tx and raw.get("source") == "manual_expense":
                # Éviter les doublons si déjà lié
                doc_id = raw.get("document_id")
                already_in = any(e.get("document_id") == doc_id for e in expenses if doc_id)
                if not already_in:
                    expenses.append({
                        "id": tx.id,
                        "source": "bank_transaction",
                        "title": tx.remittance_information or "Dépense avancée pour la SCI",
                        "amount": abs(float(tx.amount)),
                        "date": tx.booking_date,
                        "category": tx.category or "Dépense Déductible",
                        "document_id": doc_id,
                        "document_filename": raw.get("document_filename", "Justificatif")
                    })
    except Exception as err:
        logger.warning(f"Notice lors de la recherche des dépenses bancaires du membre {member_id}: {err}")

    return expenses


def _compute_balance_before_period(
    db: Session,
    member_id: int,
    year: int,
    month: int
) -> float:
    """
    Calcule de manière idempotente le solde disponible du membre juste avant l'échéance (year, month) :
    exclut l'écriture ECHEANCE de (year, month) et des mois postérieurs, ainsi que les virements
    ayant réglé un appel >= (year, month) ou postérieurs au 1er du mois lorsque des appels existent.
    """
    from ..models import MemberLedgerEntry

    all_entries = db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.member_id == member_id
    ).all()
    if not all_entries:
        return 0.0

    member_calls = db.query(CallForFunds).filter(
        CallForFunds.member_id == member_id
    ).all()
    calls_by_id = {c.id: c for c in member_calls}
    settled_tx_periods = {
        c.bank_transaction_id: (c.year, c.month)
        for c in member_calls
        if c.bank_transaction_id is not None
    }

    member_exps = db.query(MemberExpense).filter(
        MemberExpense.member_id == member_id
    ).all()
    exp_call_periods = {
        e.id: (calls_by_id[e.call_for_funds_id].year, calls_by_id[e.call_for_funds_id].month)
        for e in member_exps
        if e.call_for_funds_id and e.call_for_funds_id in calls_by_id
    }

    period_start = datetime(year, month, 1)
    has_Current_or_later_call = any((c.year, c.month) >= (year, month) for c in member_calls)

    total = 0.0
    for entry in all_entries:
        etype = (entry.entry_type or "").upper()
        if etype == "ECHEANCE":
            if entry.call_for_funds_id and entry.call_for_funds_id in calls_by_id:
                c = calls_by_id[entry.call_for_funds_id]
                if (c.year, c.month) >= (year, month):
                    continue
            elif entry.entry_date and entry.entry_date >= period_start:
                continue
        elif etype == "VIREMENT":
            if entry.bank_transaction_id and entry.bank_transaction_id in settled_tx_periods:
                if settled_tx_periods[entry.bank_transaction_id] >= (year, month):
                    continue
            elif has_Current_or_later_call and entry.entry_date and entry.entry_date >= period_start:
                continue
        elif etype == "AVANCE":
            if entry.expense_id and entry.expense_id in exp_call_periods:
                if exp_call_periods[entry.expense_id] > (year, month):
                    continue
        total += float(entry.amount or 0.0)

    return round(total, 2)


def calculate_member_call_for_funds(
    db: Session,
    member: Member,
    year: int,
    month: int
) -> Dict[str, Any]:
    """
    Calcule la compensation et le solde net de la quote-part mensuelle d'un membre
    en s'appuyant sur sa trésorerie cumulée illimitée (Grand Livre).
    RÈGLES D'OR HENRI :
      - Cumul illimité : + avances validées, + virements reçus, - cotisations antérieures.
      - Si Solde >= Quote-part (50 €) : Échéance intégralement couverte (statut COUVERT). Aucun avis émis.
      - Si 0 < Solde < Quote-part : Reliquat réclamé (statut EMIS ou PENDING_SWAN_IBAN).
      - Si Solde <= 0 : Quote-part intégrale réclamée.
    """
    period_label = f"{MONTH_NAMES_FR[month]} {year}"
    theoretical = float(member.monthly_contribution if member.monthly_contribution is not None else 50.0)

    # Solde de trésorerie disponible du membre avant cette échéance (idempotent même si ECHEANCE déjà créée)
    balance_before = _compute_balance_before_period(db, member.id, year, month)

    # Récupération des dépenses avancées enregistrées par le membre sur le mois (pour information)
    expenses = get_member_expenses_for_period(db, member.id, year, month)
    approved_expenses_total = sum(e["amount"] for e in expenses)

    bank_active = is_bank_account_active(db)

    # Cas particulier : quote-part nulle (ex : Maman incluse dans la quote-part commune avec Frédéric)
    if theoretical <= 0.0:
        return {
            "member_id": member.id,
            "member_name": member.name,
            "prenom": member.prenom,
            "year": year,
            "month": month,
            "period_label": period_label,
            "theoretical_contribution": 0.0,
            "balance_before": balance_before,
            "approved_expenses_total": approved_expenses_total,
            "net_amount": 0.0,
            "amount_due": 0.0,
            "status": "COUVERT",
            "status_label": "Quote-part commune (couple Frédéric & Élisabeth)",
            "reason": "Membre rattaché à la quote-part commune du foyer (Frédéric & Élisabeth, 1 000,00 €/mois). Aucun avis individuel émis.",
            "should_issue": False,
            "reference": f"AF-{year}{month:02d}-{member.prenom.upper()}",
            "payment_reference": member.payment_reference or f"HLV-{member.prenom.upper()}",
            "deducted_expenses": expenses
        }

    # Arbitrage selon le solde de trésorerie disponible
    if balance_before >= theoretical:
        should_issue = False
        net_amount = 0.0
        amount_due = 0.0
        status = "COUVERT"
        status_label = "Couvert par la trésorerie / avances du membre"
        reason = f"Cotisation ({theoretical:.2f} €) intégralement couverte par le solde disponible ({balance_before:.2f} €). Aucun avis émis et aucune notification envoyée."
    elif balance_before > 0:
        reliquat = round(theoretical - balance_before, 2)
        should_issue = True
        net_amount = reliquat
        amount_due = reliquat
        if not bank_active:
            status = "PENDING_SWAN_IBAN"
            status_label = "En attente de validation IBAN Swan"
            reason = f"Avis pour le reliquat ({reliquat:.2f} €) préparé mais bloqué en attente de l'IBAN officiel Indy / Swan. Zéro e-mail envoyé."
        else:
            status = "EMIS"
            status_label = "Avis émis (reliquat après compensation)"
            reason = f"Avis d'appel de fonds émis pour le reliquat de {reliquat:.2f} € avec QR-code SEPA valide."
    else:
        should_issue = True
        net_amount = theoretical
        arrears = round(abs(balance_before), 2) if balance_before < 0 else 0.0
        amount_due = round(theoretical + arrears, 2)
        if not bank_active:
            status = "PENDING_SWAN_IBAN"
            status_label = "En attente de validation IBAN Swan"
            reason = "Avis préparé mais bloqué en attente de l'IBAN officiel Indy / Swan. Zéro e-mail envoyé."
        else:
            status = "EMIS"
            if arrears > 0:
                status_label = f"Avis émis (incluant {arrears:.2f} € d'arriéré antérieur)"
                reason = (
                    f"Avis d'appel de fonds émis pour {amount_due:.2f} € "
                    f"({theoretical:.2f} € du mois + {arrears:.2f} € d'arriéré antérieur) avec QR-code SEPA valide."
                )
            else:
                status_label = "Avis émis (prêt pour règlement par virement)"
                reason = "Avis d'appel de fonds émis avec QR-code SEPA valide."

    ref = f"AF-{year}{month:02d}-{member.prenom.upper()}"
    payment_ref = member.payment_reference or f"HLV-{member.prenom.upper()}"

    return {
        "member_id": member.id,
        "member_name": member.name,
        "prenom": member.prenom,
        "year": year,
        "month": month,
        "period_label": period_label,
        "theoretical_contribution": theoretical,
        "approved_expenses_total": round(approved_expenses_total, 2),
        "balance_before": round(balance_before, 2),
        "amount_due": amount_due,
        "net_amount": net_amount,
        "net_raw": amount_due,
        "should_issue": should_issue,
        "status": status,
        "status_label": status_label,
        "reason": reason,
        "reference": ref,
        "payment_reference": payment_ref,
        "deducted_expenses": expenses
    }



def generate_call_for_funds_pdf(
    call_data: Dict[str, Any],
    member: Member,
    bank_info: Dict[str, str],
    is_bank_pending: bool = True
) -> bytes:
    """
    Génère l'avis officiel d'appel de fonds au format PDF haute fidélité (ReportLab Platypus).
    Intègre :
      - En-tête officiel SCI HELLENVILLIERS (SIREN 977 529 312).
      - Détail du mois, quote-part statutaire.
      - Décompte de déduction des dépenses avancées avec libellés et justificatifs.
      - Montant net à régler.
      - QR-Code de virement standard EPC QR Code (European Payments Council).
      - Coordonnées bancaires IBAN / BIC.
      - Bandeau de garde-fou si IBAN Swan en attente de validation.
    """
    if not REPORTLAB_AVAILABLE:
        logger.warning("[PDF] La librairie reportlab n'est pas installée sur cet environnement serverless.")
        return None
    pdf_buffer = io.BytesIO()

    # Document A4 avec marges professionnelles de 36 pt (1,27 cm)
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Définition des styles personnalisés
    color_primary = colors.HexColor("#064e3b")     # Vert émeraude profond
    color_slate = colors.HexColor("#1e293b")       # Ardoise foncée
    color_muted = colors.HexColor("#64748b")       # Gris texte secondaire
    color_amber = colors.HexColor("#b45309")       # Ambre alerte
    color_amber_bg = colors.HexColor("#fef3c7")    # Fond ambre

    style_header_sci = ParagraphStyle(
        'SCIHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=color_primary
    )
    style_header_sub = ParagraphStyle(
        'SCISub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=color_muted
    )
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=color_slate,
        alignment=1  # Centré
    )
    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=color_primary,
        alignment=1
    )
    style_section_title = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=color_primary
    )
    style_body = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=color_slate
    )
    style_body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=color_slate
    )
    style_warning = ParagraphStyle(
        'Warning',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=color_amber,
        alignment=1
    )
    style_legal = ParagraphStyle(
        'Legal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=color_muted,
        alignment=1
    )

    story = []

    # 1. En-tête officiel SCI Hellenvilliers
    header_data = [
        [
            Paragraph(
                f"<b>{SCI_NAME}</b><br/>"
                f"<font size=8 color='#475569'>Société Civile Immobilière au capital de {SCI_CAPITAL}</font><br/>"
                f"<font size=8 color='#475569'>SIREN : {SCI_SIREN} • {SCI_RCS}</font><br/>"
                f"<font size=8 color='#64748b'>Siège social : {SCI_ADDRESS}</font>",
                style_header_sci
            ),
            Paragraph(
                f"<font size=8 color='#64748b'><b>RÉFÉRENCE :</b> {call_data.get('reference')}</font><br/>"
                f"<font size=8 color='#64748b'><b>DATE :</b> {datetime.utcnow().strftime('%d/%m/%Y')}</font><br/>"
                f"<font size=8 color='#64748b'><b>PÉRIODE :</b> {call_data.get('period_label')}</font><br/>"
                f"<font size=8 color='#64748b'><b>CONTACT :</b> {SCI_EMAIL}</font>",
                style_header_sub
            )
        ]
    ]
    t_header = Table(header_data, colWidths=[12.5 * cm, 6.5 * cm])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(t_header)

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=color_primary, spaceBefore=4, spaceAfter=14))

    # 2. Titre Principal du Document
    story.append(Paragraph("AVIS D'APPEL DE FONDS &amp; QUOTE-PART MENSUELLE", style_title))
    story.append(Paragraph(f"Exercice {call_data.get('year')} — Mois de {call_data.get('period_label')}", style_subtitle))
    story.append(Spacer(1, 12))

    # 3. Encadré Garde-fou Bancaire (si IBAN Swan en cours de validation)
    if is_bank_pending:
        warning_data = [[
            Paragraph(
                "⚠️ <b>AVIS PROVISOIRE DE COTISATION — EN ATTENTE DE VALIDATION IBAN SWAN</b><br/>"
                "Le compte pro Indy (Swan) de la SCI est en cours de validation finale. "
                "<b>Aucun virement ne doit être émis pour l'instant.</b> "
                "Le QR-Code et les coordonnées ci-dessous sont présentés à titre indicatif.",
                style_warning
            )
        ]]
        t_warn = Table(warning_data, colWidths=[19.0 * cm])
        t_warn.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), color_amber_bg),
            ('BOX', (0, 0), (-1, -1), 1, color_amber),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(t_warn)
        story.append(Spacer(1, 12))

    # 4. Cadre Destinataire (Associé)
    dest_data = [
        [
            Paragraph(
                "<b>ASSOCIÉ CONCERNÉ :</b><br/>"
                f"<font size=10 color='#064e3b'><b>{member.name}</b></font><br/>"
                f"<font size=8.5 color='#475569'>Rôle statutaire : {getattr(member, 'role', None) or 'Membre Associé'}</font><br/>"
                f"<font size=8.5 color='#64748b'>E-mail de notification : {getattr(member, 'email', None) or 'Non renseigné'}</font>",
                style_body
            ),
            Paragraph(
                "<b>NATURE DU RÈGLEMENT :</b><br/>"
                "• Apport en Compte Courant d'Associé (CCA)<br/>"
                "• Compte PCG : <b>455 (Dettes Financières)</b><br/>"
                "• Délibération AG du 8 août 2026",
                style_body
            )
        ]
    ]
    t_dest = Table(dest_data, colWidths=[10.5 * cm, 8.5 * cm])
    t_dest.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(t_dest)
    story.append(Spacer(1, 14))

    # 5. Tableau de Décompte & Compensation des Dépenses Avancées
    story.append(Paragraph("1. Décompte de la Cotisation &amp; Compensation des Frais Avancés", style_section_title))
    story.append(Spacer(1, 6))

    balance_before_val = float(call_data.get("balance_before") or 0.0)
    arrears_val = round(abs(balance_before_val), 2) if balance_before_val < 0 else 0.0
    net_month_val = float(call_data.get("net_amount") or 0.0)
    amount_due_val = float(
        call_data.get("amount_due")
        if call_data.get("amount_due") is not None
        else round(net_month_val + arrears_val, 2)
    )

    rows = [
        [
            Paragraph("<b>Désignation / Opération</b>", style_body_bold),
            Paragraph("<b>Réf. Justificatif</b>", style_body_bold),
            Paragraph("<b>Date</b>", style_body_bold),
            Paragraph("<b>Montant</b>", style_body_bold),
        ],
        [
            Paragraph(f"Quote-part mensuelle théorique ({member.prenom})", style_body),
            Paragraph("Statuts SCI", style_body),
            Paragraph(f"01/{int(call_data.get('month') or 1):02d}/{call_data.get('year') or 2026}", style_body),
            Paragraph(f"<b>+{call_data.get('theoretical_contribution'):.2f} €</b>", style_body_bold),
        ]
    ]

    deducted_expenses = call_data.get("deducted_expenses") or []
    if deducted_expenses:
        for exp in deducted_expenses:
            rows.append([
                Paragraph(f"Déduction avance : {exp.get('title')}", style_body),
                Paragraph(exp.get("document_filename", "Facture"), style_body),
                Paragraph(str(exp.get("date", "")), style_body),
                Paragraph(f"<font color='#b91c1c'>-{exp.get('amount'):.2f} €</font>", style_body),
            ])
    else:
        rows.append([
            Paragraph("<i>Aucune dépense avancée enregistrée pour ce mois</i>", style_body),
            Paragraph("-", style_body),
            Paragraph("-", style_body),
            Paragraph("0,00 €", style_body),
        ])

    # Ligne total déductions
    rows.append([
        Paragraph("<b>Total des déductions de dépenses validées</b>", style_body_bold),
        Paragraph("", style_body),
        Paragraph("", style_body),
        Paragraph(f"<b>-{call_data.get('approved_expenses_total'):.2f} €</b>", style_body_bold),
    ])

    if arrears_val > 0:
        rows.append([
            Paragraph(f"<b>Sous-total échéance du mois ({call_data.get('period_label')})</b>", style_body_bold),
            Paragraph("-", style_body),
            Paragraph("-", style_body),
            Paragraph(f"<b>{net_month_val:.2f} €</b>", style_body_bold),
        ])
        rows.append([
            Paragraph("<b>Arriéré antérieur non réglé (report solde débiteur)</b>", style_body_bold),
            Paragraph("Grand Livre CCA", style_body),
            Paragraph("Antérieur", style_body),
            Paragraph(f"<font color='#b45309'><b>+{arrears_val:.2f} €</b></font>", style_body_bold),
        ])

    # Ligne Solde Net à Régler (Mise en avant forte)
    total_label = "TOTAL NET À RÉGLER (ÉCHÉANCE + ARRIÉRÉ)" if arrears_val > 0 else "SOLDE NET À RÉGLER POUR LE MOIS"
    rows.append([
        Paragraph(f"<font size=10 color='#064e3b'><b>{total_label}</b></font>", style_body_bold),
        Paragraph("", style_body),
        Paragraph("", style_body),
        Paragraph(f"<font size=11 color='#064e3b'><b>{amount_due_val:.2f} €</b></font>", style_body_bold),
    ])

    t_decompte = Table(rows, colWidths=[9.5 * cm, 4.0 * cm, 2.5 * cm, 3.0 * cm])
    t_decompte.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#ecfdf5")),  # Fond vert clair pour le total net
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, color_primary),
    ]))
    story.append(t_decompte)
    story.append(Spacer(1, 14))

    # 6. Instructions Bancaires & QR Code EPC SEPA
    story.append(Paragraph("2. Modalités de Règlement par Virement SEPA &amp; QR-Code", style_section_title))
    story.append(Spacer(1, 6))

    # Génération du QR Code SEPA
    iban_val = bank_info.get("iban", "FR76 1694 5000 0000 0000 0000 000")
    bic_val = bank_info.get("bic", DEFAULT_BIC)
    net_val = amount_due_val
    payment_ref = call_data.get("payment_reference", f"Apport CCA - {member.prenom}")

    qr_bytes = generate_epc_qr_image_bytes(
        iban=iban_val,
        bic=bic_val,
        amount=net_val,
        beneficiary_name=SCI_NAME,
        remittance_info=payment_ref,
        is_specimen=is_bank_pending
    )
    qr_img = Image(io.BytesIO(qr_bytes), width=3.8 * cm, height=3.8 * cm)

    # Bloc texte bancaire
    bank_text = (
        "<b>COORDONNÉES BANCAIRES POUR VIREMENT SEPA :</b><br/>"
        f"• Bénéficiaire : <b>{SCI_NAME}</b><br/>"
        f"• Établissement : <b>{bank_info.get('bank_name')}</b><br/>"
        f"• IBAN : <font face='Courier-Bold' size=10 color='#064e3b'><b>{iban_val}</b></font><br/>"
        f"• BIC : <font face='Courier-Bold' size=9.5><b>{bic_val}</b></font><br/>"
        f"• Montant exact : <b>{net_val:.2f} €</b><br/>"
        "• <b>Virement simple :</b> Il vous suffit d'effectuer votre virement depuis votre compte bancaire personnel "
        "(le virement sera automatiquement détecté et affecté à votre trésorerie à votre nom).<br/>"
        f"<font size=7.5 color='#64748b'><i>(Référence facultative : {payment_ref})</i></font>"
    )

    qr_caption = (
        "<font size=7.5 color='#475569'><b>QR-CODE SEPA EPC</b><br/>"
        "Scannez avec votre application bancaire (Boursorama, BNP, SG, CA, Revolut...) "
        "pour pré-remplir le virement en 1 clic.</font>"
    )

    bank_table_data = [
        [
            Paragraph(bank_text, style_body),
            [qr_img, Spacer(1, 3), Paragraph(qr_caption, style_legal)]
        ]
    ]

    t_bank = Table(bank_table_data, colWidths=[13.5 * cm, 5.5 * cm])
    t_bank.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_bank)

    story.append(Spacer(1, 14))

    # 7. Mentions Légales & Fiscales
    legal_text = (
        "<b>Dispositions Légales &amp; Fiscales :</b> La SCI Hellenvilliers est régie par les articles 1832 et suivants du Code Civil "
        "et soumise au régime de la translucidité fiscale (Article 8 du Code Général des Impôts). "
        "Les présents versements constituent des avances en compte courant d'associé sans intérêt (Compte 455). "
        "Ils sont restituables selon les décisions collectives de l'assemblée générale ordinaire et la trésorerie disponible.<br/>"
        f"Document généré automatiquement par la plateforme numérique SCI Hellenvilliers • SIREN {SCI_SIREN} • Contact : {SCI_EMAIL}"
    )
    story.append(Paragraph(legal_text, style_legal))

    # Construction du document
    doc.build(story)
    return pdf_buffer.getvalue()


def generate_and_save_monthly_call(
    db: Session,
    member: Member,
    year: int,
    month: int
) -> CallForFunds:
    """
    Exécute le calcul, génère le document PDF avec QR code et sauvegarde en base de données.
    RÈGLE ABSOLUE :
      Si solde net <= 0 €, aucun avis n'est émis et aucune notification n'est envoyée.
      Le statut enregistré est 'NEUTRALISE_COMPENSATION' avec net_amount=0.0.
    """
    calc = calculate_member_call_for_funds(db, member, year, month)
    bank_info = get_official_bank_info(db)
    is_pending = not is_bank_account_active(db)

    # Vérification si un enregistrement existe déjà
    existing = db.query(CallForFunds).filter(
        CallForFunds.member_id == member.id,
        CallForFunds.year == year,
        CallForFunds.month == month
    ).first()
    is_already_settled = bool(existing and (existing.status == "REGLE" or existing.bank_transaction_id is not None))

    pdf_filename = None
    pdf_url = None
    pdf_bytes = None

    # Si solde net > 0 et non déjà réglé, on tente de générer le PDF officiel
    pdf_error_msg = None
    if calc["should_issue"] and not is_already_settled:
        try:
            pdf_bytes = generate_call_for_funds_pdf(
                call_data=calc,
                member=member,
                bank_info=bank_info,
                is_bank_pending=is_pending
            )
            if pdf_bytes:
                pdf_filename = f"SCI {month:02d}{year} Avis Appel de Fonds {member.prenom}.pdf"
                dest_path = os.path.join(DOCUMENTS_DIR, pdf_filename)
                try:
                    with open(dest_path, "wb") as f:
                        f.write(pdf_bytes)
                    pdf_url = f"/api/finances/calls-for-funds/download/{pdf_filename}"
                except Exception as e:
                    logger.warning(f"Erreur écriture PDF {pdf_filename}: {e}")
            else:
                pdf_error_msg = "Génération PDF retournée vide (reportlab indisponible)"
        except Exception as pdf_err:
            logger.error(f"[PDF ERROR] Erreur génération avis PDF pour {member.prenom}: {pdf_err}")
            pdf_bytes = None
            pdf_error_msg = str(pdf_err)

    # Préparation du rapport d'audit et déductions dans details_json
    details_dict = {
        "deducted_expenses": calc["deducted_expenses"],
        "pdf_status": "PRESERVED_SETTLED" if is_already_settled else ("GENERATED" if pdf_filename else ("ERROR: " + (pdf_error_msg or "Non requis")))
    }
    details_str = json.dumps(details_dict, ensure_ascii=False)

    # Enregistrement ou mise à jour en base
    if existing:
        call_obj = existing
        call_obj.theoretical_contribution = calc["theoretical_contribution"]
        call_obj.approved_expenses_total = calc["approved_expenses_total"]
        call_obj.balance_before = calc.get("balance_before", 0.0)
        call_obj.amount_due = calc.get("amount_due", calc["net_amount"])
        call_obj.net_amount = calc["net_amount"]
        if is_already_settled:
            call_obj.status = "REGLE"
        else:
            call_obj.status = calc["status"]
        call_obj.iban = bank_info.get("iban")
        call_obj.bic = bank_info.get("bic")
        call_obj.payment_reference = calc["payment_reference"]
        call_obj.details_json = details_str
        if pdf_filename and not is_already_settled:
            call_obj.pdf_filename = pdf_filename
            call_obj.pdf_url = pdf_url
        call_obj.updated_at = datetime.utcnow()
    else:
        call_obj = CallForFunds(
            reference=calc["reference"],
            member_id=member.id,
            member_name=member.name,
            year=year,
            month=month,
            period_label=calc["period_label"],
            theoretical_contribution=calc["theoretical_contribution"],
            approved_expenses_total=calc["approved_expenses_total"],
            balance_before=calc.get("balance_before", 0.0),
            amount_due=calc.get("amount_due", calc["net_amount"]),
            net_amount=calc["net_amount"],
            status=calc["status"],
            iban=bank_info.get("iban"),
            bic=bank_info.get("bic"),
            payment_reference=calc["payment_reference"],
            pdf_filename=pdf_filename,
            pdf_url=pdf_url,
            details_json=details_str,
            notification_sent=False
        )
        db.add(call_obj)

    db.commit()
    db.refresh(call_obj)

    # Tentative d'archivage sur Google Drive si PDF généré
    if calc["should_issue"] and not is_already_settled and pdf_bytes:
        try:
            from .drive_service import GoogleDriveJailService
            # Sous-dossier dédié 'Appels de Fonds' sous Hellenvilliers SCI (14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J)
            default_calls_folder = "1mTgsx8K-SN4jMJTk8PO_SLiMoyq6Xr7b"
            calls_folder_id = os.getenv("GOOGLE_DRIVE_CALLS_FOR_FUNDS_FOLDER_ID", default_calls_folder)
            if calls_folder_id == "1712huYEQ_7IYa4eUCQtcnXy3Zdd3S3zu":
                calls_folder_id = default_calls_folder
            drive_svc = GoogleDriveJailService(folder_id=calls_folder_id)
            if drive_svc.is_configured():
                drive_file = drive_svc.upload_file(
                    content=pdf_bytes,
                    filename=pdf_filename,
                    mimetype="application/pdf",
                    description=f"Avis Appel de Fonds - {member.name} - {calc['period_label']}"
                )
                logger.info(f"Avis PDF téléversé sur Google Drive dans dossier privé {calls_folder_id} : {drive_file.get('id')}")
        except Exception as drive_err:
            logger.error(f"[DRIVE UPLOAD ERROR] Échec explicite upload Google Drive pour avis {pdf_filename}: {drive_err}")

    # Synchronisation comptable au grand livre (idempotence stricte)
    try:
        from .treasury_service import add_ledger_entry
        from ..models import MemberLedgerEntry
        existing_ledger = db.query(MemberLedgerEntry).filter(
            MemberLedgerEntry.call_for_funds_id == call_obj.id,
            MemberLedgerEntry.entry_type == "ECHEANCE"
        ).first()

        # Règle d'or : AUCUNE échéance débitée si compte inactif ou avant la date de début paramétrable
        if not is_treasury_contributions_started(year, month, db):
            logger.info(f"[TREASURY] Compte inactif ou période antérieure au démarrage ({year}-{month:02d}) : aucun débit d'échéance inscrit au grand livre.")
        elif not existing_ledger:
            # L'échéance mensuelle (dette statutaire) est la quote-part intégrale (uniquement si > 0)
            debit = -float(calc["theoretical_contribution"])
            if debit < 0:
                desc = f"Échéance {calc['period_label']}"

                add_ledger_entry(
                    db=db,
                    member_id=member.id,
                    entry_type="ECHEANCE",
                    amount=debit,
                    description=desc,
                    call_for_funds_id=call_obj.id,
                    entry_date=datetime(year, month, 1)
                )
    except Exception as ledger_err:
        logger.error(f"[TREASURY ERROR] Échec écriture grand livre pour échéance {call_obj.id}: {ledger_err}")

    # Rattacher les dépenses au call_obj
    if calc.get("deducted_expenses"):
        for exp in calc["deducted_expenses"]:
            if exp.get("source") == "member_expense":
                exp_rec = db.query(MemberExpense).filter(MemberExpense.id == exp["id"]).first()
                if exp_rec:
                    exp_rec.call_for_funds_id = call_obj.id
        db.commit()

    return call_obj


def send_call_for_funds_notification(
    db: Session,
    call_obj: CallForFunds,
    actually_send: bool = True
) -> Dict[str, Any]:
    """
    Envoie officiellement l'avis d'appel de fonds par email via Resend avec :
    - Le montant total à régler `amount_due` (intégrant tout arriéré antérieur `balance_before < 0`),
    - Les coordonnées bancaires officielles Swan (`FR76 1732 8844 0071 5921 5570 591`),
    - Le QR-Code SEPA EPC encodé au montant `amount_due`,
    - L'avis officiel au format PDF en pièce jointe (`attachments`),
    - Et met à jour `notification_sent = True` et `notification_sent_at` en base.
    """
    import base64
    from .email_service import (
        is_email_disabled,
        is_test_mode,
        check_firewall,
        render_email_layout,
        record_dispatched_email,
        DEFAULT_FROM_EMAIL,
        FALLBACK_FROM_EMAIL,
        APP_BASE_URL,
        RESEND_API_KEY,
        httpx,
    )

    member = call_obj.member or db.query(Member).filter(Member.id == call_obj.member_id).first()
    if not member:
        raise ValueError(f"Membre introuvable pour l'appel de fonds id={call_obj.id}")

    balance_before = float(call_obj.balance_before or 0.0)
    arrears = round(abs(balance_before), 2) if balance_before < 0 else 0.0
    net_amount = float(call_obj.net_amount or 0.0)
    amount_due = float(call_obj.amount_due if call_obj.amount_due is not None else round(net_amount + arrears, 2))

    if amount_due <= 0.0 or net_amount <= 0.0 or call_obj.status in ("COUVERT", "REGLE", "ANNULE"):
        return {
            "status": "neutralized_no_email",
            "message": f"Appel id={call_obj.id} ({call_obj.status}, due={amount_due:.2f} €) : aucun email à envoyer."
        }

    if not is_bank_account_active(db):
        return {
            "status": "blocked_pending_iban",
            "message": "En attente de validation IBAN Swan. Zéro e-mail envoyé."
        }

    if not getattr(member, "notif_new_invoices", True):
        return {
            "status": "preference_disabled",
            "message": f"Notifications désactivées par {member.prenom}."
        }

    to_email = (getattr(member, "email", None) or "").strip()
    if not to_email:
        return {"status": "skipped_no_email", "message": "Aucune adresse e-mail renseignée."}

    fw_block = check_firewall(to_email)
    if fw_block is not None:
        return fw_block

    bank_info = get_official_bank_info(db)
    iban_val = bank_info.get("iban", "")
    bic_val = bank_info.get("bic", DEFAULT_BIC)
    prenom = getattr(member, "prenom", "Associé")
    period_label = call_obj.period_label or f"{MONTH_NAMES_FR[call_obj.month]} {call_obj.year}"
    theoretical = float(call_obj.theoretical_contribution or 50.0)
    expenses_total = float(call_obj.approved_expenses_total or 0.0)
    payment_ref = call_obj.payment_reference or f"HLV-{prenom.upper()}"

    details_raw = json.loads(call_obj.details_json) if call_obj.details_json else {}
    deducted = details_raw.get("deducted_expenses", []) if isinstance(details_raw, dict) else []

    # Lecture ou génération du PDF d'avis officiel pour pièce jointe
    pdf_filename = call_obj.pdf_filename or f"SCI {call_obj.month:02d}{call_obj.year} Avis Appel de Fonds {prenom}.pdf"
    pdf_path = os.path.join(DOCUMENTS_DIR, pdf_filename)
    pdf_bytes = None
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
    if not pdf_bytes:
        call_data_for_pdf = {
            "reference": call_obj.reference,
            "year": call_obj.year,
            "month": call_obj.month,
            "period_label": period_label,
            "theoretical_contribution": theoretical,
            "approved_expenses_total": expenses_total,
            "balance_before": balance_before,
            "net_amount": net_amount,
            "amount_due": amount_due,
            "payment_reference": payment_ref,
            "deducted_expenses": deducted,
        }
        pdf_bytes = generate_call_for_funds_pdf(
            call_data=call_data_for_pdf,
            member=member,
            bank_info=bank_info,
            is_bank_pending=False
        )
        if pdf_bytes:
            os.makedirs(DOCUMENTS_DIR, exist_ok=True)
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)

    qr_bytes = generate_epc_qr_image_bytes(
        iban=iban_val,
        bic=bic_val,
        amount=amount_due,
        beneficiary_name=SCI_NAME,
        remittance_info=payment_ref,
        is_specimen=False
    )
    qr_b64 = base64.b64encode(qr_bytes).decode("ascii")

    subject = f"🏛️ SCI Hellenvilliers — Appel de fonds {period_label} ({amount_due:.2f} €)"
    preheader = f"Votre avis d'appel de fonds pour {period_label} est disponible : {amount_due:.2f} € à régler."

    expenses_rows_html = ""
    valid_expenses = [exp for exp in deducted if isinstance(exp, dict)]
    if valid_expenses:
        for exp in valid_expenses:
            expenses_rows_html += f"""
            <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #475569;">Déduction avance : {exp.get('title', 'Dépense')}</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #b91c1c; font-weight: 600;">-{float(exp.get('amount') or 0):.2f} €</td>
            </tr>
            """
    else:
        expenses_rows_html = """
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-style: italic;">Aucune avance de frais enregistrée</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #94a3b8;">0,00 €</td>
        </tr>
        """

    arrears_rows_html = ""
    if arrears > 0:
        arrears_rows_html = f"""
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #1e293b;">Sous-total échéance {period_label} :</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #1e293b;">{net_amount:.2f} €</td>
        </tr>
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #b45309;">Arriéré antérieur non réglé (Octobre 2026) :</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: #b45309;">+{arrears:.2f} €</td>
        </tr>
        """

    total_row_label = "Total net à régler (échéance + arriéré) :" if arrears > 0 else "Solde net à régler :"

    content_html = f"""
    <p>Bonjour {prenom},</p>
    <p>Votre avis d'appel de fonds pour le mois de <strong>{period_label}</strong> a été établi pour la SCI Hellenvilliers (vous trouverez également l'avis officiel au format PDF en pièce jointe de cet e-mail) :</p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 16px; font-weight: bold; color: #064e3b; margin-bottom: 12px;">
            📋 Décompte de la quote-part — {period_label}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13.5px; line-height: 1.6;">
            <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9;">Quote-part mensuelle théorique :</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #1e293b;">+{theoretical:.2f} €</td>
            </tr>
            {expenses_rows_html}
            {arrears_rows_html}
            <tr style="background-color: #ecfdf5;">
                <td style="padding: 10px; font-size: 15px; font-weight: bold; color: #064e3b;">{total_row_label}</td>
                <td style="padding: 10px; font-size: 16px; font-weight: bold; text-align: right; color: #064e3b;">{amount_due:.2f} €</td>
            </tr>
        </table>
    </div>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 14px; font-weight: bold; color: #166534; margin-bottom: 12px;">
            🏦 Coordonnées pour virement bancaire SEPA
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td style="vertical-align: top; padding-right: 16px;">
                    <p style="font-size: 13px; color: #1e293b; margin: 0 0 10px 0; line-height: 1.6;">
                        • Titulaire : <strong>SCI HELLENVILLIERS</strong><br/>
                        • IBAN : <code style="font-family: monospace; font-size: 13px; background: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">{iban_val}</code><br/>
                        • BIC : <code style="font-family: monospace;">{bic_val}</code><br/>
                        • Montant à régler : <strong>{amount_due:.2f} €</strong>
                    </p>
                    <p style="font-size: 12.5px; color: #064e3b; margin: 0 0 10px 0; line-height: 1.5; font-weight: 500;">
                        💡 Il vous suffit d'effectuer votre virement depuis votre compte bancaire personnel (le virement sera automatiquement détecté et affecté à votre trésorerie à votre nom).
                    </p>
                    <p style="font-size: 12px; color: #475569; margin: 0;">
                        📱 <em>Scannez le QR-Code SEPA EPC ci-contre ou dans le PDF joint avec votre application bancaire pour pré-remplir le virement instantanément.</em>
                    </p>
                </td>
                <td style="vertical-align: middle; text-align: center; width: 130px;">
                    <img src="data:image/png;base64,{qr_b64}" width="130" height="130" style="display: block; border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.08);" alt="QR-Code SEPA EPC" />
                </td>
            </tr>
        </table>
    </div>

    <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        💡 <em>Vous pouvez consulter vos factures et gérer vos préférences à tout moment dans vos <a href="{APP_BASE_URL}/settings" style="color: #064e3b; text-decoration: underline;">Paramètres</a>.</em>
    </p>
    """

    action_url = f"{APP_BASE_URL}/admin"
    html_body = render_email_layout(
        title="Appel de fonds mensuel",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter l'avis & télécharger le PDF"
    )

    will_send = actually_send and not is_email_disabled() and not is_test_mode()
    email_entry = record_dispatched_email(
        trigger_action="call_for_funds",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=[prenom],
        status="sent" if will_send else "simulated"
    )

    if not will_send:
        return {"status": "simulated", "id": email_entry["id"], "_email_dispatched": email_entry}

    api_key = os.environ.get("RESEND_API_KEY", RESEND_API_KEY).strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY manquante pour l'envoi réel de l'appel de fonds.")

    payload: Dict[str, Any] = {
        "from": DEFAULT_FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    if pdf_bytes:
        payload["attachments"] = [
            {
                "filename": pdf_filename,
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }
        ]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    url = "https://api.resend.com/emails"

    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code == 403 and "domain" in resp.text.lower() and payload["from"] != FALLBACK_FROM_EMAIL:
            payload["from"] = FALLBACK_FROM_EMAIL
            resp = client.post(url, headers=headers, json=payload)

        if resp.status_code not in (200, 201):
            logger.error(f"[CALL FOR FUNDS EMAIL ERROR] Resend HTTP {resp.status_code}: {resp.text}")
            return {"status": "error", "status_code": resp.status_code, "error": resp.text}

        res = resp.json()
        res["status"] = "sent"
        res["status_code"] = resp.status_code
        res["_email_dispatched"] = email_entry

    call_obj.notification_sent = True
    call_obj.notification_sent_at = datetime.utcnow()
    call_obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(call_obj)
    return res


def reconcile_open_calls_for_member(db: Session, member_id: int) -> List[CallForFunds]:
    """
    Inspecte et met à jour les avis d'appel de fonds non réglés par virement (EMIS, PENDING_SWAN_IBAN ou COUVERT)
    d'un membre en fonction de ses avances validées et de son solde de trésorerie courant.
    """
    from .treasury_service import get_member_balance, add_ledger_entry
    from ..models import MemberLedgerEntry

    member = db.query(Member).filter(Member.id == member_id).first()

    # S'assurer que tous les appels existants ont bien leur écriture ECHEANCE si le compte est actif
    all_member_calls = db.query(CallForFunds).filter(
        CallForFunds.member_id == member_id
    ).order_by(CallForFunds.year.asc(), CallForFunds.month.asc()).all()

    for c in all_member_calls:
        if is_treasury_contributions_started(c.year, c.month, db):
            debit = -float(c.theoretical_contribution or 0.0)
            if debit < 0:
                has_ech = db.query(MemberLedgerEntry).filter(
                    MemberLedgerEntry.call_for_funds_id == c.id,
                    MemberLedgerEntry.entry_type == "ECHEANCE"
                ).first()
                if not has_ech:
                    add_ledger_entry(
                        db=db,
                        member_id=member_id,
                        entry_type="ECHEANCE",
                        amount=debit,
                        description=f"Échéance {c.period_label}",
                        call_for_funds_id=c.id,
                        entry_date=datetime(c.year, c.month, 1)
                    )

    open_calls = db.query(CallForFunds).filter(
        CallForFunds.member_id == member_id,
        CallForFunds.status.in_(["EMIS", "PENDING_SWAN_IBAN", "COUVERT"]),
        CallForFunds.bank_transaction_id.is_(None)
    ).order_by(CallForFunds.year.asc(), CallForFunds.month.asc()).all()

    if not open_calls:
        return []

    balance = get_member_balance(db, member_id)
    bank_active = is_bank_account_active(db)
    virements = db.query(MemberLedgerEntry).filter(
        MemberLedgerEntry.member_id == member_id,
        MemberLedgerEntry.entry_type == "VIREMENT"
    ).order_by(MemberLedgerEntry.entry_date.desc(), MemberLedgerEntry.id.desc()).all()

    updated_calls = []
    for call in open_calls:
        expenses = get_member_expenses_for_period(db, member_id, call.year, call.month)
        approved_total = round(sum(e["amount"] for e in expenses), 2)
        call.approved_expenses_total = approved_total

        for exp in expenses:
            if exp.get("source") == "member_expense":
                exp_rec = db.query(MemberExpense).filter(MemberExpense.id == exp["id"]).first()
                if exp_rec and not exp_rec.call_for_funds_id:
                    exp_rec.call_for_funds_id = call.id
        db.flush()

        calc = calculate_member_call_for_funds(db, member, call.year, call.month) if member else None
        if calc is not None:
            call.balance_before = calc.get("balance_before", 0.0)

        try:
            details_dict = json.loads(call.details_json) if call.details_json else {}
            if not isinstance(details_dict, dict):
                details_dict = {}
            details_dict["deducted_expenses"] = expenses
            call.details_json = json.dumps(details_dict, ensure_ascii=False)
        except Exception:
            pass

        if balance >= 0.0:
            period_virement = next(
                (
                    v for v in virements
                    if (v.entry_date and v.entry_date.year == call.year and v.entry_date.month == call.month)
                    or v.call_for_funds_id == call.id
                ),
                None
            )
            expected_net = calc["net_amount"] if calc is not None else float(call.net_amount or 0.0)
            if period_virement and expected_net > 0.0:
                call.status = "REGLE"
                call.amount_due = expected_net
                call.net_amount = expected_net
                if not call.paid_at:
                    call.paid_at = period_virement.entry_date or datetime.utcnow()
                if not call.bank_transaction_id and period_virement.bank_transaction_id:
                    call.bank_transaction_id = period_virement.bank_transaction_id
            else:
                call.status = "COUVERT"
                call.amount_due = 0.0
                call.net_amount = 0.0
        else:
            if float(call.theoretical_contribution or 0.0) > 0.0:
                call.status = "EMIS" if bank_active else "PENDING_SWAN_IBAN"
                if calc is not None:
                    call.net_amount = calc["net_amount"]
                    call.amount_due = calc["amount_due"]
                else:
                    call.net_amount = round(min(float(call.theoretical_contribution), abs(balance)), 2)
                    arrears = abs(float(call.balance_before or 0.0)) if float(call.balance_before or 0.0) < 0 else 0.0
                    call.amount_due = round(call.net_amount + arrears, 2)

        call.updated_at = datetime.utcnow()
        updated_calls.append(call)

    db.commit()
    return updated_calls
