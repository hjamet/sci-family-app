import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.toaster_sandbox import (
    execute_sandbox_action,
    execute_sandbox_read_tool,
    get_sandbox_state,
    init_or_reset_sandbox,
)

logger = logging.getLogger("sci_api.toaster")

import base64
from pathlib import Path
from dotenv import load_dotenv

_BACKEND_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_BACKEND_ENV_PATH)
load_dotenv()

router = APIRouter(prefix="/api/toaster", tags=["Grille-Pain IA (Sandbox)"])

GEMINI_MODEL = "models/gemini-4-hydrogen"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_MODEL}:generateContent"


def _get_toaster_api_key() -> str:
    load_dotenv(dotenv_path=_BACKEND_ENV_PATH)
    env_key = os.getenv("GEMINI_TOASTER_API_KEY", "").strip()
    if not env_key:
        raise RuntimeError(
            "GEMINI_TOASTER_API_KEY est absente de l'environnement (backend/.env). "
            "Impossible d'appeler l'orchestrateur Grille-Pain (Fail-Fast)."
        )
    return env_key


class ToasterResetRequest(BaseModel):
    member_id: Optional[int] = None


class ToasterChatRequest(BaseModel):
    member_id: Optional[int] = 1
    messages: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    message: Optional[str] = None
    attachment_base64: Optional[str] = None
    attachment_mime: Optional[str] = None
    attachment_name: Optional[str] = None


class ToasterExecuteRequest(BaseModel):
    member_id: int = 1
    action_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    deduced_fields: Optional[List[Dict[str, Any]]] = None
    missing_fields: Optional[List[Dict[str, Any]]] = None


