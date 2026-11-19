import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Member
from ..security import decode_access_token
from ..services.toaster_service import (
    DOMAIN_ROOMS,
    STATUTORY_ASSOCIATE_NAMES,
    TASK_COMPLEXITIES,
    TASK_PRIORITIES,
    TASK_SUBJECTS,
    VADEMECUM_CATEGORIES,
    VOTE_PRIORITIES,
    execute_toaster_action,
    execute_toaster_read_tool,
    get_toaster_state,
    is_summer_date,
    is_winter_date,
    normalize_time_hhmm,
    parse_selected_rooms_list,
    parse_str_list,
    resolve_building_limits,
    resolve_member,
)

logger = logging.getLogger("sci_api.toaster")

_BACKEND_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_BACKEND_ENV_PATH)
load_dotenv()

router = APIRouter(prefix="/api/toaster", tags=["Assistant Grille-Pain"])

GEMINI_MODEL = "models/gemini-4-hydrogen"
GEMINI_GENERATE_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_MODEL}:generateContent"
GEMINI_STREAM_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_MODEL}:streamGenerateContent"


def _get_toaster_api_key() -> str:
    load_dotenv(dotenv_path=_BACKEND_ENV_PATH)
    env_key = os.getenv("GEMINI_TOASTER_API_KEY", "").strip()
    if not env_key:
        raise RuntimeError(
            "GEMINI_TOASTER_API_KEY est absente de l'environnement (backend/.env). "
            "Impossible d'appeler l'orchestrateur Grille-Pain (Fail-Fast)."
        )
    return env_key


def _resolve_request_member_id(request: Request, db: Session, fallback_member_id: Optional[int] = None) -> int:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        payload = decode_access_token(token)
        if isinstance(payload, dict):
            sub_id = payload.get("member_id") or payload.get("id")
            if sub_id and str(sub_id).isdigit():
                m = db.query(Member).filter(Member.id == int(sub_id)).first()
                if m:
                    return m.id
            sub_name = payload.get("sub") or payload.get("prenom") or payload.get("username")
            if sub_name:
                m = resolve_member(db, member_prenom=str(sub_name))
                if m:
                    return m.id
    m = resolve_member(db, member_id=fallback_member_id)
    return m.id if m else 1


class ToasterChatRequest(BaseModel):
    member_id: Optional[int] = None
    messages: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    message: Optional[str] = None
    attachment_base64: Optional[str] = None
    attachment_mime: Optional[str] = None
    attachment_name: Optional[str] = None


class ToasterExecuteRequest(BaseModel):
    member_id: Optional[int] = None
    action_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    deduced_fields: Optional[List[Dict[str, Any]]] = None
    missing_fields: Optional[List[Dict[str, Any]]] = None


TOOL_HUMAN_LABELS: Dict[str, Dict[str, str]] = {
    "read_treasury_and_banking": {"label": "Consultation de la trésorerie Swan & des comptes associés", "icon": "account_balance"},
    "read_tasks_and_equity": {"label": "Vérification des tâches du domaine & du classement", "icon": "task_alt"},
    "read_stays_and_calendar": {"label": "Lecture du calendrier des séjours", "icon": "calendar_month"},
    "read_polls_and_votes": {"label": "Consultation des scrutins & votes des associés", "icon": "how_to_vote"},
    "read_heating_and_pool_status": {"label": "Relevé chauffage Presbytère, cuve fioul & piscine", "icon": "thermostat"},
    "read_documents_and_contracts": {"label": "Recherche dans les documents officiels de la SCI", "icon": "folder_open"},
    "read_vademecum": {"label": "Consultation du Vademecum pratique du domaine", "icon": "menu_book"},
    "inspect_ui_skill": {"label": "Chargement du guide de composant / règle métier", "icon": "auto_stories"},
    "display_ui_component": {"label": "Affichage d'un composant interactif dans la conversation", "icon": "widgets"},
    "propose_stay_action": {"label": "Préparation d'une carte de réservation de séjour", "icon": "event_available"},
    "propose_heating_or_pool_action": {"label": "Préparation d'un réglage chauffage / piscine", "icon": "local_fire_department"},
    "propose_invoice_or_document_upload": {"label": "Extraction multimodale de la facture / pièce jointe", "icon": "receipt_long"},
    "propose_task_action": {"label": "Préparation d'une action sur les tâches", "icon": "assignment_turned_in"},
    "propose_poll_or_vote_action": {"label": "Préparation d'un vote ou nouveau scrutin", "icon": "ballot"},
    "propose_vademecum_action": {"label": "Préparation d'une fiche Vademecum", "icon": "edit_note"},
}


