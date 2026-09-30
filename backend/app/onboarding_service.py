import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session
from .models import AppRelease, MemberReleaseView

logger = logging.getLogger("sci_onboarding")

INITIAL_RELEASE_VERSION = "1.0.0"
INITIAL_RELEASE_TITLE = "Guide de Bienvenue & Fonctionnement de la SCI Hellenvilliers"

DEFAULT_ONBOARDING_PAGES: List[Dict[str, Any]] = [
    {
        "id": 1,
        "step": 1,
        "badge": "Étape 1 sur 6",
        "title": "Connexion, Mot de Passe & Notifications",
        "icon": "vpn_key",
        "emoji": "🔑",
        "subtitle": "Accédez facilement au portail et configurez vos alertes",
        "cards": [
            {
                "icon": "login",
                "title": "Comment vous connecter",
                "text": "Rendez-vous sur https://hellenvilliers.henri-jamet.com. Sur la page d'accueil, il vous suffit de cliquer directement sur votre prénom ou votre photo, puis de saisir votre mot de passe personnel. Vous pouvez aussi taper votre email si vous préférez."
            },
            {
                "icon": "password",
                "title": "Votre mot de passe personnel",
                "text": "Chacun dispose d'un mot de passe initial sécurisé. Dès votre première connexion, vous pouvez le changer en deux clics dans l'onglet Paramètres pour mettre celui de votre choix."
            },
            {
                "icon": "help_outline",
                "title": "Mot de passe oublié ?",
                "text": "Pas de panique, cliquez sur « Mot de passe oublié » sur l'écran de connexion. Le système vous envoie immédiatement un lien sécurisé par email pour en choisir un nouveau."
            },
            {
                "icon": "notifications_active",
                "title": "Notifications & Alertes",
                "text": "Toutes les informations importantes (nouvelle tâche, vote ouvert, réservation d'un séjour) atterrissent directement dans la petite cloche 🔔 en haut à droite. Dans vos Paramètres, vous êtes libres de choisir si vous souhaitez également recevoir un courriel pour chaque événement ou uniquement les consulter sur le site."
            }
        ]
    },
    {
        "id": 2,
        "step": 2,
        "badge": "Étape 2 sur 6",
        "title": "Calendrier, Séjours & Confort Thermique Automatique",
        "icon": "calendar_month",
        "emoji": "📅",
        "subtitle": "Coordonnez les venues et profitez d'une maison toujours chauffée",
        "cards": [
            {
                "icon": "event",
                "title": "Réserver votre séjour",
                "text": "Rendez-vous sur le calendrier, sélectionnez les dates ou la semaine de votre passage, et indiquez les chambres occupées ainsi que vos accompagnants. C'est indispensable pour coordonner les présences et éviter les doublons entre nous."
            },
            {
                "icon": "thermostat",
                "title": "Gestion automatique du chauffage",
                "text": "Plus besoin de vous soucier de la chaudière en arrivant ! Dès que votre séjour est enregistré sur le calendrier, le système déclenche automatiquement le préchauffage de la maison à 20°C exactement 24h avant votre arrivée pour trouver une maison chaude et accueillante."
            },
            {
                "icon": "ac_unit",
                "title": "Départ et mode hors-gel",
                "text": "À la fin de votre séjour, le système repasse automatiquement la chaudière fioul en mode économique hors-gel (5.0°C), ce qui évite de chauffer des pièces vides et nous fait économiser des centaines d'euros chaque mois."
            },
            {
                "icon": "water_drop",
                "title": "Eau chaude et sécurité sanitaire",
                "text": "Le ballon de 250L est régulé automatiquement à 52°C pendant les séjours, avec un cycle périodique de sécurité anti-légionelle au-dessus de 60°C."
            },
            {
                "icon": "cottage",
                "title": "Page Séjour et vadémécum",
                "text": "Pendant que vous êtes sur place, l'onglet Séjour vous donne la météo locale, la température de la piscine Klereo, le niveau de la cuve à fioul et vous permet d'ajuster une consigne si nécessaire."
            }
        ]
    },
    {
        "id": 3,
        "step": 3,
        "badge": "Étape 3 sur 6",
        "title": "Prise de Décision & Scrutins Familiaux",
        "icon": "how_to_vote",
        "emoji": "🗳️",
        "subtitle": "Participez aux choix du domaine en toute simplicité",
        "cards": [
            {
                "icon": "add_comment",
                "title": "Proposer un vote",
                "text": "N'importe quel associé peut soumettre une proposition (un projet d'embellissement, un achat d'équipement, une décision de gestion)."
            },
            {
                "icon": "sync_alt",
                "title": "Le cycle d'un vote",
                "text": "1. Proposition : vous déposez votre idée avec une description claire et les choix possibles.\n2. Validation par la coordination : Henri ou Joséphine vérifie la complétude du dossier et lance officiellement le vote.\n3. Expression de chacun : vous recevez une alerte pour voter directement en ligne (Pour, Contre, Abstention ou options sur-mesure) et partager vos avis dans le chat intégré."
            },
            {
                "icon": "event_repeat",
                "title": "Option « Reporter à la prochaine AG »",
                "text": "Si une question nécessite un débat approfondi de visu, vous pouvez choisir de la décaler à notre prochaine Assemblée Générale annuelle. Le sujet bascule alors automatiquement dans l'ordre du jour officiel de l'AG."
            },
            {
                "icon": "inventory_2",
                "title": "Clôture et archivage",
                "text": "Dès que tout le monde a voté, la coordination valide le résultat final, et un récapitulatif est archivé dans l'historique, consultable à tout moment."
            }
        ]
    },
    {
        "id": 4,
        "step": 4,
        "badge": "Étape 4 sur 6",
        "title": "Missions, Tâches & Équité Familiale",
        "icon": "checklist",
        "emoji": "📋",
        "subtitle": "Entretenir le domaine ensemble et répartir la charge équitablement",
        "cards": [
            {
                "icon": "help",
                "title": "Pourquoi des tâches ?",
                "text": "Entretenir un domaine comme Hellenvilliers demande du temps. Pour que la charge ne repose pas toujours sur les mêmes épaules, toutes les actions à mener sont répertoriées ici."
            },
            {
                "icon": "build",
                "title": "Missions sur place vs Missions de fond",
                "text": "• Sur place : ranger le bois, tondre une parcelle, changer un filtre, relever un compteur.\n• De fond : négocier une commande groupée de fioul, suivre un contrat d'assurance, superviser un devis d'artisan."
            },
            {
                "icon": "check_circle",
                "title": "Le cycle d'une tâche",
                "text": "Comme pour les votes, toute tâche proposée est validée par la coordination, assignée à un ou plusieurs responsables, réalisée sur place puis marquée comme complétée."
            },
            {
                "icon": "balance",
                "title": "Attribution équitable et expérience",
                "text": "Les tâches peuvent être confiées manuellement par Henri et Jo, ou attribuées automatiquement par le système selon votre expérience (le nombre de tâches similaires que vous maîtrisez déjà) et votre occupation de la maison (plus vous réservez de jours et de chambres au cours de l'année, plus vous participez à la vie du domaine !)."
            }
        ]
    },
    {
        "id": 5,
        "step": 5,
        "badge": "Étape 5 sur 6",
        "title": "Espace Administratif & Compte Bancaire Indy",
        "icon": "account_balance",
        "emoji": "🏛️",
        "subtitle": "Documents officiels centralisés et transparence financière totale",
        "cards": [
            {
                "icon": "folder_shared",
                "title": "Centralisation des documents",
                "text": "Plus besoin de chercher partout les contrats d'assurance, les statuts notariés de la SCI, les attestations RNE de l'INPI, les devis ou les factures des prestataires. Tout est archivé, classé par catégorie et téléchargeable dans l'onglet Administratif."
            },
            {
                "icon": "credit_card",
                "title": "Compte bancaire de la SCI",
                "text": "Nous avons ouvert le compte professionnel de la SCI chez Indy (adossé à Swan et BNP Paribas). Ce compte est 100% gratuit et sans frais de gestion."
            },
            {
                "icon": "payments",
                "title": "Transparence financière",
                "text": "Vous pouvez suivre en temps réel la trésorerie disponible, l'enregistrement des cotisations mensuelles de 50 € par branche en compte courant d'associé, ainsi que l'ensemble des dépenses acquittées par la SCI."
            }
        ]
    },
    {
        "id": 6,
        "step": 6,
        "badge": "Étape 6 sur 6",
        "title": "Statistiques & Vie du Domaine",
        "icon": "insights",
        "emoji": "📊",
        "subtitle": "Rétrospective conviviale, présence et valorisation de l'engagement",
        "cards": [
            {
                "icon": "celebration",
                "title": "Rétrospective en toute convivialité",
                "text": "L'onglet Statistiques vous donne une vision globale et ludique de la vie de notre famille à Hellenvilliers."
            },
            {
                "icon": "pie_chart",
                "title": "Ce que vous y trouverez",
                "text": "Le nombre total de nuitées passées par chacun, la répartition de la charge de travail entre les branches, les domaines d'activité les plus actifs (espaces verts, thermique, administratif, piscine) et l'évolution de nos dépenses au fil des saisons."
            },
            {
                "icon": "favorite",
                "title": "Objectif",
                "text": "Zéro jugement, simplement un moyen sain et transparent de valoriser l'engagement de chacun et de garder notre domaine vivant et chaleureux pour les années à venir !"
            }
        ]
    }
]