TOASTER_FUNCTION_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "propose_stay_action",
        "description": (
            "Propose de créer, modifier ou annuler une réservation de séjour familial au Domaine d'Hellenvilliers "
            "(bâtiment Presbytère ou Rosings, dates d'arrivée et de départ, nombre d'occupants/invités, chambres, "
            "et activation du chauffage fioul à 20 °C)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {
                    "type": "STRING",
                    "description": "Type d'opération : 'create', 'update' ou 'cancel'.",
                },
                "reservation_id": {
                    "type": "INTEGER",
                    "description": "ID du séjour existant si modification ou annulation.",
                },
                "building": {
                    "type": "STRING",
                    "description": "Bâtiment souhaité : 'Presbytère' ou 'Rosings'. Laisser vide si l'utilisateur ne l'a pas précisé.",
                },
                "start_date": {
                    "type": "STRING",
                    "description": "Date d'arrivée au format YYYY-MM-DD (année en cours : 2026).",
                },
                "end_date": {
                    "type": "STRING",
                    "description": "Date de départ au format YYYY-MM-DD (année en cours : 2026).",
                },
                "arrival_time": {
                    "type": "STRING",
                    "description": "Heure d'arrivée au format HH:MM (ex: '15:00' ou '18:00').",
                },
                "departure_time": {
                    "type": "STRING",
                    "description": "Heure de départ au format HH:MM (ex: '11:00' ou '17:00').",
                },
                "guest_count": {
                    "type": "INTEGER",
                    "description": "Nombre total de personnes présentes (membres + invités).",
                },
                "chambers_used": {
                    "type": "INTEGER",
                    "description": "Nombre de chambres occupées.",
                },
                "selected_rooms": {
                    "type": "STRING",
                    "description": "Noms des chambres souhaitées si mentionnés.",
                },
                "activate_heating": {
                    "type": "BOOLEAN",
                    "description": "True si l'utilisateur demande d'allumer le chauffage à 20 °C, False s'il demande le hors-gel. Omettre si non précisé.",
                },
                "heating_explicitly_stated": {
                    "type": "BOOLEAN",
                    "description": "True UNIQUEMENT si l'utilisateur a explicitement mentionné le chauffage dans son message.",
                },
                "notes": {
                    "type": "STRING",
                    "description": "Notes ou précisions sur le séjour.",
                },
                "assistant_message": {
                    "type": "STRING",
                    "description": "Réponse conviviale en français accompagnant la carte de réservation.",
                },
            },
            "required": ["operation", "assistant_message"],
        },
    },
    {
        "name": "propose_heating_or_pool_action",
        "description": (
            "Propose de programmer ou modifier le mode de la chaudière fioul Viessmann du Presbytère "
            "('standby' hors-gel ou 'dhwAndHeating' confort chauffage + ECS, consigne en °C) ou de la piscine Klereo."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "equipment": {
                    "type": "STRING",
                    "description": "'heating' (chaudière fioul Presbytère) ou 'pool' (piscine Klereo).",
                },
                "mode": {
                    "type": "STRING",
                    "description": "Pour chaudière : 'dhwAndHeating' (confort chauffage+ECS), 'standby' (hors-gel/veille), ou 'dhw' (eau chaude seule). Pour piscine : 'confort' ou 'eco'.",
                },
                "target_temperature": {
                    "type": "NUMBER",
                    "description": "Température de consigne souhaitée en °C (ex: 20.0 pour le Presbytère, 27.0 pour la piscine).",
                },
                "filtration_mode": {
                    "type": "STRING",
                    "description": "Pour la piscine : 'auto', 'marche' ou 'arret'.",
                },
                "assistant_message": {
                    "type": "STRING",
                    "description": "Réponse conviviale en français accompagnant la carte de pilotage thermique.",
                },
            },
            "required": ["equipment", "mode", "assistant_message"],
        },
    },
    {
        "name": "propose_invoice_or_document_upload",
        "description": (
            "Extrait en multimodal les informations d'une facture, devis, reçu, photo ou PDF d'artisan "
            "(artisan/fournisseur, date, montant TTC en €, intitulé/titre, bâtiment concerné) et prépare "
            "son enregistrement comptable en demandant si le membre l'a avancée personnellement."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "supplier": {
                    "type": "STRING",
                    "description": "Nom de l'artisan, entreprise ou fournisseur extrait du document ou du message.",
                },
                "title": {
                    "type": "STRING",
                    "description": "Intitulé clair des travaux ou de la fourniture (ex: 'Réparation fuite toiture Presbytère').",
                },
                "amount": {
                    "type": "NUMBER",
                    "description": "Montant total TTC en euros (ex: 345.50).",
                },
                "expense_date": {
                    "type": "STRING",
                    "description": "Date de la facture au format YYYY-MM-DD.",
                },
                "building": {
                    "type": "STRING",
                    "description": "Bâtiment concerné ('Presbytère', 'Rosings', 'Piscine', 'Jardin & Espaces Verts', 'SCI'). Laisser vide si ambigu.",
                },
                "category": {
                    "type": "STRING",
                    "description": "Catégorie comptable (ex: 'Entretien & Réparations', 'Chauffage & Énergie', 'Jardin & Piscine').",
                },
                "advanced_by_member": {
                    "type": "BOOLEAN",
                    "description": "True si le membre a avancé/payé la facture personnellement, False si la SCI doit la payer.",
                },
                "payer_explicitly_stated": {
                    "type": "BOOLEAN",
                    "description": "True UNIQUEMENT si l'utilisateur a explicitement dit dans son message s'il l'avait payée/avancée personnellement ou si la SCI devait la payer.",
                },
                "assistant_message": {
                    "type": "STRING",
                    "description": "Réponse conviviale en français résumant l'extraction de la facture.",
                },
            },
            "required": ["title", "amount", "assistant_message"],
        },
    },
    {
        "name": "propose_task_action",
        "description": (
            "Propose de cocher une tâche existante comme TERMINEE, ou de créer / attribuer une tâche "
            "d'entretien ou de travaux sur le domaine."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {
                    "type": "STRING",
                    "description": "'complete' (cocher comme TERMINEE), 'create' (créer une nouvelle tâche) ou 'assign' (attribuer).",
                },
                "task_id": {
                    "type": "INTEGER",
                    "description": "ID exact de la tâche existante dans la liste des tâches du bac à sable.",
                },
                "title": {
                    "type": "STRING",
                    "description": "Titre de la tâche.",
                },
                "description": {
                    "type": "STRING",
                    "description": "Description détaillée ou notes d'achèvement.",
                },
                "subject": {
                    "type": "STRING",
                    "description": "Lieu ou sujet : 'Presbytère', 'Rosings', 'Piscine', 'Jardin & Espaces Verts', 'SCI & Administratif'.",
                },
                "priority": {
                    "type": "STRING",
                    "description": "'Critique', 'Haute', 'Normale' ou 'Planifié'.",
                },
                "assigned_to": {
                    "type": "STRING",
                    "description": "Prénom ou nom complet du membre à qui attribuer la tâche.",
                },
                "charge_points": {
                    "type": "INTEGER",
                    "description": "Points de pénibilité / charge (1, 2, 3, 5 ou 8).",
                },
                "status": {
                    "type": "STRING",
                    "description": "'TERMINEE' (pour clôturer) ou 'A_FAIRE'.",
                },
                "assistant_message": {
                    "type": "STRING",
                    "description": "Réponse conviviale en français accompagnant la carte de tâche.",
                },
            },
            "required": ["operation", "title", "assistant_message"],
        },
    },
    {
        "name": "propose_poll_or_vote_action",
        "description": (
            "Propose d'enregistrer le vote du membre sur un scrutin ouvert (simple POUR/CONTRE/ABSTENTION "
            "ou sondage multi-dates/options) ou de créer un nouveau scrutin familial."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {
                    "type": "STRING",
                    "description": "'vote' (voter sur un scrutin existant) ou 'create' (créer un nouveau scrutin).",
                },
                "project_id": {
                    "type": "INTEGER",
                    "description": "ID exact du scrutin / projet existant.",
                },
                "title": {
                    "type": "STRING",
                    "description": "Titre du scrutin visé ou à créer.",
                },
                "vote": {
                    "type": "STRING",
                    "description": "Choix de vote ('POUR', 'CONTRE', 'ABSTENTION', ou option/date choisie). Laisser vide si l'utilisateur n'a pas encore indiqué son choix.",
                },
                "comment": {
                    "type": "STRING",
                    "description": "Commentaire accompagnant le vote.",
                },
                "estimated_cost": {
                    "type": "NUMBER",
                    "description": "Budget estimé en € si création de projet soumis au vote.",
                },
                "options": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Liste des options de vote si création d'un scrutin (ex: ['POUR', 'CONTRE', 'ABSTENTION'] ou dates).",
                },
                "assistant_message": {
                    "type": "STRING",
                    "description": "Réponse conviviale en français accompagnant la carte de scrutin/vote.",
                },
            },
            "required": ["operation", "title", "assistant_message"],
        },
    },
    {
        "name": "read_treasury_and_banking",
        "description": (
            "Outil de LECTURE SEULE : consulte le solde bancaire réel Swan de la SCI, l'IBAN officiel, "
            "les dernières transactions bancaires, les soldes CCA et appels de fonds des 7 associés, "
            "ainsi que les factures et avances de frais enregistrées."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "member_name": {
                    "type": "STRING",
                    "description": "Prénom optionnel d'un associé sur lequel zoomer (ex: 'Frédéric', 'Joséphine', 'Henri').",
                },
            },
        },
    },
    {
        "name": "read_tasks_and_equity",
        "description": (
            "Outil de LECTURE SEULE : lit le détail complet des tâches du domaine (descriptions complètes, "
            "numéros de téléphone d'artisans, consignes pas-à-pas, commentaires, pièces jointes PDF et "
            "répartition des points de contribution/équité entre associés)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "task_id": {
                    "type": "INTEGER",
                    "description": "ID précis d'une tâche si connue (ex: 84, 79, 80, 83).",
                },
                "status_filter": {
                    "type": "STRING",
                    "description": "Filtre optionnel par statut ('EN_COURS', 'TERMINEE', 'A_FAIRE', 'ALL').",
                },
                "search_query": {
                    "type": "STRING",
                    "description": "Mot-clé optionnel (ex: 'fioul', 'fosse', 'piscine', 'Josse').",
                },
            },
        },
    },
    {
        "name": "read_stays_and_calendar",
        "description": (
            "Outil de LECTURE SEULE : consulte le calendrier complet des séjours (dates et heures exactes "
            "d'arrivée/départ, bâtiment Presbytère/Rosings, chambres réservées, nombre d'occupants et "
            "options domotiques chauffage/ECS)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "include_past": {
                    "type": "BOOLEAN",
                    "description": "True pour inclure les séjours passés, False pour uniquement les séjours à venir.",
                },
            },
        },
    },
    {
        "name": "read_polls_and_votes",
        "description": (
            "Outil de LECTURE SEULE : consulte tous les scrutins, sondages multi-dates et projets "
            "(ouverts, proposés ou archivés), leurs options, commentaires et les votes individuels des 7 associés."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "project_id": {
                    "type": "INTEGER",
                    "description": "ID précis d'un scrutin si connu.",
                },
            },
        },
    },
    {
        "name": "read_heating_and_pool_status",
        "description": (
            "Outil de LECTURE SEULE : lit la télémétrie détaillée de la chaudière Viessmann ViCare du Presbytère "
            "(températures, mode, programmation jour 20 °C / abaissement nuit 6 °C à 21h00, état en ligne de la "
            "passerelle Vitoconnect, heures brûleur, estimation fioul et historique récent) et de la piscine Klereo."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {},
        },
    },
    {
        "name": "read_documents_and_contracts",
        "description": (
            "Outil de LECTURE SEULE : recherche parmi les ~88 documents officiels de la SCI sur le site "
            "(contrats SEPASE, factures d'eau/fioul/artisans, avis de taxe foncière DGFiP, RIB Swan, statuts, "
            "PV d'AG, rapport Bompais) OU lit intégralement le contenu PDF/image d'un document précis via document_id."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "search_query": {
                    "type": "STRING",
                    "description": "Mots-clés de recherche (ex: 'taxe fonciere', 'sepase presbytere', 'josse', 'rib', 'bompais').",
                },
                "category": {
                    "type": "STRING",
                    "description": "Catégorie optionnelle (ex: 'Factures', 'Fiscalité', 'Chauffage', 'Eau').",
                },
                "document_id": {
                    "type": "INTEGER",
                    "description": "ID exact d'un document (ex: 163, 177, 162) pour charger et lire directement son PDF/image.",
                },
            },
        },
    },
]