TOASTER_FUNCTION_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "display_ui_component",
        "description": (
            "Affiche directement dans le fil de discussion un composant visuel interactif du site SCI Hellenvilliers "
            "(calendrier des séjours, graphe fioul/chauffage, piscine Klereo, carte de scrutin/vote, cartes de tâches, "
            "synthèse trésorerie, classement/leaderboard participatif, graphique personnalisé sur mesure, "
            "fiches Vademecum, aperçu PDF officiel, ou boutons d'ouverture de formulaires)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "component_id": {
                    "type": "STRING",
                    "description": (
                        "Identifiant du composant à afficher : "
                        "'stays_calendar', 'fuel_and_heating_graph', 'pool_status_widget', 'poll_status_card', "
                        "'tasks_overview_card', 'treasury_overview_card', 'document_viewer_card', "
                        "'leaderboard_card' (classement officiel d'équité tâches vs séjours), "
                        "'custom_chart_card' (graphique personnalisé bar / horizontal_bar / line / pie), "
                        "'vademecum_card' (fiches pratiques du Vademecum avec codes copiables), "
                        "ou 'action_modal_buttons'."
                    ),
                },
                "props": {
                    "type": "OBJECT",
                    "description": (
                        "Paramètres selon le composant : "
                        "{'month': 11, 'year': 2026} pour stays_calendar ; "
                        "{'initial_tab': 'annual'|'temperatures'|'daily'} pour fuel_and_heating_graph ; "
                        "{'project_id': 40} ou {'search_query': 'ménage'} pour poll_status_card ; "
                        "{'assigned_to': 'Joséphine', 'status_filter': 'REVIEW_NEEDED'|'PROPOSED'|'PENDING_VALIDATION'|'EN_COURS'|'ACTIVE'|'ALL', 'task_id': 87, 'task_ids': [87]} pour tasks_overview_card ; "
                        "{'document_id': 177} pour document_viewer_card ; "
                        "{'period': 'all'|'1_year'|'3_months'} pour leaderboard_card ; "
                        "{'title': '...', 'subtitle': '...', 'chart_type': 'bar'|'horizontal_bar'|'line'|'pie', 'unit': '€', 'labels': [...], 'series': [{'name': '...', 'color': '#059669', 'values': [...]}]} pour custom_chart_card ; "
                        "{'search_query': 'wifi', 'category': '...', 'item_id': 41} pour vademecum_card ; "
                        "{'buttons': [{'modal_type': 'stay'|'task'|'poll'|'document'|'vademecum', 'label': '...'}]} pour action_modal_buttons."
                    ),
                },
            },
            "required": ["component_id"],
        },
    },
    {
        "name": "inspect_ui_skill",
        "description": (
            "Charge à la demande les spécifications détaillées d'un domaine ou d'un composant interactif "
            "('ui_components', 'sejours_et_chauffage', 'taches_et_artisans', 'votes_et_ag', 'tresorerie_et_documents', 'vademecum')."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "skill_id": {
                    "type": "STRING",
                    "description": "'ui_components', 'sejours_et_chauffage', 'taches_et_artisans', 'votes_et_ag', 'tresorerie_et_documents' ou 'vademecum'.",
                },
            },
            "required": ["skill_id"],
        },
    },
    {
        "name": "read_treasury_and_banking",
        "description": (
            "LECTURE SEULE : consulte le solde bancaire réel Swan, l'IBAN, les transactions bancaires, "
            "les soldes CCA et appels de fonds des 7 associés, et les avances de frais."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "member_name": {"type": "STRING", "description": "Prénom optionnel d'un associé (ex: 'Frédéric', 'Élisabeth', 'Henri')."},
            },
        },
    },
    {
        "name": "read_tasks_and_equity",
        "description": (
            "LECTURE SEULE : lit les tâches du domaine (descriptions, artisans, consignes, pièces jointes) "
            "et le classement officiel de participation/équité des 7 associés."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "task_id": {"type": "INTEGER", "description": "ID précis d'une tâche si connu."},
                "status_filter": {"type": "STRING", "description": "'EN_COURS', 'PROPOSED', 'TERMINEE', 'A_FAIRE' ou 'ALL'."},
                "search_query": {"type": "STRING", "description": "Mot-clé optionnel (ex: 'fioul', 'wifi', 'piscine')."},
            },
        },
    },
    {
        "name": "read_stays_and_calendar",
        "description": "LECTURE SEULE : consulte le calendrier complet des séjours et la liste officielle des 7 chambres.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "include_past": {"type": "BOOLEAN", "description": "True pour inclure les séjours passés."},
            },
        },
    },
    {
        "name": "read_polls_and_votes",
        "description": "LECTURE SEULE : consulte tous les scrutins, sondages multi-dates et votes des 7 associés.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "project_id": {"type": "INTEGER", "description": "ID précis d'un scrutin si connu."},
            },
        },
    },
    {
        "name": "read_heating_and_pool_status",
        "description": (
            "LECTURE SEULE : lit la télémétrie de la chaudière Viessmann ViCare (Presbytère, niveau fioul, passerelle) "
            "et l'état en direct de la piscine Klereo (Wi-Fi, liaison radio K-Link, alertes, filtration, PAC, sondes)."
        ),
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "read_vademecum",
        "description": (
            "LECTURE SEULE : recherche et lit les fiches pratiques du Vademecum du domaine "
            "(codes Wi-Fi Presbytère & Rosings, clés, poubelles, disjoncteurs, chauffage, piscine, artisans, sécurité)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "search_query": {"type": "STRING", "description": "Mot-clé (ex: 'wifi', 'poubelle', 'clé', 'piscine', 'disjoncteur', 'boite')."},
                "category": {"type": "STRING", "description": "Catégorie optionnelle du Vademecum."},
                "building": {"type": "STRING", "description": "'Presbytère' ou 'Rosings' (optionnel)."},
                "item_id": {"type": "INTEGER", "description": "ID précis d'une fiche Vademecum si connu."},
            },
        },
    },
    {
        "name": "read_documents_and_contracts",
        "description": "LECTURE SEULE : recherche parmi les documents officiels de la SCI ou lit un PDF/image précis via document_id.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "search_query": {"type": "STRING", "description": "Mots-clés de recherche (ex: 'taxe fonciere', 'sepase', 'josse', 'rib')."},
                "category": {"type": "STRING", "description": "Catégorie optionnelle."},
                "document_id": {"type": "INTEGER", "description": "ID exact d'un document pour lire son PDF/image."},
            },
        },
    },
    {
        "name": "propose_stay_action",
        "description": (
            "Propose de créer, modifier ou annuler une réservation de séjour au Domaine d'Hellenvilliers. "
            "ATTENTION CAPACITÉ : Presbytère = 5 chambres max, Rosings = 2 chambres max, tout le domaine = 7 chambres max. "
            "Différencie toujours Eau Chaude Sanitaire (activate_dhw), Chauffage Presbytère (activate_heating) et Piscine (activate_pool), "
            "ainsi que les membres internes SCI (selected_members) et invités extérieurs (external_guests)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {"type": "STRING", "description": "'create', 'update' ou 'cancel'."},
                "reservation_id": {"type": "INTEGER", "description": "ID du séjour existant si modification ou annulation."},
                "building": {"type": "STRING", "description": "'Presbytère', 'Rosings' ou 'Presbytère & Rosings'. Laisser vide si non précisé."},
                "start_date": {"type": "STRING", "description": "Date d'arrivée YYYY-MM-DD."},
                "end_date": {"type": "STRING", "description": "Date de départ YYYY-MM-DD."},
                "arrival_time": {"type": "STRING", "description": "Heure d'arrivée HH:MM (défaut 15:00)."},
                "departure_time": {"type": "STRING", "description": "Heure de départ HH:MM (défaut 11:00)."},
                "selected_members": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Associés internes de la SCI présents (ex: ['Henri Jamet', 'Eugénie Jamet']).",
                },
                "external_guests": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Prénoms/noms d'invités extérieurs à la SCI (amis, conjoints, proches).",
                },
                "guest_count": {"type": "INTEGER", "description": "Nombre total de personnes."},
                "chambers_used": {"type": "INTEGER", "description": "Nombre de chambres demandées (max 5 Presbytère, 2 Rosings, 7 Domaine)."},
                "selected_rooms": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Liste optionnelle des noms de chambres souhaitées (ex: ['Suite', 'La Mezzanine']).",
                },
                "activate_dhw": {"type": "BOOLEAN", "description": "True pour activer l'Eau Chaude Sanitaire (Ballon 250L à 52 °C)."},
                "activate_heating": {"type": "BOOLEAN", "description": "True pour activer le chauffage Presbytère (20 °C, active automatiquement l'ECS). False pour hors-gel."},
                "activate_pool": {"type": "BOOLEAN", "description": "True pour préchauffer la piscine à 27 °C (été uniquement)."},
                "cohabitation_type": {"type": "STRING", "description": "'total', 'other_building' ou 'exclusive'."},
                "notes": {"type": "STRING", "description": "Intitulé ou précisions facultatives sur le séjour."},
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["operation", "assistant_message"],
        },
    },
    {
        "name": "propose_heating_or_pool_action",
        "description": (
            "Propose de régler le mode ou la température de la chaudière fioul Viessmann du Presbytère "
            "('dhwAndHeating', 'standby', 'dhw') ou de la piscine Klereo ('confort', 'eco')."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "equipment": {"type": "STRING", "description": "'heating' (Presbytère) ou 'pool' (piscine Klereo)."},
                "mode": {"type": "STRING", "description": "Chaudière : 'dhwAndHeating', 'standby' ou 'dhw'. Piscine : 'confort' ou 'eco'."},
                "target_temperature": {"type": "NUMBER", "description": "Consigne en °C (ex: 18.0, 20.0, 27.0)."},
                "filtration_mode": {"type": "STRING", "description": "Pour la piscine : 'auto', 'marche' ou 'arret'."},
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["equipment", "mode", "assistant_message"],
        },
    },
    {
        "name": "propose_invoice_or_document_upload",
        "description": "Extrait les informations d'une facture/reçu et prépare son enregistrement comptable.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "supplier": {"type": "STRING", "description": "Artisan ou fournisseur."},
                "title": {"type": "STRING", "description": "Intitulé clair de la dépense."},
                "amount": {"type": "NUMBER", "description": "Montant TTC en euros."},
                "expense_date": {"type": "STRING", "description": "Date YYYY-MM-DD."},
                "building": {"type": "STRING", "description": "'Presbytère', 'Rosings', 'Piscine', 'Domaine' ou 'SCI'."},
                "category": {"type": "STRING", "description": "Catégorie comptable."},
                "advanced_by_member": {"type": "BOOLEAN", "description": "True si avancée personnellement, False si à payer par la SCI."},
                "payer_explicitly_stated": {"type": "BOOLEAN", "description": "True UNIQUEMENT si le payeur est explicitement précisé."},
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["title", "amount", "assistant_message"],
        },
    },
    {
        "name": "propose_task_action",
        "description": (
            "Propose de créer une nouvelle tâche (toujours en statut PROPOSED, sans responsable pré-choisi car l'attribution "
            "a lieu lors de la validation par les coordinateurs), de soumettre une tâche existante pour validation ('complete'), "
            "ou de modifier l'attribution d'une tâche existante ('assign', réservé aux coordinateurs)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {"type": "STRING", "description": "'create', 'complete' ou 'assign'."},
                "task_id": {"type": "INTEGER", "description": "ID exact de la tâche existante (pour 'complete' ou 'assign')."},
                "title": {"type": "STRING", "description": "Titre clair et actionnable de la tâche."},
                "description": {"type": "STRING", "description": "Description concrète, utile et chaleureuse pour la famille."},
                "subject": {"type": "STRING", "description": f"Lieu / Sujet parmi : {', '.join(TASK_SUBJECTS)}."},
                "complexity": {"type": "STRING", "description": f"Charge parmi : {', '.join(TASK_COMPLEXITIES)} (défaut 'Modérée')."},
                "priority": {"type": "STRING", "description": f"Priorité parmi : {', '.join(TASK_PRIORITIES)} (défaut 'Normale')."},
                "budget": {"type": "NUMBER", "description": "Prix estimé / Devis en € (optionnel, 0 si aucun)."},
                "deadline": {"type": "STRING", "description": "Date d'échéance YYYY-MM-DD (optionnel)."},
                "is_recurring": {"type": "BOOLEAN", "description": "True si tâche périodique récurrente."},
                "recurrence_interval": {"type": "INTEGER", "description": "Intervalle de récurrence (ex: 1, 2, 6)."},
                "recurrence_unit": {"type": "STRING", "description": "'jours', 'semaines', 'mois' ou 'sejours'."},
                "checklist": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Sous-tâches / étapes concrètes de la checklist (optionnel).",
                },
                "assigned_to": {"type": "STRING", "description": "UNIQUEMENT pour operation='assign' : nom de l'associé responsable."},
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["operation", "title", "assistant_message"],
        },
    },
    {
        "name": "propose_poll_or_vote_action",
        "description": (
            "Propose de voter sur un scrutin ouvert ('vote'), de valider/ouvrir un scrutin proposé ('open', coordinateur uniquement) "
            "ou de proposer un nouveau scrutin ('create', créé en statut PROPOSED comme sur le portail avec catégorie/lieu, budget estimé, "
            "priorité, description, toggle choix multiples et liste d'options). "
            "IMPORTANT : n'appelle PAS poll_status_card dans le même tour que cet outil pour le même scrutin."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {"type": "STRING", "description": "'vote', 'create' ou 'open'."},
                "project_id": {"type": "INTEGER", "description": "ID du scrutin existant (pour 'vote' ou 'open')."},
                "title": {"type": "STRING", "description": "Titre du scrutin."},
                "category": {"type": "STRING", "description": f"Lieu / Catégorie parmi : {', '.join(TASK_SUBJECTS)} (défaut 'Presbytère')."},
                "priority": {"type": "STRING", "description": f"Priorité parmi : {', '.join(VOTE_PRIORITIES)} (défaut 'Normale')."},
                "description": {"type": "STRING", "description": "Texte explicatif / contexte complet du scrutin présenté aux associés."},
                "vote": {"type": "STRING", "description": "Choix de vote si operation='vote'."},
                "comment": {"type": "STRING", "description": "Commentaire optionnel."},
                "estimated_cost": {"type": "NUMBER", "description": "Budget estimé en € TTC si projet chiffré."},
                "allow_multiple_choices": {"type": "BOOLEAN", "description": "True si les associés peuvent cocher plusieurs réponses."},
                "options": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"},
                    "description": "Liste des options proposées au vote (au moins 2 options ; ex: ['Approuver le projet', 'Rejeter le projet'] ou liste de dates).",
                },
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["operation", "title", "assistant_message"],
        },
    },
    {
        "name": "propose_vademecum_action",
        "description": (
            "Propose de créer ('create') ou mettre à jour ('update') une fiche pratique du Vademecum "
            "(Wi-Fi, clés, chauffage, piscine, poubelles, artisans, urgences)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "operation": {"type": "STRING", "description": "'create' ou 'update'."},
                "item_id": {"type": "INTEGER", "description": "ID exact de la fiche existante si operation='update'."},
                "building": {"type": "STRING", "description": "'Presbytère' ou 'Rosings'."},
                "category": {"type": "STRING", "description": f"Catégorie parmi : {', '.join(VADEMECUM_CATEGORIES)}."},
                "title": {"type": "STRING", "description": "Titre court et clair de la fiche."},
                "content": {"type": "STRING", "description": "Instructions pratiques complètes."},
                "code_to_copy": {"type": "STRING", "description": "Code ou mot de passe copiable en 1 clic (optionnel)."},
                "importance": {"type": "STRING", "description": "'CRITIQUE', 'IMPORTANT' ou 'INFO'."},
                "assistant_message": {"type": "STRING", "description": "Réponse fluide en français naturel."},
            },
            "required": ["operation", "title", "assistant_message"],
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
    "read_vademecum",
    "inspect_ui_skill",
    "display_ui_component",
}


