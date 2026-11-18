import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
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

_BACKEND_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_BACKEND_ENV_PATH)
load_dotenv()

router = APIRouter(prefix="/api/toaster", tags=["Grille-Pain IA (Sandbox)"])

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


# Libellés humains élégants pour l'affichage pliable des appels d'outils (sans jargon technique)
TOOL_HUMAN_LABELS: Dict[str, Dict[str, str]] = {
    "read_treasury_and_banking": {"label": "Consultation de la trésorerie Swan & des comptes associés", "icon": "account_balance"},
    "read_tasks_and_equity": {"label": "Vérification des tâches du domaine & attributions", "icon": "task_alt"},
    "read_stays_and_calendar": {"label": "Lecture du calendrier des séjours", "icon": "calendar_month"},
    "read_polls_and_votes": {"label": "Consultation des scrutins & votes des associés", "icon": "how_to_vote"},
    "read_heating_and_pool_status": {"label": "Relevé chauffage Presbytère, cuve fioul & piscine", "icon": "thermostat"},
    "read_documents_and_contracts": {"label": "Recherche dans les documents officiels de la SCI", "icon": "folder_open"},
    "inspect_ui_skill": {"label": "Chargement du guide de composant / règle métier", "icon": "menu_book"},
    "display_ui_component": {"label": "Affichage d'un composant interactif dans la conversation", "icon": "widgets"},
    "propose_stay_action": {"label": "Préparation d'une carte de réservation de séjour", "icon": "event_available"},
    "propose_heating_or_pool_action": {"label": "Préparation d'un réglage chauffage / piscine", "icon": "local_fire_department"},
    "propose_invoice_or_document_upload": {"label": "Extraction multimodale de la facture / pièce jointe", "icon": "receipt_long"},
    "propose_task_action": {"label": "Préparation d'une action sur les tâches", "icon": "assignment_turned_in"},
    "propose_poll_or_vote_action": {"label": "Préparation d'un vote ou nouveau scrutin", "icon": "ballot"},
}


TOASTER_FUNCTION_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "display_ui_component",
        "description": (
            "Affiche directement dans le fil de discussion un composant visuel interactif du site SCI Hellenvilliers "
            "(calendrier des réservations, graphe fioul/chauffage, piscine, carte de scrutin/vote, cartes de tâches, "
            "synthèse trésorerie, aperçu de document officiel, ou boutons d'ouverture de formulaires modaux)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "component_id": {
                    "type": "STRING",
                    "description": (
                        "Identifiant du composant à partager : "
                        "'stays_calendar' (calendrier mensuel des séjours), "
                        "'fuel_and_heating_graph' (graphe d'utilisation du fioul & courbes températures), "
                        "'pool_status_widget' (état piscine Klereo), "
                        "'poll_status_card' (état détaillé des votes d'un scrutin précis ou des scrutins en cours), "
                        "'tasks_overview_card' (liste visuelle de tâches filtrées), "
                        "'treasury_overview_card' (solde Swan, IBAN & CCA des 7 associés), "
                        "'document_viewer_card' (aperçu & téléchargement de documents PDF), "
                        "'action_modal_buttons' (boutons ouvrant le formulaire de réservation, de tâche, de vote ou de document)."
                    ),
                },
                "props": {
                    "type": "OBJECT",
                    "description": (
                        "Paramètres optionnels selon le composant (ex: {'month': 11, 'year': 2026} pour stays_calendar ; "
                        "{'initial_tab': 'annual'|'temperatures'|'daily'} pour fuel_and_heating_graph ; "
                        "{'project_id': 40} ou {'search_query': 'ménage'} pour poll_status_card ; "
                        "{'assigned_to': 'Joséphine', 'status_filter': 'EN_COURS'} pour tasks_overview_card ; "
                        "{'document_id': 177} pour document_viewer_card ; "
                        "{'buttons': [{'modal_type': 'stay'|'task'|'poll'|'document', 'label': '...'}]} pour action_modal_buttons)."
                    ),
                },
            },
            "required": ["component_id"],
        },
    },
    {
        "name": "inspect_ui_skill",
        "description": (
            "Outil d'exploration progressive à la demande (système de skills) : charge uniquement en cas de besoin "
            "les spécifications détaillées des composants interactifs ou des règles métier d'un volet précis "
            "sans saturer le contexte initial."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "skill_id": {
                    "type": "STRING",
                    "description": (
                        "Identifiant du skill à charger : 'ui_components' (détail des props de tous les composants affichables), "
                        "'sejours_et_chauffage', 'taches_et_artisans', 'votes_et_ag', ou 'tresorerie_et_documents'."
                    ),
                },
            },
            "required": ["skill_id"],
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
                    "description": "Prénom optionnel d'un associé sur lequel zoomer (ex: 'Frédéric', 'Élisabeth', 'Joséphine', 'Henri').",
                },
            },
        },
    },
    {
        "name": "read_tasks_and_equity",
        "description": (
            "Outil de LECTURE SEULE : lit le détail complet des tâches du domaine (descriptions complètes, "
            "numéros de téléphone d'artisans, consignes pas-à-pas, commentaires, pièces jointes PDF et "
            "répartition des points de contribution/équité entre les 7 associés)."
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
            "Outil de LECTURE SEULE : recherche parmi les documents officiels de la SCI sur le site "
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
    {
        "name": "propose_stay_action",
        "description": (
            "Propose de créer, modifier ou annuler une réservation de séjour au Domaine d'Hellenvilliers "
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
                    "description": "Réponse fluide en français naturel accompagnant la carte de réservation.",
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
                    "description": "Réponse fluide en français naturel accompagnant la carte de pilotage thermique.",
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
                    "description": "Réponse fluide en français naturel résumant l'extraction de la facture.",
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
                    "description": "Réponse fluide en français naturel accompagnant la carte de tâche.",
                },
            },
            "required": ["operation", "title", "assistant_message"],
        },
    },
    {
        "name": "propose_poll_or_vote_action",
        "description": (
            "Propose d'enregistrer le vote du membre sur un scrutin ouvert (simple POUR/CONTRE/ABSTENTION "
            "ou sondage multi-dates/options) ou de créer un nouveau scrutin."
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
                    "description": "Réponse fluide en français naturel accompagnant la carte de scrutin/vote.",
                },
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
    "inspect_ui_skill",
    "display_ui_component",
}