READ_ONLY_TOOL_NAMES = {
    "read_treasury_and_banking",
    "consult_treasury_and_ledger",
    "read_tasks_and_equity",
    "read_stays_and_calendar",
    "read_polls_and_votes",
    "read_heating_and_pool_status",
    "read_documents_and_contracts",
}


def _normalize_date_2026(date_str: Optional[str]) -> Optional[str]:
    if not date_str:
        return None
    s = str(date_str).strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2}-\d{2})$", s)
    if m:
        yr = int(m.group(1))
        if yr < 2025:
            return f"2026-{m.group(2)}"
    return s


def _build_system_prompt(state: Dict[str, Any], attachment_name: Optional[str] = None) -> str:
    member = state.get("active_member") or {}
    treasury = state.get("treasury") or {}
    swan = state.get("swan_banking") or {}
    assoc_balances = state.get("associates_balances") or []
    heating = state.get("heating_telemetry") or {}
    stays = state.get("stays") or []
    tasks = state.get("tasks") or []
    votes = state.get("open_votes") or []
    docs_count = state.get("documents_count") or 0

    stays_txt = "\n".join(
        f"  - Séjour #{s['id']} : {s['property_name']} du {s['start_date']} ({s.get('arrival_time', '15:00')}) "
        f"au {s['end_date']} ({s.get('departure_time', '11:00')}) par {s['user_name']} ({s['guest_count']} pers., statut={s['status']})"
        for s in stays[:15]
    ) or "  (Aucun séjour enregistré)"

    tasks_txt = "\n".join(
        f"  - Tâche #{t['id']} [{t['status']}] ({t['subject']}, {t.get('charge_points', 3)} pts) : « {t['title']} » "
        f"(assignée à: {', '.join(str(x) for x in t.get('assigned_members', [])) or 'Non assignée'})"
        for t in tasks[:20]
    ) or "  (Aucune tâche)"

    votes_txt = "\n".join(
        f"  - Scrutin #{v['id']} [{v['status']}] : « {v['title']} » (options: {v['options'] or ['POUR', 'CONTRE', 'ABSTENTION']}, "
        f"choix multiples={v.get('allow_multiple_choices')}, votre vote: {v.get('member_vote') or 'Non voté'})"
        for v in votes[:15]
    ) or "  (Aucun scrutin)"

    assoc_txt = " | ".join(
        f"{a['name']}: {a['cca_balance']:+.2f} € (cotis. {a['monthly_contribution']:.0f} €/m)"
        for a in assoc_balances
    )

    entries_txt = "\n".join(
        f"  - {e.get('entry_date', '')[:10]} | {e.get('entry_type')} | {float(e.get('amount') or 0):+.2f} € | "
        f"Solde après: {float(e.get('balance_after') or 0):+.2f} € | {e.get('description') or ''}"
        for e in (treasury.get("recent_entries") or [])[:10]
    ) or "  (Aucune écriture au grand livre)"

    calls_txt = "\n".join(
        f"  - {c.get('reference')} ({c.get('period_label')}) : cotisation={c.get('theoretical_contribution'):.2f} €, "
        f"avances déduites={c.get('approved_expenses_total'):.2f} €, net à payer={c.get('amount_due'):.2f} €, statut={c.get('status')}"
        for c in (treasury.get("calls_for_funds") or [])[:6]
    ) or "  (Aucun appel de fonds)"

    gateway_note = (
        f"HORS LIGNE depuis {heating.get('recorded_at')} (dernier relevé servi)"
        if heating.get("is_gateway_offline")
        else f"EN LIGNE (relevé {heating.get('recorded_at')})"
    )

    attach_info = (
        f"\nDOCUMENT / PIÈCE JOINTE FOURNIE DANS CE MESSAGE : « {attachment_name} » (analyse son contenu visuel/texte avec précision)."
        if attachment_name
        else ""
    )

    return f"""Tu es l'assistant familial intelligent (« Mode Grille-Pain ») de la SCI Hellenvilliers (Domaine familial en Normandie : Presbytère, Rosings et L'Annexe).
Date du jour de référence : {datetime.utcnow().strftime('%Y-%m-%d')} (année 2026).

MODE DE SÉCURITÉ ACTIF (BAC À SABLE ISOLÉ) :
- LECTURE 100 % BRANCHÉE SUR LES VRAIES DONNÉES : tu disposes de 6 outils `read_*` (`read_treasury_and_banking`, `read_tasks_and_equity`, `read_stays_and_calendar`, `read_polls_and_votes`, `read_heating_and_pool_status`, `read_documents_and_contracts`) reliés aux données réelles de la SCI ({docs_count} documents officiels PDF/images consultables). Appelle systématiquement l'outil `read_*` approprié dès qu'une question porte sur le détail d'une tâche (numéros d'artisans, consignes), un document/contrat/facture, les transactions bancaires ou l'historique thermique.
- ÉCRITURE 100 % INTERCEPTÉE (ZÉRO MODIFICATION DE L'ÉTAT RÉEL) : toute demande d'écriture passe par un outil `propose_*` qui génère une Carte d'Action Hybride (🟢 déduit / 🔴 manquant) et ne s'exécute QUE dans le miroir SQLite éphémère du bac à sable, avec coupe-circuit total sur PostgreSQL prod, la chaudière ViCare, la piscine Klereo et les e-mails Resend.

ASSOCIÉ INCARNÉ ACTUEL :
- ID : {member.get('id')} | Nom : {member.get('name')} (Prénom : {member.get('prenom')}) | Rôle : {member.get('role')}
- Référence virement permanente : {member.get('payment_reference')}
- Quote-part mensuelle statutaire : {float(treasury.get('monthly_contribution') or 50.0):.2f} € / mois
- Solde actuel du Grand Livre (CCA) : {float(treasury.get('balance') or 0.0):+.2f} € ({treasury.get('covered_months', 0)} mois d'avance couverts)

TRÉSORERIE GLOBALE SCI & COMPTE SWAN :
- Compte Swan ({swan.get('iban')}) : solde réel = {float(swan.get('balance') or 0.0):.2f} € (dernière synchro : {swan.get('last_synced_at')})
- Soldes CCA des 7 associés : {assoc_txt}

ÉCRITURES RÉCENTES DU GRAND LIVRE DE {member.get('prenom', '').upper()} :
{entries_txt}

APPELS DE FONDS DE {member.get('prenom', '').upper()} :
{calls_txt}

ÉTAT THERMIQUE & CHAUDIÈRE FIOUL (PRESBYTÈRE) & PISCINE :
- Passerelle Vitoconnect : {gateway_note}
- Mode chaudière ViCare : {heating.get('mode')} | Consigne confort jour : {heating.get('comfort_temperature', 20.0)} °C (04h30–21h00) | Réduit nuit : {heating.get('reduced_temperature', 6.0)} °C (21h00–04h30, pas de chauffe la nuit)
- Température ambiante Presbytère : {heating.get('room_temperature')} °C | Extérieure : {heating.get('outside_temperature')} °C
- Cuve de fioul (3 000 L, estimation logicielle sur compteurs brûleur) : {heating.get('fuel_liters_remaining')} L restants ({heating.get('fuel_percent')} %)
- Piscine Klereo : mode {heating.get('pool_mode')} ({heating.get('pool_temperature')} °C, filtration {heating.get('pool_filtration_mode')})

SÉJOURS ENREGISTRÉS :
{stays_txt}

TÂCHES DU DOMAINE (appelle `read_tasks_and_equity` pour lire les descriptions détaillées et contacts) :
{tasks_txt}

SCRUTINS & SONDAGES :
{votes_txt}
{attach_info}

RÈGLES D'OR D'ORCHESTRATION :
1. Pour toute question d'information détaillée (numéro d'un artisan dans une tâche, contenu d'une facture/contrat PDF, détail des virements Swan, votes d'un scrutin, paramètres ViCare), appelle d'abord le ou les outils `read_*` correspondants pour vérifier les faits exacts avant de répondre.
2. Dès que l'associé exprime une intention d'action (réserver/modifier/annuler un séjour, régler le chauffage ou la piscine, déposer une facture/photo/PDF, cocher une tâche comme terminée ou créer une tâche, voter sur un scrutin ou créer un sondage), appelle OBLIGATOIREMENT l'outil `propose_*` correspondant.
3. Ne devine pas en silence un paramètre critique non mentionné par l'utilisateur :
   - Pour un séjour (`propose_stay_action`), si l'utilisateur n'a pas mentionné le chauffage, mets `heating_explicitly_stated=false`. S'il n'a pas précisé le bâtiment (`Presbytère` ou `Rosings`), laisse `building` vide `""`.
   - Pour une facture (`propose_invoice_or_document_upload`), extrais l'artisan, la date, le montant TTC et l'objet, et si l'utilisateur n'a pas explicitement dit s'il l'avait avancée personnellement ou si la SCI devait la payer, mets `payer_explicitly_stated=false`.
4. Sois chaleureux, concis et précis au centime près, sans jamais inventer de chiffre."""