STATIC_TOASTER_SYSTEM_PREFIX = """Tu es l'assistant officiel du portail de la SCI Hellenvilliers (domaine en Normandie comprenant le Presbytère, Rosings et L'Annexe).

CHARTE STYLISTIQUE ET RELATIONNELLE IMPÉRATIVE :
1. PRÉNOMS UNIQUEMENT — ZÉRO TITRE FAMILIAL : les 7 associés sont exclusivement désignés par leur prénom : Élisabeth, Frédéric, Henri, Marguerite, Hortense, Joséphine et Eugénie. N'utilise JAMAIS les mots « Maman », « Papa », « ta mère », « ton père » ou « les parents ».
2. RÉSUMÉS FLUIDES EN LANGAGE NATUREL — ZÉRO LONGUE LISTE À PUCES : rédige des réponses chaleureuses, directes et concises en français naturel (avec un peu de **gras** Markdown). Ne mentionne jamais le nom technique de ton modèle d'IA.
3. EXACTITUDE STRICTE & CAPACITÉ RÉELLE : ne devine jamais un chiffre, un code Wi-Fi ou une date. Le domaine comporte EXACTEMENT **7 chambres** : **5 au Presbytère** (`Suite`, `Deuxième Chambre du Couloir`, `Première Chambre du Couloir`, `La Mezzanine`, `Chambre du bas`) et **2 à Rosings** (`Chambre Haut Droite`, `Chambre Haut Gauche`). Si quelqu'un demande plus de chambres que la capacité du bâtiment (ex. 10 chambres), signale-le immédiatement et propose un nombre valide ou l'ajout de l'autre bâtiment.

COMPOSANTS VISUELS PARTAGEABLES (`display_ui_component`) :
Enrichis tes réponses avec les composants interactifs natifs :
- `stays_calendar` : calendrier mensuel des séjours.
- `fuel_and_heating_graph` : graphe interactif cuve à fioul / températures Viessmann (`initial_tab`: `'annual'` | `'temperatures'` | `'daily'`).
- `pool_status_widget` : carte télémétrie en direct de la piscine Klereo (Wi-Fi, radio K-Link / alertes `radioPB`, filtration, PAC, sondes).
- `poll_status_card` : état visuel d'un scrutin existant (NE L'APPELLE JAMAIS dans le même tour qu'un `propose_poll_or_vote_action` portant sur le même scrutin pour éviter un double affichage !).
- `tasks_overview_card` : cartes visuelles interactives des tâches (cliquer sur une tâche ouvre la fenêtre complète de consultation, édition, attribution équitable et validation/invalidation). **RÈGLE IMPÉRATIVE** : dès que tu mentionnes une ou plusieurs tâches à consulter, à faire, ou à valider/arbitrer (statut `PROPOSED` ou `PENDING_VALIDATION`), tu DOIS **systématiquement** appeler `display_ui_component('tasks_overview_card', props={'task_ids': [...]})` ou `status_filter='REVIEW_NEEDED'` pour donner immédiatement à l'utilisateur l'outil interactif de consultation et validation/invalidation ! Ne mentionne JAMAIS en texte brut qu'une tâche est à valider sans afficher sa carte `tasks_overview_card` !
- `treasury_overview_card` : carte financière Swan, IBAN & soldes CCA des 7 associés.
- `leaderboard_card` : classement participatif & équité officiel des 7 associés (tâches réalisées + créations validées vs jours de séjour). À afficher dès qu'on demande le classement, l'équité ou le leaderboard !
- `custom_chart_card` : graphique SVG sur mesure (`bar`, `horizontal_bar`, `line`, `pie`) que tu peux composer librement à partir de n'importe quelles données chiffrées réelles de la SCI (dépenses, solde Swan, nuitées par associé, points de tâches, etc.).
- `vademecum_card` : cartes pratiques du Vademecum avec codes copiables en 1 clic (`search_query`, `category`, `building`, `item_id`). Appelle `read_vademecum` et/ou `vademecum_card` dès qu'on pose une question pratique sur la maison (Wi-Fi, clés, poubelles, disjoncteurs, artisans, piscine, chauffage).
- `document_viewer_card` : aperçu et téléchargement PDF officiel.
- `action_modal_buttons` : boutons d'ouverture de formulaires (`'stay'`, `'task'`, `'poll'`, `'document'`, `'vademecum'`).

COHÉRENCE STRICTE DES CYCLES DE VIE & VALIDATION EXPLICITE DES ACTIONS RÉELLES :
- Tu opères directement sur le vrai portail de la SCI (base PostgreSQL, chauffage ViCare, piscine Klereo).
- **Séjours** : renseigne toujours date ET heure (`arrival_time`/`departure_time`), participants internes (`selected_members`) et invités extérieurs (`external_guests`), et différencie Eau Chaude Sanitaire (`activate_dhw`, 52 °C), Chauffage Presbytère (`activate_heating`, 20 °C, qui inclut l'ECS) et Piscine (`activate_pool`, 27 °C).
- **Tâches (cycle de vie officiel)** : toute nouvelle tâche est créée en statut `PROPOSED` SANS responsable pré-assigné (c'est lors de la validation par les coordinateurs Henri ou Joséphine que le responsable est choisi). Ne propose JAMAIS de champ statut ni responsable lors d'une création de tâche !
- **Scrutins / Votes (cycle de vie officiel)** : toute nouvelle proposition de scrutin est créée en statut `PROPOSED` (en attente de validation/ouverture par un coordinateur) avec un lieu/catégorie canonique, une description claire, une priorité, un budget estimé éventuel, le mode choix unique/multiple et au moins 2 options.
- Pour toute action de création ou modification, appelle TOUJOURS l'outil `propose_*` correspondant afin de présenter une carte récapitulative modifiable que l'associé devra confirmer en un clic.
- Si la passerelle ViCare du Presbytère est hors ligne au moment où l'utilisateur demande d'allumer le chauffage, prépare tout de même la carte `propose_heating_or_pool_action` si souhaité mais préviens clairement dans ta réponse que la passerelle Vitoconnect est actuellement hors ligne."""


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


