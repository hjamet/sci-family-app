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

# Dossier d'archivage des documents
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCUMENTS_DIR = os.path.join(BASE_DIR, "uploads", "documents")
try:
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
except OSError:
    pass

MONTH_NAMES_FR = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]


def is_bank_account_active(db: Optional[Session] = None) -> bool:
    """
    GARDE-FOU BANCAIRE STRICT :
    Vérifie si les coordonnées bancaires officielles Indy / Swan de la SCI sont validées et actives.
    Tant que l'IBAN officiel n'est pas renseigné et validé (IS_BANK_ACCOUNT_ACTIVE=false),
    la génération des avis bancaires réels et les envois d'emails sont bloqués avec le statut
    « En attente de validation IBAN Swan ». Zéro e-mail envoyé.
    """
    env_active = os.getenv("IS_BANK_ACCOUNT_ACTIVE", "false").strip().lower() in ("true", "1", "yes")
    if not env_active:
        return False

    # Si la variable d'environnement est activée, vérifions également qu'un IBAN réel existe en base
    if db is not None:
        try:
            account = db.query(BankAccount).first()
            if not account or not account.iban:
                return False
            clean_iban = account.iban.replace(" ", "").upper()
            # Faux IBAN de dev avec plein de zéros
            if "000000000000" in clean_iban or clean_iban == "FR7616945000000000000000000":
                return False
        except Exception as e:
            logger.warning(f"Erreur vérification compte bancaire en base: {e}")
            return False

    return True


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
        try:
            account = db.query(BankAccount).first()
            if account and account.iban:
                iban = account.iban
            if account and account.aspsp_name:
                bank_name = account.aspsp_name
        except Exception:
            pass

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
    1. Depuis la table `member_expenses` (status='VALIDATED').
    2. Depuis la table `bank_transactions` (dépenses manuelles rattachées au membre).
    """
    month_str = f"{month:02d}"
    prefix_date = f"{year}-{month_str}"

    member = db.query(Member).filter(Member.id == member_id).first()
    prenom = member.prenom if member else ""
    full_name = member.name if member else prenom

    expenses = []

    # 1. Dépenses spécifiques dans member_expenses
    me_records = db.query(MemberExpense).filter(
        MemberExpense.member_id == member_id,
        MemberExpense.status != "REJECTED",
        MemberExpense.expense_date.like(f"{prefix_date}%")
    ).all()

    for me in me_records:
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
    from .treasury_service import get_member_balance

    period_label = f"{MONTH_NAMES_FR[month]} {year}"
    theoretical = float(member.monthly_contribution or 50.0)

    # Solde de trésorerie disponible du membre avant cette échéance
    balance_before = get_member_balance(db, member.id)

    # Récupération des dépenses avancées enregistrées par le membre sur le mois (pour information)
    expenses = get_member_expenses_for_period(db, member.id, year, month)
    approved_expenses_total = sum(e["amount"] for e in expenses)

    bank_active = is_bank_account_active(db)

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
        amount_due = theoretical
        if not bank_active:
            status = "PENDING_SWAN_IBAN"
            status_label = "En attente de validation IBAN Swan"
            reason = "Avis préparé mais bloqué en attente de l'IBAN officiel Indy / Swan. Zéro e-mail envoyé."
        else:
            status = "EMIS"
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
                f"<font size=8.5 color='#475569'>Rôle statutaire : {member.role or 'Membre Associé'}</font><br/>"
                f"<font size=8.5 color='#64748b'>E-mail de notification : {member.email or 'Non renseigné'}</font>",
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
            Paragraph(f"01/{call_data.get('month'):02d}/{call_data.get('year')}", style_body),
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

    # Ligne Solde Net à Régler (Mise en avant forte)
    rows.append([
        Paragraph("<font size=10 color='#064e3b'><b>SOLDE NET À RÉGLER POUR LE MOIS</b></font>", style_body_bold),
        Paragraph("", style_body),
        Paragraph("", style_body),
        Paragraph(f"<font size=11 color='#064e3b'><b>{call_data.get('net_amount'):.2f} €</b></font>", style_body_bold),
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
    net_val = float(call_data.get("net_amount", 50.0))
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
        f"• <b>Motif obligatoire :</b> <font face='Courier-Bold' color='#064e3b'><b>{payment_ref}</b></font><br/>"
        "<font size=7.5 color='#64748b'><i>(Ce libellé permet l'affectation automatique sur votre compte 455).</i></font>"
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

    pdf_filename = None
    pdf_url = None

    # Si solde net > 0, on tente de générer le PDF officiel
    if calc["should_issue"]:
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
        except Exception as pdf_err:
            logger.error(f"[PDF ERROR] Erreur génération avis PDF pour {member.prenom}: {pdf_err}")
            pdf_bytes = None

    # Enregistrement ou mise à jour en base
    if existing:
        call_obj = existing
        call_obj.theoretical_contribution = calc["theoretical_contribution"]
        call_obj.approved_expenses_total = calc["approved_expenses_total"]
        call_obj.balance_before = calc.get("balance_before", 0.0)
        call_obj.amount_due = calc.get("amount_due", calc["net_amount"])
        call_obj.net_amount = calc["net_amount"]
        call_obj.status = calc["status"]
        call_obj.iban = bank_info.get("iban")
        call_obj.bic = bank_info.get("bic")
        call_obj.payment_reference = calc["payment_reference"]
        call_obj.details_json = json.dumps(calc["deducted_expenses"], ensure_ascii=False)
        if pdf_filename:
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
            details_json=json.dumps(calc["deducted_expenses"], ensure_ascii=False),
            notification_sent=False
        )
        db.add(call_obj)

    db.commit()
    db.refresh(call_obj)

    # Tentative d'archivage sur Google Drive si PDF généré
    if calc["should_issue"] and pdf_bytes:
        try:
            from .drive_service import GoogleDriveJailService
            drive_svc = GoogleDriveJailService()
            if drive_svc.is_configured():
                drive_file = drive_svc.upload_file(
                    content=pdf_bytes,
                    filename=pdf_filename,
                    mimetype="application/pdf",
                    description=f"Avis Appel de Fonds - {member.name} - {calc['period_label']}"
                )
                logger.info(f"Avis PDF téléversé sur Google Drive : {drive_file.get('id')}")
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
            # L'échéance mensuelle (dette statutaire) est TOUJOURS la quote-part intégrale
            debit = -float(calc["theoretical_contribution"])
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