def _build_action_card(
    func_name: str,
    args: Dict[str, Any],
    state: Dict[str, Any],
    attachment_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    member = state.get("active_member") or {}
    deduced: List[Dict[str, Any]] = []
    missing: List[Dict[str, Any]] = []

    if func_name == "propose_stay_action":
        operation = str(args.get("operation") or "create").lower()
        building = str(args.get("building") or "").strip()
        start_date = _normalize_date_2026(args.get("start_date"))
        end_date = _normalize_date_2026(args.get("end_date"))
        arrival_time = str(args.get("arrival_time") or "15:00")
        departure_time = str(args.get("departure_time") or "11:00")
        guest_count = int(args.get("guest_count") or 1)
        chambers_used = int(args.get("chambers_used") or max(1, (guest_count + 1) // 2))
        heating_explicit = bool(args.get("heating_explicitly_stated", False))
        activate_heating = args.get("activate_heating")

        if building:
            deduced.append({"key": "building", "label": "Bâtiment", "value": building})
        else:
            missing.append(
                {
                    "key": "building",
                    "label": "Bâtiment",
                    "question": "Dans quel bâtiment souhaitez-vous séjourner ?",
                    "options": [
                        {"label": "🏡 Presbytère", "value": "Presbytère"},
                        {"label": "🏰 Rosings", "value": "Rosings"},
                    ],
                }
            )

        if start_date:
            deduced.append({"key": "start_date", "label": "Date d'arrivée", "value": start_date})
        else:
            missing.append(
                {
                    "key": "start_date",
                    "label": "Date d'arrivée",
                    "question": "Quelle est votre date d'arrivée (YYYY-MM-DD) ?",
                    "options": [
                        {"label": "Vendredi prochain (2026-11-13)", "value": "2026-11-13"},
                        {"label": "Samedi prochain (2026-11-14)", "value": "2026-11-14"},
                    ],
                }
            )

        if end_date:
            deduced.append({"key": "end_date", "label": "Date de départ", "value": end_date})
        elif start_date:
            deduced.append({"key": "end_date", "label": "Date de départ", "value": start_date})

        deduced.append({"key": "guest_count", "label": "Nombre de personnes", "value": guest_count})
        deduced.append({"key": "chambers_used", "label": "Chambres occupées", "value": chambers_used})

        is_presb_or_unknown = (not building) or ("presbyt" in building.lower())
        if operation != "cancel" and is_presb_or_unknown:
            if heating_explicit and activate_heating is not None:
                deduced.append(
                    {
                        "key": "activate_heating",
                        "label": "Chauffage Presbytère (20 °C)",
                        "value": bool(activate_heating),
                    }
                )
            else:
                missing.append(
                    {
                        "key": "activate_heating",
                        "label": "Chauffage fioul Presbytère (20 °C)",
                        "question": "Souhaitez-vous activer le chauffage fioul du Presbytère à 20 °C pour votre arrivée ?",
                        "options": [
                            {"label": "🔥 Oui, chauffer à 20 °C", "value": True},
                            {"label": "❄️ Non, laisser en hors-gel", "value": False},
                        ],
                    }
                )

        payload = {
            "operation": operation,
            "reservation_id": args.get("reservation_id"),
            "building": building or "Presbytère",
            "start_date": start_date or "2026-11-14",
            "end_date": end_date or start_date or "2026-11-16",
            "arrival_time": arrival_time,
            "departure_time": departure_time,
            "guest_count": guest_count,
            "chambers_used": chambers_used,
            "selected_rooms": args.get("selected_rooms") or "",
            "activate_heating": bool(activate_heating) if activate_heating is not None else True,
            "target_temperature": 20.0,
            "notes": args.get("notes") or "",
        }
        title = (
            f"Annulation de séjour ({building or 'Domaine'})"
            if operation == "cancel"
            else f"Réservation de séjour — {building or 'Bâtiment à préciser'}"
        )
        return {
            "action_type": "stay",
            "title": title,
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_heating_or_pool_action":
        equipment = str(args.get("equipment") or "heating").lower()
        mode = str(args.get("mode") or "").strip()
        target_temp = args.get("target_temperature")

        is_pool = "pool" in equipment or "piscine" in equipment
        deduced.append(
            {
                "key": "equipment",
                "label": "Équipement",
                "value": "Piscine Klereo" if is_pool else "Chaudière fioul Viessmann (Presbytère)",
            }
        )
        if mode:
            deduced.append({"key": "mode", "label": "Mode demandé", "value": mode})
        else:
            missing.append(
                {
                    "key": "mode",
                    "label": "Mode de fonctionnement",
                    "question": "Quel mode souhaitez-vous appliquer ?",
                    "options": [
                        {"label": "🔥 Confort Chauffage + ECS (dhwAndHeating)", "value": "dhwAndHeating"},
                        {"label": "❄️ Hors-Gel / Veille (standby)", "value": "standby"},
                    ],
                }
            )

        if target_temp is not None:
            deduced.append({"key": "target_temperature", "label": "Consigne (°C)", "value": float(target_temp)})
        else:
            default_t = 27.0 if is_pool else (20.0 if mode != "standby" else 10.0)
            deduced.append({"key": "target_temperature", "label": "Consigne (°C)", "value": default_t})
            target_temp = default_t

        payload = {
            "equipment": "pool" if is_pool else "heating",
            "mode": mode or "dhwAndHeating",
            "target_temperature": float(target_temp),
            "filtration_mode": args.get("filtration_mode") or "marche",
        }
        return {
            "action_type": "heating",
            "title": "Pilotage Piscine Klereo" if is_pool else "Pilotage Chaudière Viessmann (Presbytère)",
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_invoice_or_document_upload":
        supplier = str(args.get("supplier") or "Artisan").strip()
        title = str(args.get("title") or f"Facture {supplier}").strip()
        amount = float(args.get("amount") or 0.0)
        expense_date = _normalize_date_2026(args.get("expense_date")) or datetime.utcnow().strftime("%Y-%m-%d")
        building = str(args.get("building") or "").strip()
        category = str(args.get("category") or "Entretien & Fournitures").strip()
        payer_explicit = bool(args.get("payer_explicitly_stated", False))
        advanced_by_member = args.get("advanced_by_member")

        deduced.append({"key": "title", "label": "Intitulé", "value": title})
        deduced.append({"key": "supplier", "label": "Artisan / Fournisseur", "value": supplier})
        deduced.append({"key": "amount", "label": "Montant TTC (€)", "value": round(amount, 2)})
        deduced.append({"key": "expense_date", "label": "Date de facture", "value": expense_date})
        deduced.append({"key": "category", "label": "Catégorie", "value": category})

        if building:
            deduced.append({"key": "building", "label": "Bâtiment", "value": building})
        else:
            missing.append(
                {
                    "key": "building",
                    "label": "Bâtiment concerné",
                    "question": "À quel bâtiment ou équipement se rattache cette facture ?",
                    "options": [
                        {"label": "🏡 Presbytère", "value": "Presbytère"},
                        {"label": "🏰 Rosings", "value": "Rosings"},
                        {"label": "🏊 Piscine", "value": "Piscine"},
                        {"label": "🌳 Domaine / Jardin", "value": "Domaine"},
                    ],
                }
            )

        if payer_explicit and advanced_by_member is not None:
            deduced.append(
                {
                    "key": "advanced_by_member",
                    "label": "Avancée personnellement",
                    "value": bool(advanced_by_member),
                }
            )
        else:
            missing.append(
                {
                    "key": "advanced_by_member",
                    "label": "Avance personnelle",
                    "question": f"Avez-vous avancé et réglé cette facture personnellement ({member.get('prenom', 'Associé')}), ou doit-elle être payée par la SCI ?",
                    "options": [
                        {"label": "💳 Oui, avancée personnellement (crédit CCA)", "value": True},
                        {"label": "🏛️ Non, à régler directement par la SCI", "value": False},
                    ],
                }
            )

        payload = {
            "title": title,
            "supplier": supplier,
            "amount": round(amount, 2),
            "expense_date": expense_date,
            "building": building or "Presbytère",
            "category": category,
            "advanced_by_member": bool(advanced_by_member) if advanced_by_member is not None else True,
            "document_filename": attachment_name or "facture_jointe.pdf",
        }
        return {
            "action_type": "expense",
            "title": f"Enregistrement de facture — {supplier} ({amount:.2f} € TTC)",
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_task_action":
        operation = str(args.get("operation") or "complete").lower()
        task_id = args.get("task_id")
        title = str(args.get("title") or "").strip()
        subject = str(args.get("subject") or "Presbytère").strip()
        priority = str(args.get("priority") or "Normale").strip()
        assigned_to = str(args.get("assigned_to") or member.get("name") or "").strip()
        status_val = "TERMINEE" if operation == "complete" else str(args.get("status") or "A_FAIRE")

        if task_id:
            deduced.append({"key": "task_id", "label": "ID Tâche", "value": int(task_id)})
        deduced.append({"key": "title", "label": "Tâche", "value": title})
        deduced.append({"key": "operation", "label": "Action", "value": "Clôturer (TERMINEE)" if operation == "complete" else "Créer / Attribuer"})
        deduced.append({"key": "subject", "label": "Lieu / Bâtiment", "value": subject})
        deduced.append({"key": "status", "label": "Nouveau statut", "value": status_val})
        if assigned_to:
            deduced.append({"key": "assigned_to", "label": "Responsable", "value": assigned_to})

        payload = {
            "operation": operation,
            "task_id": int(task_id) if task_id is not None else None,
            "title": title,
            "description": args.get("description") or title,
            "subject": subject,
            "priority": priority,
            "assigned_to": assigned_to,
            "charge_points": int(args.get("charge_points") or 3),
            "status": status_val,
        }
        return {
            "action_type": "task",
            "title": f"Validation de tâche : « {title} »" if operation == "complete" else f"Nouvelle tâche : « {title} »",
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_poll_or_vote_action":
        operation = str(args.get("operation") or "vote").lower()
        project_id = args.get("project_id")
        title = str(args.get("title") or "Scrutin familial").strip()
        vote_val = str(args.get("vote") or "").strip()
        comment = str(args.get("comment") or "").strip()
        options = args.get("options") or ["POUR", "CONTRE", "ABSTENTION"]

        if project_id:
            deduced.append({"key": "project_id", "label": "Scrutin #", "value": int(project_id)})
        deduced.append({"key": "title", "label": "Scrutin", "value": title})

        if operation == "vote":
            if vote_val:
                deduced.append({"key": "vote", "label": "Vote", "value": vote_val})
            else:
                # Chercher les options du scrutin dans l'état du bac à sable
                poll_opts = ["POUR", "CONTRE", "ABSTENTION"]
                for p in state.get("open_votes") or []:
                    if (project_id and p["id"] == int(project_id)) or (title.lower() in p["title"].lower()):
                        if p.get("options"):
                            poll_opts = p["options"]
                        break
                missing.append(
                    {
                        "key": "vote",
                        "label": "Votre choix de vote",
                        "question": f"Quel est votre vote sur « {title} » ?",
                        "options": [{"label": str(o), "value": str(o)} for o in poll_opts],
                    }
                )
            if comment:
                deduced.append({"key": "comment", "label": "Commentaire", "value": comment})
        else:
            deduced.append({"key": "options", "label": "Options soumises au vote", "value": ", ".join(str(o) for o in options)})
            if args.get("estimated_cost"):
                deduced.append({"key": "estimated_cost", "label": "Budget estimé (€)", "value": float(args["estimated_cost"])})

        payload = {
            "operation": operation,
            "project_id": int(project_id) if project_id is not None else None,
            "title": title,
            "vote": vote_val or "POUR",
            "comment": comment,
            "estimated_cost": float(args.get("estimated_cost") or 0.0),
            "options": options,
        }
        return {
            "action_type": "vote",
            "title": f"Vote sur « {title} »" if operation == "vote" else f"Nouveau scrutin : « {title} »",
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    return None


@router.get("/state")
def get_toaster_state_endpoint(
    member_id: Optional[int] = Query(None, description="ID du membre actif dans le simulateur Grille-Pain"),
    db: Session = Depends(get_db),
):
    """
    Initialise le bac à sable SQLite s'il n'existe pas encore, et retourne :
    - la liste des membres (id, prenom, nom, email)
    - le résumé complet du membre actif (solde trésorerie, séjours, tâches, votes ouverts, télémétrie chauffage/fioul)
    - les sandbox_audit_logs
    """
    return get_sandbox_state(prod_db=db, member_id=member_id)


@router.post("/reset")
def reset_toaster_sandbox_endpoint(
    member_id: Optional[int] = Query(None),
    body: Optional[ToasterResetRequest] = Body(None),
    db: Session = Depends(get_db),
):
    """Réinitialise le bac à sable SQLite depuis PostgreSQL prod et vide sandbox_audit_logs."""
    reset_info = init_or_reset_sandbox(prod_db=db)
    target_member_id = member_id or (body.member_id if body else None)
    state = get_sandbox_state(prod_db=db, member_id=target_member_id)
    return {
        "status": "ok",
        "message": "Bac à sable SQLite réinitialisé avec succès depuis PostgreSQL prod.",
        "reset_info": reset_info,
        "state": state,
        **state,
    }


@router.get("/chat")
def toaster_chat_get_info(request: Request):
    """
    Si un utilisateur clique sur /api/toaster/chat dans un navigateur, redirige directement
    vers l'interface conversationnelle déployée /grille-pain (au lieu d'un 404 Not Found).
    """
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        return RedirectResponse(url="/grille-pain", status_code=302)
    return {
        "status": "ok",
        "endpoint": "POST /api/toaster/chat",
        "ui_url": "https://hellenvilliers.henri-jamet.com/grille-pain",
        "model": GEMINI_MODEL,
        "mode": "sandbox_isolated_writes_with_live_reads",
    }


@router.post("/chat")
def toaster_chat_endpoint(
    req: ToasterChatRequest,
    db: Session = Depends(get_db),
):
    """
    Orchestrateur conversationnel et multimodal via models/gemini-4-hydrogen (Thinking HIGH) :
    - Exécute en boucle multi-tours tous les outils de LECTURE SEULE (`read_*`) sur les vraies données ;
    - Intercepte 100 % des intentions d'ÉCRITURE (`propose_*`) sous forme de Carte d'Action Hybride
      exécutable uniquement dans le bac à sable SQLite isolé (zéro écriture Postgres prod / ViCare / Klereo / SMTP).
    """
    state = get_sandbox_state(prod_db=db, member_id=req.member_id)
    system_prompt = _build_system_prompt(state=state, attachment_name=req.attachment_name)

    raw_messages = list(req.messages or [])
    if req.message and (not raw_messages or raw_messages[-1].get("content") != req.message):
        raw_messages.append({"role": "user", "content": req.message})

    if not raw_messages and req.attachment_base64:
        raw_messages.append(
            {
                "role": "user",
                "content": f"Voici un document joint ({req.attachment_name or 'facture'}). Peux-tu l'analyser et préparer son enregistrement ?",
            }
        )

    if not raw_messages:
        raise HTTPException(status_code=400, detail="Aucun message ni pièce jointe fourni à /api/toaster/chat.")

    contents: List[Dict[str, Any]] = []
    for idx, msg in enumerate(raw_messages):
        role_raw = str(msg.get("role") or "user").lower()
        role = "model" if role_raw in ("assistant", "model", "bot") else "user"
        text_val = str(msg.get("content") or msg.get("text") or "").strip()

        parts: List[Dict[str, Any]] = []
        if text_val:
            parts.append({"text": text_val})

        is_last = idx == len(raw_messages) - 1
        if is_last and req.attachment_base64:
            b64_str = req.attachment_base64.strip()
            mime_type = (req.attachment_mime or "").strip()
            if b64_str.startswith("data:") and ";base64," in b64_str:
                header, b64_str = b64_str.split(";base64,", 1)
                if not mime_type:
                    mime_type = header.replace("data:", "", 1).strip()
            if not mime_type:
                if req.attachment_name and req.attachment_name.lower().endswith(".pdf"):
                    mime_type = "application/pdf"
                elif req.attachment_name and req.attachment_name.lower().endswith(".png"):
                    mime_type = "image/png"
                else:
                    mime_type = "image/jpeg"
            parts.append(
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": b64_str,
                    }
                }
            )
            if not text_val:
                parts.insert(
                    0,
                    {"text": f"Analyse cette pièce jointe ({req.attachment_name or 'document'}) et propose l'action correspondante."},
                )

        if not parts:
            continue

        if not contents and role == "model":
            continue

        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"].extend(parts)
        else:
            contents.append({"role": role, "parts": parts})

    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Bonjour !"}]})

    api_key = _get_toaster_api_key()
    url = f"{GEMINI_ENDPOINT}?key={api_key}"

    tools_called_trace: List[str] = []
    write_func_call: Optional[Dict[str, Any]] = None
    text_fragments: List[str] = []

    with httpx.Client(timeout=55.0) as client:
        for _step in range(4):
            gemini_payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "tools": [{"functionDeclarations": TOASTER_FUNCTION_DECLARATIONS}],
                "generationConfig": {
                    "temperature": 0.2,
                    "thinkingConfig": {
                        "thinkingLevel": "HIGH",
                    },
                },
            }
            resp = client.post(url, json=gemini_payload)
            if resp.status_code != 200:
                logger.error(f"[TOASTER GEMINI ERROR] HTTP {resp.status_code}: {resp.text}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Erreur lors de l'appel à {GEMINI_MODEL} (HTTP {resp.status_code}) : {resp.text}",
                )

            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                raise HTTPException(status_code=502, detail=f"Réponse vide de {GEMINI_MODEL} : {data}")

            model_content = candidates[0].get("content") or {"role": "model", "parts": []}
            parts_out = model_content.get("parts") or []

            step_texts: List[str] = []
            read_calls: List[Dict[str, Any]] = []
            step_write_call: Optional[Dict[str, Any]] = None

            for part in parts_out:
                if part.get("thought"):
                    continue
                if "text" in part and part["text"]:
                    step_texts.append(part["text"])
                if "functionCall" in part and part["functionCall"]:
                    fc = part["functionCall"]
                    fc_name = fc.get("name") or ""
                    tools_called_trace.append(fc_name)
                    if fc_name in READ_ONLY_TOOL_NAMES:
                        read_calls.append(fc)
                    else:
                        step_write_call = fc

            if step_write_call is not None:
                write_func_call = step_write_call
                text_fragments = step_texts
                break

            if read_calls and _step < 3:
                # Préserver intégralement model_content (y compris thoughtSignature de Gemini 4)
                contents.append(model_content)
                response_parts: List[Dict[str, Any]] = []
                for rc in read_calls:
                    rc_name = rc.get("name") or ""
                    rc_args = rc.get("args") or {}
                    tool_result = execute_sandbox_read_tool(
                        prod_db=db,
                        member_id=req.member_id,
                        tool_name=rc_name,
                        args=rc_args,
                    )
                    inline_att = tool_result.pop("_inline_attachment", None) if isinstance(tool_result, dict) else None
                    response_parts.append(
                        {
                            "functionResponse": {
                                "name": rc_name,
                                "response": {"result": tool_result},
                            }
                        }
                    )
                    if inline_att and inline_att.get("data"):
                        response_parts.append(
                            {
                                "inlineData": {
                                    "mimeType": inline_att.get("mimeType") or "application/pdf",
                                    "data": inline_att["data"],
                                }
                            }
                        )
                contents.append({"role": "user", "parts": response_parts})
                continue

            text_fragments = step_texts
            break

    reply_text = "\n".join(text_fragments).strip()
    action_card: Optional[Dict[str, Any]] = None
    tool_called: Optional[str] = tools_called_trace[-1] if tools_called_trace else None

    if write_func_call:
        w_name = write_func_call.get("name") or ""
        tool_called = w_name
        tool_args = write_func_call.get("args") or {}
        assistant_msg = str(tool_args.get("assistant_message") or "").strip()
        if assistant_msg and not reply_text:
            reply_text = assistant_msg

        action_card = _build_action_card(
            func_name=w_name,
            args=tool_args,
            state=state,
            attachment_name=req.attachment_name,
        )
        if not reply_text and action_card:
            if action_card["missing_fields"]:
                questions = " ".join(m["question"] for m in action_card["missing_fields"])
                reply_text = f"J'ai préparé la carte « {action_card['title']} ». {questions}"
            else:
                reply_text = f"J'ai préparé la carte « {action_card['title']} ». Vous pouvez vérifier les champs et valider l'exécution dans le bac à sable."

    if not reply_text:
        reply_text = "Je suis à votre disposition pour consulter toutes les données de la SCI ou préparer vos actions dans le bac à sable."

    return {
        "model": GEMINI_MODEL,
        "reply": reply_text,
        "message": reply_text,
        "content": reply_text,
        "role": "assistant",
        "tool_called": tool_called,
        "tools_called": tools_called_trace,
        "action_card": action_card,
        "state": state,
    }


@router.post("/execute")
def toaster_execute_endpoint(
    req: ToasterExecuteRequest,
    db: Session = Depends(get_db),
):
    """
    Exécute réellement la mutation issue d'une Carte d'Action Hybride dans le bac à sable SQLite,
    journalise les actions et interceptions matérielles/SMTP dans sandbox_audit_logs,
    et retourne le nouvel état et le message de confirmation.
    """
    merged_payload = dict(req.payload or {})
    if req.deduced_fields:
        for item in req.deduced_fields:
            if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                merged_payload[item["key"]] = item["value"]
    if req.missing_fields:
        for item in req.missing_fields:
            if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                merged_payload[item["key"]] = item["value"]

    try:
        return execute_sandbox_action(
            prod_db=db,
            member_id=req.member_id,
            action_type=req.action_type,
            payload=merged_payload,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