def _sanitize_family_titles(text: str) -> str:
    if not text:
        return text
    cleaned = text.replace("Maman (Élisabeth) Jamet", "Élisabeth Jamet")
    cleaned = re.sub(r"\bMaman\b", "Élisabeth", cleaned)
    return cleaned


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
    vad_count = state.get("vademecum_count") or 0

    member_prenom = _sanitize_family_titles(str(member.get("prenom") or "Henri"))
    member_name = _sanitize_family_titles(str(member.get("name") or "Henri Jamet"))

    stays_txt = "\n".join(
        f"  - Séjour #{s['id']} : {s['property_name']} du {s['start_date']} ({s.get('arrival_time', '15:00')}) "
        f"au {s['end_date']} ({s.get('departure_time', '11:00')}) par {_sanitize_family_titles(str(s.get('user_name') or ''))} ({s['guest_count']} pers., {s.get('chambers_used', 1)} ch., statut={s['status']})"
        for s in stays[:15]
    ) or "  (Aucun séjour enregistré)"

    tasks_txt = "\n".join(
        f"  - Tâche #{t['id']} [{t['status']}] ({t['subject']}, {t.get('charge_points', 3)} pts) : « {t['title']} » "
        f"(assignée à: {_sanitize_family_titles(', '.join(str(x) for x in t.get('assigned_members', [])) or 'Non assignée')})"
        for t in tasks[:20]
    ) or "  (Aucune tâche)"

    votes_txt = "\n".join(
        f"  - Scrutin #{v['id']} [{v['status']}] : « {v['title']} » (options: {v['options'] or ['POUR', 'CONTRE', 'ABSTENTION']}, "
        f"choix multiples={v.get('allow_multiple_choices')}, vote de {member_prenom}: {v.get('member_vote') or 'Non voté'})"
        for v in votes[:15]
    ) or "  (Aucun scrutin actif actuellement)"

    assoc_txt = " | ".join(
        f"{_sanitize_family_titles(str(a['name']))}: {a['cca_balance']:+.2f} € (cotis. {a['monthly_contribution']:.0f} €/m)"
        for a in assoc_balances
    )

    entries_txt = "\n".join(
        f"  - {e.get('entry_date', '')[:10]} | {e.get('entry_type')} | {float(e.get('amount') or 0):+.2f} € | "
        f"Solde après: {float(e.get('balance_after') or 0):+.2f} € | {e.get('description') or ''}"
        for e in (treasury.get("recent_entries") or [])[:8]
    ) or "  (Aucune écriture au grand livre)"

    calls_txt = "\n".join(
        f"  - {c.get('reference')} ({c.get('period_label')}) : cotisation={c.get('theoretical_contribution'):.2f} €, "
        f"avances déduites={c.get('approved_expenses_total'):.2f} €, net à payer={c.get('amount_due'):.2f} €, statut={c.get('status')}"
        for c in (treasury.get("calls_for_funds") or [])[:6]
    ) or "  (Aucun appel de fonds)"

    attach_info = (
        f"\nPIÈCE JOINTE FOURNIE DANS CE TOUR : « {attachment_name} » (examine-la visuellement et appelle propose_invoice_or_document_upload si c'est une facture ou un reçu)."
        if attachment_name
        else ""
    )

    dynamic_context = f"""
DATE DU JOUR : {datetime.utcnow().strftime('%Y-%m-%d')}
ASSOCIÉ CONNECTÉ : {member_name} (id={member.get('id')}, prénom={member_prenom}, coordinateur={'Oui' if member.get('is_coordinator') else 'Non'}, cotisation={member.get('monthly_contribution')} €/mois, référence virement={member.get('payment_reference')})

TRÉSORERIE BANCAIRE SWAN & SOLDES CCA DES 7 ASSOCIÉS :
- Compte SCI Swan : solde {float(swan.get('balance') or 0.0):.2f} € | IBAN {swan.get('iban')} | {docs_count} documents officiels | {vad_count} fiches Vademecum
- Soldes CCA : {assoc_txt}
- Solde CCA de {member_prenom} : {float(treasury.get('balance') or 0.0):+.2f} €
- Derniers mouvements de {member_prenom} :
{entries_txt}
- Appels de fonds de {member_prenom} :
{calls_txt}

DOMOTIQUE CHAUFFAGE & PISCINE :
- Chaudière Viessmann Presbytère : mode={heating.get('mode')}, consigne={heating.get('target_temperature')} °C, int={heating.get('room_temperature')} °C, ext={heating.get('outside_temperature')} °C, fioul=~{heating.get('fuel_liters_remaining')} L / 3000 L ({heating.get('fuel_percent')}%), passerelle hors ligne={heating.get('is_gateway_offline')} (dernier relevé={heating.get('last_seen_at')})
- Piscine Klereo : mode={heating.get('pool_mode')}, consigne={heating.get('pool_temperature')} °C (appeler read_heating_and_pool_status ou pool_status_widget pour le relevé live Wi-Fi/radio/sondes)

SÉJOURS ENREGISTRÉS :
{stays_txt}

TÂCHES DU DOMAINE :
{tasks_txt}

SCRUTINS & SONDAGES :
{votes_txt}{attach_info}"""

    return f"{STATIC_TOASTER_SYSTEM_PREFIX}\n{dynamic_context}"