def run_onboarding_migrations(target_engine):
    """
    Migration auto-guérison idempotente pour app_releases et member_release_views.
    Supporte SQLite et PostgreSQL (Supabase).
    """
    if not target_engine:
        return
    dialect = target_engine.dialect.name
    logger.info(f"[ONBOARDING MIGRATION] Running migrations on dialect '{dialect}'...")

    with target_engine.connect() as conn:
        try:
            if dialect == "sqlite":
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS app_releases (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        version VARCHAR(50) UNIQUE NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        pages_json TEXT NOT NULL,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS member_release_views (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                        release_version VARCHAR(50) NOT NULL,
                        viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_member_release_view UNIQUE (member_id, release_version)
                    );
                """))
                conn.commit()
            else:
                # PostgreSQL (Supabase)
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS app_releases (
                        id SERIAL PRIMARY KEY,
                        version VARCHAR(50) UNIQUE NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        pages_json TEXT NOT NULL,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS member_release_views (
                        id SERIAL PRIMARY KEY,
                        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                        release_version VARCHAR(50) NOT NULL,
                        viewed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_member_release_view UNIQUE (member_id, release_version)
                    );
                """))
                conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_member_release_views_member_version 
                    ON member_release_views(member_id, release_version);
                """))
                conn.commit()
            logger.info("[ONBOARDING MIGRATION] Migrations completed successfully.")
        except Exception as exc:
            logger.error(f"[ONBOARDING MIGRATION ERROR] {exc}")
            conn.rollback()
            raise


def seed_initial_onboarding(db: Session) -> AppRelease:
    """
    Seed initial au démarrage si aucune release n'existe.
    Garantit la présence de la release version '1.0.0' avec les 6 pages.
    """
    try:
        release = db.query(AppRelease).filter(AppRelease.version == INITIAL_RELEASE_VERSION).first()
        if not release:
            logger.info(f"[ONBOARDING SEED] Creating initial release v{INITIAL_RELEASE_VERSION}...")
            release = AppRelease(
                version=INITIAL_RELEASE_VERSION,
                title=INITIAL_RELEASE_TITLE,
                pages_json=json.dumps(DEFAULT_ONBOARDING_PAGES, ensure_ascii=False),
                is_active=True,
                created_at=datetime.utcnow()
            )
            db.add(release)
            db.commit()
            db.refresh(release)
            logger.info(f"[ONBOARDING SEED] Initial release v{INITIAL_RELEASE_VERSION} created successfully.")
        return release
    except Exception as exc:
        logger.error(f"[ONBOARDING SEED ERROR] Failed to seed release: {exc}")
        db.rollback()
        raise


def get_current_release(db: Session, version: Optional[str] = None) -> Optional[AppRelease]:
    """Retourne la release spécifiée ou la dernière release active."""
    query = db.query(AppRelease)
    if version:
        return query.filter(AppRelease.version == version).first()
    return query.filter(AppRelease.is_active == True).order_by(AppRelease.created_at.desc()).first()


def has_member_seen_release(db: Session, member_id: int, version: str) -> bool:
    """Vérifie si un membre a acquitté/vu la version donnée."""
    if not member_id or not version:
        return False
    return db.query(MemberReleaseView).filter(
        MemberReleaseView.member_id == member_id,
        MemberReleaseView.release_version == version
    ).first() is not None


def mark_release_viewed(db: Session, member_id: int, version: str) -> MemberReleaseView:
    """Enregistre l'acquittement de la release par le membre (idempotent)."""
    view = db.query(MemberReleaseView).filter(
        MemberReleaseView.member_id == member_id,
        MemberReleaseView.release_version == version
    ).first()
    now = datetime.utcnow()
    if not view:
        view = MemberReleaseView(
            member_id=member_id,
            release_version=version,
            viewed_at=now
        )
        db.add(view)
    else:
        view.viewed_at = now
    db.commit()
    db.refresh(view)
    return view