# Préfixe statique immuable placé tout en haut de systemInstruction pour maximiser le Prefix Caching Gemini
STATIC_TOASTER_SYSTEM_PREFIX = """Tu es l'assistant intelligent de la SCI Hellenvilliers (domaine en Normandie comprenant le Presbytère, Rosings et L'Annexe).

CHARTE STYLISTIQUE ET RELATIONNELLE IMPÉRATIVE :
1. PRÉNOMS UNIQUEMENT — ZÉRO TITRE FAMILIAL : les 7 associés de la SCI sont exclusivement désignés par leur prénom : Élisabeth, Frédéric, Henri, Marguerite, Hortense, Joséphine et Eugénie. N'utilise JAMAIS les mots « Maman », « Papa », « ta mère », « ton père » ou « les parents », même si ton interlocuteur est Élisabeth ou Frédéric ou emploie lui-même ces mots. Appelle toujours Élisabeth « Élisabeth » et Frédéric « Frédéric ».
2. RÉSUMÉS FLUIDES EN LANGAGE NATUREL — ZÉRO LONGUE LISTE À PUCES : rédige toujours tes réponses sous forme de courts paragraphes fluides, chaleureux et directs en français naturel, où les chiffres importants, dates et noms s'insèrent naturellement dans le fil de la phrase (avec un peu de **gras** Markdown bien dosé pour faire ressortir l'essentiel). Évite systématiquement les longues listes à puces ou énumérations robotiques de tous les détails. Ne mentionne jamais le nom technique de ton modèle d'IA.
3. EXACTITUDE STRICTE : ne devine jamais un chiffre, un téléphone ou une date. Appelle les outils `read_*` dès qu'un détail n'est pas déjà certain dans le résumé d'état ci-dessous.

RÉPERTOIRE EN CACHE DES COMPOSANTS VISUELS PARTAGEABLES (`display_ui_component`) & SKILLS À LA DEMANDE (`inspect_ui_skill`) :
Tu peux enrichir tes réponses en affichant directement les vrais composants interactifs du site dans le chat via `display_ui_component(component_id, props)` :
- `stays_calendar` : calendrier mensuel interactif des réservations (props: `month` 1..12, `year`, `building`). À afficher dès qu'on demande le calendrier ou les disponibilités.
- `fuel_and_heating_graph` : graphe interactif 3 onglets de la cuve à fioul (3 000 L), des livraisons Éts Josse et des températures/brûleur Viessmann (props: `initial_tab`: `'annual'` | `'temperatures'` | `'daily'`). À afficher dès qu'on parle du graphe de fioul, de la consommation ou de l'évolution thermique.
- `pool_status_widget` : carte télémétrie en direct de la piscine Klereo (eau, air, pH, Redox, PAC 20 kW).
- `poll_status_card` : état visuel d'un scrutin / vote précis ou des scrutins en cours avec barres de progression et vote 1-clic (props: `project_id` ou `search_query`).
- `tasks_overview_card` : cartes visuelles des tâches filtrées par associé ou statut avec pièces jointes PDF (props: `assigned_to`, `status_filter`, `task_id`).
- `treasury_overview_card` : carte financière du compte Swan, IBAN copiable et soldes CCA des 7 associés.
- `document_viewer_card` : cartes d'aperçu et téléchargement direct de documents PDF officiels (props: `document_id` ou `search_query`).
- `action_modal_buttons` : boutons d'action ronds dans le chat permettant d'ouvrir en 1 clic les formulaires complets de réservation (`modal_type: 'stay'`), de création de tâche (`'task'`), de création de vote (`'poll'`) ou de dépôt de document/facture (`'document'`).
Si tu as besoin du schéma détaillé d'un composant ou des règles métier précises d'un domaine avant d'agir, appelle d'abord `inspect_ui_skill(skill_id)` parmi `'ui_components'`, `'sejours_et_chauffage'`, `'taches_et_artisans'`, `'votes_et_ag'`, `'tresorerie_et_documents'`. Lorsqu'un composant visuel est affiché, ne recopie pas tout son contenu en texte : accompagne-le simplement de deux ou trois phrases claires et naturelles.

ARCHITECTURE DE SÉCURITÉ (BAC À SABLE ISOLÉ) :
- LECTURE 100 % RÉELLE : les outils `read_*` lisent les vraies données à jour de la SCI et les documents PDF/images officiels.
- ÉCRITURE 100 % INTERCEPTÉE : dès que l'associé exprime une intention d'action concrète (réserver/modifier/annuler un séjour, régler le chauffage ou la piscine, enregistrer une facture jointe, cocher ou créer une tâche, voter ou créer un scrutin), appelle l'outil `propose_*` correspondant (sans deviner un bâtiment ou un mode de chauffage non précisé : mets `heating_explicitly_stated=false` si non mentionné, `building=""` si non précisé, et `payer_explicitly_stated=false` sur une facture si l'avance personnelle n'est pas précisée). Si l'utilisateur demande simplement d'ouvrir le formulaire (ex: « ouvre-moi le formulaire de réservation / de création de vote »), affiche le bouton d'ouverture via `display_ui_component(component_id='action_modal_buttons', ...)`."""


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

    member_prenom = _sanitize_family_titles(str(member.get("prenom") or "Henri"))
    member_name = _sanitize_family_titles(str(member.get("name") or "Henri Jamet"))

    stays_txt = "\n".join(
        f"  - Séjour #{s['id']} : {s['property_name']} du {s['start_date']} ({s.get('arrival_time', '15:00')}) "
        f"au {s['end_date']} ({s.get('departure_time', '11:00')}) par {_sanitize_family_titles(str(s.get('user_name') or ''))} ({s['guest_count']} pers., statut={s['status']})"
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
    ) or "  (Aucun scrutin)"

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

    gateway_note = (
        f"HORS LIGNE depuis {heating.get('recorded_at')} (dernier relevé en cache servi ; pas de panne générale Internet au domaine car la piscine Klereo à Rosings répond en direct, donc coupure locale Wi-Fi ou secteur au Presbytère)"
        if heating.get("is_gateway_offline")
        else f"EN LIGNE (relevé {heating.get('recorded_at')})"
    )

    attach_info = (
        f"\nPIÈCE JOINTE FOURNIE DANS CE MESSAGE : « {attachment_name} » (analyse son contenu visuel/texte avec précision)."
        if attachment_name
        else ""
    )

    dynamic_context = f"""
--- CONTEXTE DYNAMIQUE DU DOMAINE ({datetime.utcnow().strftime('%Y-%m-%d')}) ---
ASSOCIÉ CONNECTÉ : {member_name} (Prénom à utiliser : {member_prenom} | ID={member.get('id')} | Rôle={member.get('role')})
- Référence virement : {member.get('payment_reference')} | Quote-part : {float(treasury.get('monthly_contribution') or 0.0):.2f} €/mois | Solde CCA : {float(treasury.get('balance') or 0.0):+.2f} € ({treasury.get('covered_months', 0)} mois d'avance)
- Écritures récentes de {member_prenom} :
{entries_txt}
- Appels de fonds de {member_prenom} :
{calls_txt}

TRÉSORERIE GLOBALE SCI ({docs_count} documents officiels disponibles via `read_documents_and_contracts`) :
- Compte Swan ({swan.get('iban')}) : solde réel = {float(swan.get('balance') or 0.0):.2f} € (synchro : {swan.get('last_synced_at')})
- Soldes CCA des 7 associés : {assoc_txt}

ÉTAT THERMIQUE PRESBYTÈRE & PISCINE :
- Passerelle Vitoconnect Opto2 : {gateway_note}
- Mode chaudière ViCare : {heating.get('mode')} | Confort jour : {heating.get('comfort_temperature', 20.0)} °C (04h30–21h00) | Réduit nuit : {heating.get('reduced_temperature', 6.0)} °C (21h00–04h30)
- Température Presbytère : {heating.get('room_temperature')} °C int. / {heating.get('outside_temperature')} °C ext. | Cuve fioul (3 000 L) : ~{heating.get('fuel_liters_remaining')} L ({heating.get('fuel_percent')} %)
- Piscine Klereo : mode {heating.get('pool_mode')} ({heating.get('pool_temperature')} °C, filtration {heating.get('pool_filtration_mode')})

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
                        {"label": "Vendredi 20/11/2026", "value": "2026-11-20"},
                        {"label": "Vendredi 27/11/2026", "value": "2026-11-27"},
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
            "start_date": start_date or "2026-11-20",
            "end_date": end_date or start_date or "2026-11-22",
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
                    "question": f"Avez-vous avancé et réglé cette facture personnellement ({member_prenom}), ou doit-elle être payée par la SCI ?",
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
        assigned_to = _sanitize_family_titles(str(args.get("assigned_to") or member_name).strip())
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
        title = str(args.get("title") or "Scrutin").strip()
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
    return contents


def _merge_streamed_part(accumulated_parts: List[Dict[str, Any]], incoming: Dict[str, Any]) -> None:
    """
    Reconstruit fidèlement model_content.parts lors du streaming SSE Gemini 4
    tout en préservant intégralement chaque thoughtSignature.
    """
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
            "pool_status_widget": "Affichage de l'état de la piscine",
            "poll_status_card": "Affichage de la carte de vote",
            "tasks_overview_card": "Affichage des cartes de tâches",
            "treasury_overview_card": "Affichage de la synthèse financière",
            "document_viewer_card": "Affichage des documents officiels",
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
    db: Session,
) -> Generator[Dict[str, Any], None, None]:
    """
    Générateur d'événements temps réel (pensées, appels d'outils, composants UI, texte progressif, carte d'action).
    Utilisé à la fois par POST /api/toaster/chat/stream (SSE) et POST /api/toaster/chat (JSON agrégé).
    """
    state = get_sandbox_state(prod_db=db, member_id=req.member_id)
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

    MAX_STEPS = 6

    with httpx.Client(timeout=60.0) as client:
        for step_idx in range(MAX_STEPS + 1):
            force_text_only = step_idx == MAX_STEPS
            gemini_payload: Dict[str, Any] = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "tools": [{"functionDeclarations": TOASTER_FUNCTION_DECLARATIONS}],
                "generationConfig": {
                    "temperature": 0.25,
                    "thinkingConfig": {
                        "thinkingLevel": "HIGH",
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
                # Exécuter aussi d'éventuels display_ui_component appelés dans le même tour !
                for rc in read_calls:
                    rc_name = rc.get("name") or ""
                    rc_args = rc.get("args") or {}
                    r_label, r_icon = _describe_tool_call(rc_name, rc_args)
                    r_entry = {"id": f"tool-{len(tool_steps_log)+1}", "name": rc_name, "label": r_label, "icon": r_icon, "status": "running"}
                    yield {"type": "tool_step", "step": r_entry}
                    t_res = execute_sandbox_read_tool(prod_db=db, member_id=req.member_id, tool_name=rc_name, args=rc_args)
                    if isinstance(t_res, dict) and "_ui_component" in t_res:
                        ui_comp = t_res.pop("_ui_component")
                        ui_components_out.append(ui_comp)
                        yield {"type": "ui_component", "component": ui_comp}
                    r_entry["status"] = "done"
                    tool_steps_log.append(r_entry)
                    yield {"type": "tool_step", "step": r_entry}

                write_func_call = step_write_call
                final_text_parts.extend(step_texts)
                break

            if read_calls and not force_text_only:
                model_content = {"role": "model", "parts": accumulated_parts}
                contents.append(model_content)
                response_parts: List[Dict[str, Any]] = []

                for rc in read_calls:
                    rc_name = rc.get("name") or ""
                    rc_args = rc.get("args") or {}
                    rc_id = rc.get("id")
                    r_label, r_icon = _describe_tool_call(rc_name, rc_args)
                    step_id = f"tool-{len(tool_steps_log)+1}"
                    running_entry = {"id": step_id, "name": rc_name, "label": r_label, "icon": r_icon, "status": "running"}
                    yield {"type": "tool_step", "step": running_entry}

                    tool_result = execute_sandbox_read_tool(
                        prod_db=db,
                        member_id=req.member_id,
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

                    fn_resp_obj: Dict[str, Any] = {
                        "name": rc_name,
                        "response": {"result": tool_result},
                    }
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

            # Si le modèle s'est arrêté après un bloc thought sans produire de texte ni d'outil, forcer une synthèse finale !
            if not step_texts and not force_text_only:
                if accumulated_parts:
                    contents.append({"role": "model", "parts": accumulated_parts})
                contents.append(
                    {
                        "role": "user",
                        "parts": [{"text": "Formule maintenant ta réponse claire et naturelle en français à partir de ces éléments."}],
                    }
                )
                step_idx_override = MAX_STEPS - 1  # prochain tour en mode texte
                # Continuer vers une passe de synthèse forcée
                gemini_synth = {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": contents,
                    "tools": [{"functionDeclarations": TOASTER_FUNCTION_DECLARATIONS}],
                    "toolConfig": {"functionCallingConfig": {"mode": "NONE"}},
                    "generationConfig": {"temperature": 0.25},
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
                reply_text = f"J'ai préparé la carte **{action_card['title']}**. Vous pouvez vérifier les paramètres et confirmer l'exécution dans le bac à sable."
            yield {"type": "text_delta", "delta": reply_text}

        if action_card:
            yield {"type": "action_card", "action_card": action_card}

    if not reply_text and ui_components_out:
        reply_text = "Voici les éléments demandés directement affichés ci-dessous."
        yield {"type": "text_delta", "delta": reply_text}

    if not reply_text:
        raise HTTPException(
            status_code=502,
            detail="L'assistant n'a produit aucune réponse textuelle valide après consultation du contexte (Fail-Fast).",
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
    member_id: Optional[int] = Query(None, description="ID du membre actif dans le simulateur Grille-Pain"),
    db: Session = Depends(get_db),
):
    return get_sandbox_state(prod_db=db, member_id=member_id)


@router.post("/reset")
def reset_toaster_sandbox_endpoint(
    member_id: Optional[int] = Query(None),
    body: Optional[ToasterResetRequest] = Body(None),
    db: Session = Depends(get_db),
):
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
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        return RedirectResponse(url="/grille-pain", status_code=302)
    return {
        "status": "ok",
        "endpoint": "POST /api/toaster/chat",
        "stream_endpoint": "POST /api/toaster/chat/stream",
        "ui_url": "https://hellenvilliers.henri-jamet.com/grille-pain",
        "mode": "sandbox_isolated_writes_with_live_reads",
    }


@router.post("/chat/stream")
def toaster_chat_stream_endpoint(
    req: ToasterChatRequest,
    db: Session = Depends(get_db),
):
    """
    Flux SSE temps réel (pensées pliables, appels d'outils, composants UI interactifs et réponse Markdown).
    """
    def event_generator():
        try:
            for ev in _stream_toaster_orchestration(req=req, db=db):
                yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
        except HTTPException as http_exc:
            err_ev = {"type": "error", "detail": str(http_exc.detail)}
            yield f"data: {json.dumps(err_ev, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("[TOASTER STREAM EXCEPTION]")
            err_ev = {"type": "error", "detail": f"Erreur interne de l'orchestrateur : {exc}"}
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
    db: Session = Depends(get_db),
):
    """
    Point d'entrée JSON agrégé (consomme exactement le même moteur _stream_toaster_orchestration — DRY).
    """
    done_payload: Optional[Dict[str, Any]] = None
    for ev in _stream_toaster_orchestration(req=req, db=db):
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
    db: Session = Depends(get_db),
):
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