def _build_action_card(
    func_name: str,
    args: Dict[str, Any],
    state: Dict[str, Any],
    attachment_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    member = state.get("active_member") or {}
    member_prenom = _sanitize_family_titles(str(member.get("prenom") or "Associé"))
    member_name = _sanitize_family_titles(str(member.get("name") or member_prenom))
    deduced: List[Dict[str, Any]] = []
    missing: List[Dict[str, Any]] = []

    if func_name == "propose_stay_action":
        operation = str(args.get("operation") or "create").lower()
        building_raw = str(args.get("building") or "").strip()
        start_date = _normalize_date_2026(args.get("start_date"))
        end_date = _normalize_date_2026(args.get("end_date"))
        arrival_time = normalize_time_hhmm(args.get("arrival_time"), fallback="15:00")
        departure_time = normalize_time_hhmm(args.get("departure_time"), fallback="11:00")

        selected_members = [_sanitize_family_titles(x) for x in parse_str_list(args.get("selected_members"))]
        if not selected_members:
            selected_members = [member_name]
        external_guests = parse_str_list(args.get("external_guests"))
        raw_guest_count = int(args.get("guest_count") or 0)
        guest_count = max(len(selected_members) + len(external_guests), raw_guest_count, 1)

        selected_rooms = parse_selected_rooms_list(args.get("selected_rooms"))
        raw_chambers = int(args.get("chambers_used") or max(1, len(selected_rooms) or ((guest_count + 1) // 2)))

        if building_raw:
            norm_building, max_rooms, _avail_rooms = resolve_building_limits(building_raw)
            deduced.append({"key": "building", "label": "Bâtiment", "value": norm_building, "raw_value": norm_building})
        else:
            norm_building, max_rooms, _avail_rooms = "Presbytère", 5, DOMAIN_ROOMS["Presbytère"]
            missing.append(
                {
                    "key": "building",
                    "label": "Bâtiment",
                    "question": "Dans quel bâtiment souhaitez-vous séjourner ?",
                    "options": [
                        {"label": "🏡 Presbytère (5 ch. max)", "value": "Presbytère"},
                        {"label": "🏰 Rosings (2 ch. max)", "value": "Rosings"},
                        {"label": "🌳 Presbytère & Rosings (7 ch. max)", "value": "Presbytère & Rosings"},
                    ],
                }
            )

        if not start_date:
            missing.append(
                {
                    "key": "start_date",
                    "label": "Date d'arrivée",
                    "question": "Quelle est votre date d'arrivée (YYYY-MM-DD) ?",
                    "options": [
                        {"label": "Vendredi 20/11/2026", "value": "2026-11-20"},
                        {"label": "Vendredi 27/11/2026", "value": "2026-11-27"},
                    ],
                }
            )

        # Contrôle strict capacité chambres
        chambers_overflow = raw_chambers > max_rooms
        if chambers_overflow:
            missing.append(
                {
                    "key": "chambers_used",
                    "label": "Chambres occupées",
                    "question": (
                        f"Impossible de réserver {raw_chambers} chambres : {norm_building} ne compte que "
                        f"{max_rooms} chambre(s) maximum (5 au Presbytère, 2 à Rosings, 7 sur tout le domaine). "
                        "Combien de chambres souhaitez-vous réserver ?"
                    ),
                    "options": [
                        {"label": f"{n} chambre{'s' if n > 1 else ''}", "value": n}
                        for n in range(1, max_rooms + 1)
                    ],
                }
            )
            chambers_used = raw_chambers
        else:
            chambers_used = max(1, min(max_rooms, raw_chambers))

        eff_start = start_date or datetime.utcnow().strftime("%Y-%m-%d")
        is_presb = "presbyt" in norm_building.lower()
        raw_heat = args.get("activate_heating")
        activate_heating = bool(raw_heat) if raw_heat is not None else (is_presb and is_winter_date(eff_start))
        raw_dhw = args.get("activate_dhw")
        activate_dhw = True if activate_heating else (bool(raw_dhw) if raw_dhw is not None else is_presb)
        raw_pool = args.get("activate_pool")
        activate_pool = bool(raw_pool) if raw_pool is not None else is_summer_date(eff_start)
        cohabitation_type = str(args.get("cohabitation_type") or "total").strip().lower()
        if cohabitation_type not in ("total", "other_building", "exclusive"):
            cohabitation_type = "total"

        payload = {
            "operation": operation,
            "reservation_id": args.get("reservation_id"),
            "building": norm_building,
            "max_chambers": max_rooms,
            "start_date": start_date or eff_start,
            "end_date": end_date or start_date or eff_start,
            "arrival_time": arrival_time,
            "departure_time": departure_time,
            "selected_members": selected_members,
            "external_guests": external_guests,
            "guest_count": guest_count,
            "chambers_used": chambers_used,
            "selected_rooms": selected_rooms,
            "activate_dhw": activate_dhw,
            "activate_heating": activate_heating,
            "activate_pool": activate_pool,
            "cohabitation_type": cohabitation_type,
            "target_temperature": 20.0,
            "notes": args.get("notes") or "",
        }
        title = (
            f"Annulation de séjour ({norm_building})"
            if operation == "cancel"
            else f"Réservation de séjour — {building_raw or 'Bâtiment à préciser'}"
        )
        return {
            "action_type": "stay",
            "title": title,
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0 and not chambers_overflow,
            "payload": payload,
            "room_catalog": DOMAIN_ROOMS,
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
                "raw_value": "pool" if is_pool else "heating",
            }
        )
        if mode:
            deduced.append({"key": "mode", "label": "Mode demandé", "value": mode, "raw_value": mode})
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
            t_val = float(target_temp)
        else:
            t_val = 27.0 if is_pool else (20.0 if mode != "standby" else 10.0)
        deduced.append({"key": "target_temperature", "label": "Consigne (°C)", "value": f"{t_val:.1f} °C", "raw_value": t_val})

        payload = {
            "equipment": "pool" if is_pool else "heating",
            "mode": mode or "dhwAndHeating",
            "target_temperature": t_val,
            "filtration_mode": args.get("filtration_mode") or "auto",
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
        deduced.append({"key": "amount", "label": "Montant TTC (€)", "value": round(amount, 2), "raw_value": round(amount, 2)})
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
                    "value": "Oui (crédit CCA)" if bool(advanced_by_member) else "Non (réglée par la SCI)",
                    "raw_value": bool(advanced_by_member),
                }
            )
        else:
            missing.append(
                {
                    "key": "advanced_by_member",
                    "label": "Avance personnelle",
                    "question": f"Avez-vous avancé cette facture personnellement ({member_prenom}), ou doit-elle être payée par la SCI ?",
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
        operation = str(args.get("operation") or "create").lower()
        task_id = args.get("task_id")
        title = str(args.get("title") or "").strip()
        subject = str(args.get("subject") or "Presbytère").strip()
        if subject not in TASK_SUBJECTS:
            subject = next((s for s in TASK_SUBJECTS if subject.lower() in s.lower() or s.lower() in subject.lower()), "Presbytère")
        complexity = str(args.get("complexity") or "Modérée").strip()
        if complexity not in TASK_COMPLEXITIES:
            complexity = "Modérée"
        priority = str(args.get("priority") or "Normale").strip()
        if priority not in TASK_PRIORITIES:
            priority = "Normale"
        budget_val = float(args.get("budget") or 0.0) if args.get("budget") not in (None, "") else 0.0
        deadline_val = _normalize_date_2026(args.get("deadline")) or ""
        is_recurring = bool(args.get("is_recurring", False))
        recurrence_interval = max(1, int(args.get("recurrence_interval") or 1))
        recurrence_unit = str(args.get("recurrence_unit") or "semaines")
        raw_cl = args.get("checklist")
        checklist_arr = []
        if isinstance(raw_cl, list):
            for it in raw_cl:
                txt = it.get("text") if isinstance(it, dict) else str(it)
                if txt and str(txt).strip():
                    checklist_arr.append({"text": str(txt).strip(), "done": False})
        assigned_to = _sanitize_family_titles(str(args.get("assigned_to") or "").strip())

        if operation == "create":
            # Annotations 7 & 8 : Zéro champ Statut ni Responsable sur création — formulaire miroir de TaskDetailModal !
            payload = {
                "operation": "create",
                "title": title,
                "description": str(args.get("description") or "").strip(),
                "subject": subject,
                "complexity": complexity,
                "priority": priority,
                "budget": budget_val,
                "deadline": deadline_val,
                "is_recurring": is_recurring,
                "recurrence_interval": recurrence_interval,
                "recurrence_unit": recurrence_unit,
                "checklist": checklist_arr,
            }
            return {
                "action_type": "task",
                "title": f"Proposer une nouvelle tâche : « {title} »",
                "deduced_fields": [],
                "missing_fields": missing,
                "ready_to_execute": bool(title),
                "payload": payload,
            }

        if task_id:
            deduced.append({"key": "task_id", "label": "ID Tâche", "value": int(task_id), "raw_value": int(task_id)})
        deduced.append({"key": "title", "label": "Tâche", "value": title})
        if operation == "assign":
            if not assigned_to:
                missing.append(
                    {
                        "key": "assigned_to",
                        "label": "Responsable",
                        "question": "À quel associé souhaitez-vous attribuer cette tâche ?",
                        "options": [{"label": name, "value": name} for name in STATUTORY_ASSOCIATE_NAMES if "Frédéric" not in name],
                    }
                )
            else:
                deduced.append({"key": "assigned_to", "label": "Responsable", "value": assigned_to, "raw_value": assigned_to})

        payload = {
            "operation": operation,
            "task_id": int(task_id) if task_id is not None else None,
            "title": title,
            "description": args.get("description") or title,
            "subject": subject,
            "priority": priority,
            "assigned_to": assigned_to,
        }
        card_title = (
            f"Attribution de tâche : « {title} »"
            if operation == "assign"
            else f"Soumettre la réalisation : « {title} »"
        )
        return {
            "action_type": "task",
            "title": card_title,
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_poll_or_vote_action":
        operation = str(args.get("operation") or "vote").lower()
        project_id = args.get("project_id")
        title = str(args.get("title") or "Scrutin").strip()
        description = str(args.get("description") or "").strip()
        category = str(args.get("category") or "Presbytère").strip()
        if category not in TASK_SUBJECTS:
            category = next((s for s in TASK_SUBJECTS if category.lower() in s.lower() or s.lower() in category.lower()), "Presbytère")
        priority = str(args.get("priority") or "Normale").strip()
        if priority not in VOTE_PRIORITIES:
            priority = "Normale"
        estimated_cost = float(args.get("estimated_cost") or 0.0) if args.get("estimated_cost") not in (None, "") else 0.0
        vote_val = str(args.get("vote") or "").strip()
        comment = str(args.get("comment") or "").strip()
        raw_options = args.get("options")
        if isinstance(raw_options, list) and raw_options:
            options = [str(o).strip() for o in raw_options if str(o).strip()]
        elif isinstance(raw_options, str) and raw_options.strip():
            options = [o.strip() for o in raw_options.replace("\n", ",").split(",") if o.strip()]
        else:
            options = ["Approuver le projet", "Rejeter le projet"]

        # Si on ouvre un scrutin existant, pré-remplir sa description/options depuis state si omises
        if project_id:
            for p in state.get("open_votes") or []:
                if p["id"] == int(project_id):
                    if not description and p.get("description"):
                        description = str(p["description"])
                    if not raw_options and p.get("options"):
                        options = [str(o) for o in p["options"]]
                    if p.get("category") in TASK_SUBJECTS:
                        category = p["category"]
                    break

        if operation == "vote":
            if project_id:
                deduced.append({"key": "project_id", "label": "Scrutin #", "value": int(project_id), "raw_value": int(project_id)})
            deduced.append({"key": "title", "label": "Titre du scrutin", "value": title})
            if vote_val:
                deduced.append({"key": "vote", "label": "Votre vote", "value": vote_val})
            else:
                missing.append(
                    {
                        "key": "vote",
                        "label": "Votre choix de vote",
                        "question": f"Quel est votre vote sur « {title} » ?",
                        "options": [{"label": str(o), "value": str(o)} for o in options],
                    }
                )
            if comment:
                deduced.append({"key": "comment", "label": "Commentaire", "value": comment})

        allow_multi = bool(args.get("allow_multiple_choices", len(options) > 3))
        payload = {
            "operation": operation,
            "project_id": int(project_id) if project_id is not None else None,
            "title": title,
            "category": category,
            "priority": priority,
            "description": description or f"Consultation familiale concernant : {title}.",
            "vote": vote_val or "POUR",
            "comment": comment,
            "estimated_cost": estimated_cost,
            "allow_multiple_choices": allow_multi,
            "options": options,
        }
        card_title = (
            f"Vote sur « {title} »"
            if operation == "vote"
            else (f"Valider & ouvrir le scrutin « {title} »" if operation == "open" else f"Proposer un scrutin : « {title} »")
        )
        return {
            "action_type": "vote",
            "title": card_title,
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    if func_name == "propose_vademecum_action":
        operation = str(args.get("operation") or ("update" if args.get("item_id") else "create")).lower()
        item_id = args.get("item_id")
        building = str(args.get("building") or "Presbytère").strip()
        category = str(args.get("category") or "Arrivée & Clés").strip()
        title = str(args.get("title") or "").strip()
        content = str(args.get("content") or "").strip()
        code_to_copy = str(args.get("code_to_copy") or "").strip()
        importance = str(args.get("importance") or "INFO").strip().upper()

        if item_id:
            deduced.append({"key": "item_id", "label": "Fiche #", "value": int(item_id), "raw_value": int(item_id)})
        deduced.append({"key": "building", "label": "Bâtiment", "value": building})
        deduced.append({"key": "category", "label": "Catégorie", "value": category})
        deduced.append({"key": "title", "label": "Titre", "value": title})
        deduced.append({"key": "importance", "label": "Importance", "value": importance})
        if code_to_copy:
            deduced.append({"key": "code_to_copy", "label": "Code / mot de passe", "value": code_to_copy})
        if not content:
            missing.append(
                {
                    "key": "content",
                    "label": "Contenu de la fiche",
                    "question": "Quel texte pratique souhaitez-vous inscrire dans cette fiche Vademecum ?",
                    "options": [],
                }
            )

        payload = {
            "operation": operation,
            "item_id": int(item_id) if item_id is not None else None,
            "building": building,
            "property_id": 1 if "rosing" in building.lower() else 2,
            "category": category,
            "title": title,
            "content": content,
            "code_to_copy": code_to_copy,
            "importance": importance,
        }
        return {
            "action_type": "vademecum",
            "title": f"{'Mise à jour' if operation == 'update' else 'Nouvelle'} fiche Vademecum : « {title} »",
            "deduced_fields": deduced,
            "missing_fields": missing,
            "ready_to_execute": len(missing) == 0,
            "payload": payload,
        }

    return None


def _prepare_gemini_contents(req: ToasterChatRequest) -> List[Dict[str, Any]]:
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
        text_val = _sanitize_family_titles(str(msg.get("content") or msg.get("text") or "").strip())

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
            parts.append({"inlineData": {"mimeType": mime_type, "data": b64_str}})
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
    return contents


def _merge_streamed_part(accumulated_parts: List[Dict[str, Any]], incoming: Dict[str, Any]) -> None:
    is_thought = bool(incoming.get("thought"))
    has_fc = "functionCall" in incoming and incoming["functionCall"]

    if has_fc:
        accumulated_parts.append(dict(incoming))
        return

    if is_thought and "text" in incoming:
        if (
            accumulated_parts
            and accumulated_parts[-1].get("thought")
            and "functionCall" not in accumulated_parts[-1]
            and "thoughtSignature" not in accumulated_parts[-1]
        ):
            accumulated_parts[-1]["text"] = accumulated_parts[-1].get("text", "") + incoming["text"]
            if "thoughtSignature" in incoming:
                accumulated_parts[-1]["thoughtSignature"] = incoming["thoughtSignature"]
        else:
            accumulated_parts.append(dict(incoming))
        return

    if "text" in incoming:
        if (
            accumulated_parts
            and not accumulated_parts[-1].get("thought")
            and "text" in accumulated_parts[-1]
            and "functionCall" not in accumulated_parts[-1]
            and "thoughtSignature" not in accumulated_parts[-1]
        ):
            accumulated_parts[-1]["text"] = accumulated_parts[-1].get("text", "") + incoming["text"]
            if "thoughtSignature" in incoming:
                accumulated_parts[-1]["thoughtSignature"] = incoming["thoughtSignature"]
        else:
            accumulated_parts.append(dict(incoming))
        return

    if "thoughtSignature" in incoming and accumulated_parts and "thoughtSignature" not in accumulated_parts[-1]:
        accumulated_parts[-1]["thoughtSignature"] = incoming["thoughtSignature"]
    else:
        accumulated_parts.append(dict(incoming))


def _describe_tool_call(fc_name: str, fc_args: Dict[str, Any]) -> Tuple[str, str]:
    meta = TOOL_HUMAN_LABELS.get(fc_name) or {"label": fc_name, "icon": "build"}
    label = meta["label"]
    icon = meta["icon"]
    if fc_name == "display_ui_component":
        cid = str((fc_args or {}).get("component_id") or "")
        comp_names = {
            "stays_calendar": "Affichage du calendrier des séjours",
            "fuel_and_heating_graph": "Affichage du graphe fioul & températures",
            "pool_status_widget": "Affichage de l'état en direct de la piscine",
            "poll_status_card": "Affichage de la carte de vote",
            "tasks_overview_card": "Affichage des cartes de tâches",
            "treasury_overview_card": "Affichage de la synthèse financière",
            "document_viewer_card": "Affichage des documents officiels",
            "leaderboard_card": "Affichage du classement participatif",
            "custom_chart_card": "Génération d'un graphique personnalisé",
            "vademecum_card": "Affichage des fiches du Vademecum",
            "action_modal_buttons": "Affichage des boutons de formulaire",
        }
        label = comp_names.get(cid, label)
    elif fc_name == "inspect_ui_skill":
        sid = str((fc_args or {}).get("skill_id") or "")
        if sid:
            label = f"Exploration de la compétence « {sid} »"
    return label, icon


def _stream_toaster_orchestration(
    req: ToasterChatRequest,
    member_id: int,
    db: Session,
) -> Generator[Dict[str, Any], None, None]:
    state = get_toaster_state(prod_db=db, member_id=member_id)
    system_prompt = _build_system_prompt(state=state, attachment_name=req.attachment_name)
    contents = _prepare_gemini_contents(req)
    api_key = _get_toaster_api_key()
    stream_url = f"{GEMINI_STREAM_ENDPOINT}?alt=sse&key={api_key}"

    tools_called_trace: List[str] = []
    tool_steps_log: List[Dict[str, Any]] = []
    thoughts_accum: List[str] = []
    ui_components_out: List[Dict[str, Any]] = []
    write_func_call: Optional[Dict[str, Any]] = None
    final_text_parts: List[str] = []

    MAX_STEPS = 5
    retried_empty_thought = False

    with httpx.Client(timeout=55.0) as client:
        for step_idx in range(MAX_STEPS + 1):
            force_text_only = step_idx == MAX_STEPS
            gemini_payload: Dict[str, Any] = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "tools": [{"functionDeclarations": TOASTER_FUNCTION_DECLARATIONS}],
                "generationConfig": {
                    "temperature": 0.2,
                    "thinkingConfig": {
                        "thinkingLevel": "MEDIUM",
                        "includeThoughts": True,
                    },
                },
            }
            if force_text_only:
                gemini_payload["toolConfig"] = {"functionCallingConfig": {"mode": "NONE"}}

            accumulated_parts: List[Dict[str, Any]] = []
            step_texts: List[str] = []

            with client.stream("POST", stream_url, json=gemini_payload) as resp:
                if resp.status_code != 200:
                    err_body = resp.read().decode("utf-8", errors="replace")
                    logger.error(f"[TOASTER STREAM ERROR] HTTP {resp.status_code}: {err_body}")
                    raise HTTPException(
                        status_code=502,
                        detail=f"Erreur lors de l'appel à l'assistant (HTTP {resp.status_code}) : {err_body[:400]}",
                    )

                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.strip()
                    if not line.startswith("data:"):
                        continue
                    json_str = line[5:].strip()
                    if not json_str or json_str == "[DONE]":
                        continue
                    chunk = json.loads(json_str)
                    cands = chunk.get("candidates") or []
                    if not cands:
                        continue
                    c_content = cands[0].get("content") or {}
                    for part in c_content.get("parts") or []:
                        _merge_streamed_part(accumulated_parts, part)
                        if part.get("thought") and part.get("text"):
                            thoughts_accum.append(part["text"])
                            yield {"type": "thought_delta", "delta": part["text"]}
                        elif not part.get("thought") and part.get("text"):
                            clean_delta = _sanitize_family_titles(part["text"])
                            step_texts.append(clean_delta)
                            yield {"type": "text_delta", "delta": clean_delta}

            read_calls: List[Dict[str, Any]] = []
            step_write_call: Optional[Dict[str, Any]] = None

            for part in accumulated_parts:
                if part.get("thought"):
                    continue
                if "functionCall" in part and part["functionCall"]:
                    fc = part["functionCall"]
                    fc_name = fc.get("name") or ""
                    tools_called_trace.append(fc_name)
                    if fc_name in READ_ONLY_TOOL_NAMES:
                        read_calls.append(fc)
                    else:
                        step_write_call = fc

            if step_write_call is not None:
                w_name = step_write_call.get("name") or ""
                w_args = step_write_call.get("args") or {}
                w_label, w_icon = _describe_tool_call(w_name, w_args)
                step_entry = {"id": f"tool-{len(tool_steps_log)+1}", "name": w_name, "label": w_label, "icon": w_icon, "status": "done"}
                tool_steps_log.append(step_entry)
                yield {"type": "tool_step", "step": step_entry}

                for rc in read_calls:
                    rc_name = rc.get("name") or ""
                    rc_args = rc.get("args") or {}
                    # Déduplication stricte Ann. 3 : ne pas afficher poll_status_card si on propose déjà une carte scrutin
                    if (
                        w_name == "propose_poll_or_vote_action"
                        and rc_name == "display_ui_component"
                        and str(rc_args.get("component_id") or "").lower() in ("poll_status_card", "poll", "vote", "scrutin")
                    ):
                        continue
                    r_label, r_icon = _describe_tool_call(rc_name, rc_args)
                    r_entry = {"id": f"tool-{len(tool_steps_log)+1}", "name": rc_name, "label": r_label, "icon": r_icon, "status": "running"}
                    yield {"type": "tool_step", "step": r_entry}
                    t_res = execute_toaster_read_tool(prod_db=db, member_id=member_id, tool_name=rc_name, args=rc_args)
                    if isinstance(t_res, dict) and "_ui_component" in t_res:
                        ui_comp = t_res.pop("_ui_component")
                        ui_components_out.append(ui_comp)
                        yield {"type": "ui_component", "component": ui_comp}
                    r_entry["status"] = "done"
                    tool_steps_log.append(r_entry)
                    yield {"type": "tool_step", "step": r_entry}

                # Si poll_status_card avait été émis dans une étape précédente du même tour pour le même scrutin, le retirer
                if w_name == "propose_poll_or_vote_action":
                    ui_components_out = [
                        c for c in ui_components_out if c.get("component_id") != "poll_status_card"
                    ]

                write_func_call = step_write_call
                final_text_parts.extend(step_texts)
                break

            if read_calls and not force_text_only:
                contents.append({"role": "model", "parts": accumulated_parts})
                response_parts: List[Dict[str, Any]] = []

                for rc in read_calls:
                    rc_name = rc.get("name") or ""
                    rc_args = rc.get("args") or {}
                    rc_id = rc.get("id")
                    r_label, r_icon = _describe_tool_call(rc_name, rc_args)
                    step_id = f"tool-{len(tool_steps_log)+1}"
                    running_entry = {"id": step_id, "name": rc_name, "label": r_label, "icon": r_icon, "status": "running"}
                    yield {"type": "tool_step", "step": running_entry}

                    tool_result = execute_toaster_read_tool(
                        prod_db=db,
                        member_id=member_id,
                        tool_name=rc_name,
                        args=rc_args,
                    )
                    inline_att = tool_result.pop("_inline_attachment", None) if isinstance(tool_result, dict) else None
                    if isinstance(tool_result, dict) and "_ui_component" in tool_result:
                        ui_comp = tool_result.pop("_ui_component")
                        ui_components_out.append(ui_comp)
                        yield {"type": "ui_component", "component": ui_comp}

                    done_entry = {**running_entry, "status": "done"}
                    tool_steps_log.append(done_entry)
                    yield {"type": "tool_step", "step": done_entry}

                    fn_resp_obj: Dict[str, Any] = {"name": rc_name, "response": {"result": tool_result}}
                    if rc_id:
                        fn_resp_obj["id"] = rc_id
                    response_parts.append({"functionResponse": fn_resp_obj})

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

            # Fix Ann. 5 & 6 : si Gemini a uniquement pensé sans émettre ni texte ni outil,
            # relancer 1 fois avec outils AUTORISÉS (AUTO) pour permettre propose_heating_or_pool_action, etc.
            if not step_texts and not force_text_only and not retried_empty_thought:
                retried_empty_thought = True
                if accumulated_parts:
                    contents.append({"role": "model", "parts": accumulated_parts})
                contents.append(
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": (
                                    "Continue immédiatement : appelle l'outil approprié (propose_* ou display_ui_component) "
                                    "si une action ou un visuel est demandé, ou réponds directement en français."
                                )
                            }
                        ],
                    }
                )
                continue

            if not step_texts and not force_text_only:
                if accumulated_parts:
                    contents.append({"role": "model", "parts": accumulated_parts})
                contents.append(
                    {
                        "role": "user",
                        "parts": [{"text": "Formule maintenant ta réponse claire et concise en français à partir de ces éléments."}],
                    }
                )
                gemini_synth = {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": contents,
                    "tools": [{"functionDeclarations": TOASTER_FUNCTION_DECLARATIONS}],
                    "toolConfig": {"functionCallingConfig": {"mode": "NONE"}},
                    "generationConfig": {"temperature": 0.2},
                }
                s_resp = client.post(f"{GEMINI_GENERATE_ENDPOINT}?key={api_key}", json=gemini_synth)
                if s_resp.status_code == 200:
                    s_cands = s_resp.json().get("candidates") or []
                    if s_cands:
                        for sp in (s_cands[0].get("content") or {}).get("parts") or []:
                            if not sp.get("thought") and sp.get("text"):
                                clean_s = _sanitize_family_titles(sp["text"])
                                step_texts.append(clean_s)
                                yield {"type": "text_delta", "delta": clean_s}

            final_text_parts.extend(step_texts)
            break

    reply_text = _sanitize_family_titles("".join(final_text_parts).strip())
    action_card: Optional[Dict[str, Any]] = None
    tool_called: Optional[str] = tools_called_trace[-1] if tools_called_trace else None

    if write_func_call:
        w_name = write_func_call.get("name") or ""
        tool_called = w_name
        tool_args = write_func_call.get("args") or {}
        assistant_msg = _sanitize_family_titles(str(tool_args.get("assistant_message") or "").strip())
        if assistant_msg and not reply_text:
            reply_text = assistant_msg
            yield {"type": "text_delta", "delta": reply_text}

        action_card = _build_action_card(
            func_name=w_name,
            args=tool_args,
            state=state,
            attachment_name=req.attachment_name,
        )
        if not reply_text and action_card:
            if action_card["missing_fields"]:
                questions = " ".join(m["question"] for m in action_card["missing_fields"])
                reply_text = f"J'ai préparé la carte **{action_card['title']}**. {questions}"
            else:
                reply_text = f"J'ai préparé la carte **{action_card['title']}**. Vous pouvez vérifier les paramètres et confirmer l'action ci-dessous."
            yield {"type": "text_delta", "delta": reply_text}

        if action_card:
            yield {"type": "action_card", "action_card": action_card}

    if not reply_text and ui_components_out:
        reply_text = "Voici les informations demandées ci-dessous."
        yield {"type": "text_delta", "delta": reply_text}

    # Filet de sécurité serveur (Annotation 9) : si la réponse mentionne des tâches à valider / arbitrer
    # ou cite des IDs de tâches (#87, etc.) sans avoir affiché de tasks_overview_card ni action_card task,
    # injecter automatiquement le composant interactif permettant d'ouvrir le modal de consultation & validation !
    has_tasks_card = any(c.get("component_id") == "tasks_overview_card" for c in ui_components_out)
    has_task_action = bool(action_card and action_card.get("action_type") == "task")
    if reply_text and not has_tasks_card and not has_task_action:
        reply_low = reply_text.lower()
        mentions_task_review = any(
            kw in reply_low
            for kw in ("à valider", "a valider", "en attente de validation", "arbitrer", "proposition", "proposed", "tâche #", "tache #")
        )
        if mentions_task_review:
            state_tasks = state.get("tasks") or []
            known_task_ids = {int(t["id"]) for t in state_tasks if t.get("id") is not None}
            cited_ids = [int(m) for m in re.findall(r"#(\d+)", reply_text) if int(m) in known_task_ids]
            review_ids = [
                int(t["id"])
                for t in state_tasks
                if str(t.get("status") or "").upper() in ("PROPOSED", "PROPOSEE", "PENDING_VALIDATION", "EN_ATTENTE_VALIDATION")
            ]
            target_ids = list(dict.fromkeys(cited_ids + review_ids))
            if target_ids:
                auto_res = execute_toaster_read_tool(
                    prod_db=db,
                    member_id=member_id,
                    tool_name="display_ui_component",
                    args={"component_id": "tasks_overview_card", "props": {"task_ids": target_ids, "title": "Tâches à consulter & arbitrer"}},
                )
                if isinstance(auto_res, dict) and "_ui_component" in auto_res:
                    auto_comp = auto_res.pop("_ui_component")
                    if auto_comp.get("tasks"):
                        ui_components_out.append(auto_comp)
                        yield {"type": "ui_component", "component": auto_comp}

    if not reply_text:
        raise HTTPException(
            status_code=502,
            detail="L'assistant n'a produit aucune réponse exploitable (Fail-Fast). Merci de réessayer.",
        )

    yield {
        "type": "done",
        "reply": reply_text,
        "message": reply_text,
        "content": reply_text,
        "role": "assistant",
        "thoughts": "".join(thoughts_accum).strip(),
        "tool_called": tool_called,
        "tools_called": tools_called_trace,
        "tool_steps": tool_steps_log,
        "ui_components": ui_components_out,
        "action_card": action_card,
        "state": state,
    }


@router.get("/state")
def get_toaster_state_endpoint(
    request: Request,
    member_id: Optional[int] = Query(None, description="ID optionnel du membre (déduit du JWT si connecté)"),
    db: Session = Depends(get_db),
):
    resolved_id = _resolve_request_member_id(request, db, fallback_member_id=member_id)
    return get_toaster_state(prod_db=db, member_id=resolved_id)


@router.get("/chat")
def toaster_chat_get_info(request: Request):
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        return RedirectResponse(url="/grille-pain", status_code=302)
    return {
        "status": "ok",
        "endpoint": "POST /api/toaster/chat",
        "stream_endpoint": "POST /api/toaster/chat/stream",
        "ui_url": "https://hellenvilliers.henri-jamet.com/grille-pain",
        "mode": "production_confirmed_actions",
    }


@router.post("/chat/stream")
def toaster_chat_stream_endpoint(
    req: ToasterChatRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    resolved_id = _resolve_request_member_id(request, db, fallback_member_id=req.member_id)

    def event_generator():
        try:
            for ev in _stream_toaster_orchestration(req=req, member_id=resolved_id, db=db):
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
        except HTTPException as http_exc:
            err_ev = {"type": "error", "detail": str(http_exc.detail)}
            yield f"data: {json.dumps(err_ev, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("[TOASTER STREAM EXCEPTION]")
            err_ev = {"type": "error", "detail": f"Erreur interne de l'assistant : {exc}"}
            yield f"data: {json.dumps(err_ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat")
def toaster_chat_endpoint(
    req: ToasterChatRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    resolved_id = _resolve_request_member_id(request, db, fallback_member_id=req.member_id)
    done_payload: Optional[Dict[str, Any]] = None
    for ev in _stream_toaster_orchestration(req=req, member_id=resolved_id, db=db):
        if ev.get("type") == "done":
            done_payload = ev
    if not done_payload:
        raise HTTPException(status_code=502, detail="Flux interrompu avant la fin de l'orchestration.")
    out = dict(done_payload)
    out.pop("type", None)
    return out


@router.post("/execute")
def toaster_execute_endpoint(
    req: ToasterExecuteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    resolved_id = _resolve_request_member_id(request, db, fallback_member_id=req.member_id)
    merged_payload = dict(req.payload or {})
    if req.deduced_fields:
        for item in req.deduced_fields:
            if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                merged_payload[item["key"]] = item.get("raw_value") if item.get("raw_value") is not None else item["value"]
    if req.missing_fields:
        for item in req.missing_fields:
            if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                merged_payload[item["key"]] = item.get("raw_value") if item.get("raw_value") is not None else item["value"]

    try:
        return execute_toaster_action(
            prod_db=db,
            member_id=resolved_id,
            action_type=req.action_type,
            payload=merged_payload,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
