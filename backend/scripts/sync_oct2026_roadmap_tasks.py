"""
Script de synchronisation et mise à jour des tâches de la feuille de route d'octobre 2026.

Fonctionnalités :
1. Mise à jour de la description et checklist de la tâche #79 (Vidange fosses septiques SARL Les Vidanges Conchoises).
2. Insertion (si absentes) des 4 tâches opérationnelles issues de la réunion du 11/10/2026 (r-fc1081-7 et r-fc1081-8),
   au nom d'Henri Jamet (créateur / member_id=1) :
   - Réparer ou remplacer la lampe cassée signalée à la maison (Presbytère, Facile, 10 pts)
   - Réparer l'équipement de douche défectueux (Presbytère, Modéré, 20 pts)
   - Réparer et régler la porte-fenêtre abîmée avant l'hiver (Presbytère, Modéré, 25 pts)
   - Organiser le ménage saisonnier de printemps et fin d'été (Presbytère, Modéré, 30 pts)

Usage :
  python sync_oct2026_roadmap_tasks.py [--dry-run]
  python sync_oct2026_roadmap_tasks.py --apply
"""

import os
import sys
import json
import argparse
from typing import Dict, Any, List, Optional
from datetime import datetime

# Assurer l'accès au package backend/app
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from app.models import Task, Member


TASK_79_NEW_DESCRIPTION = (
    "Rappel du cycle de vidange de 2 ans à 2 ans et demi :\n"
    "- Presbytère (4 rue de l'Ancienne Mairie) : vidange complète fosse toutes eaux (5 m³) et station de relevage "
    "le 19/12/2024 pour 482,90 € TTC ➔ prochaine vidange prévue au printemps 2027.\n"
    "- Rosings (8 rue de l'Ancienne Mairie) : vidange le 22/09/2025 pour 214,50 € TTC (fosse 1 m³) ➔ prochaine vidange en 2027/2028 "
    "(ou intervention groupée avec le Presbytère).\n\n"
    "Signes distinctifs d'alerte pour intervenir :\n"
    "- Apparition de mauvaises odeurs persistantes (notamment dans la chambre d'Eugénie au Presbytère ou aux abords des regards).\n"
    "- Ralentissement ou engorgement de l'évacuation des sanitaires et chasses d'eau.\n\n"
    "Emplacement des dalles béton à dégager avant l'arrivée du camion :\n"
    "- Presbytère : plaques situées dans le grand pré / la cour (cuve principale et regard pompe de relevage).\n"
    "- Rosings : plaque en béton au pied de l'escalier extérieur avec bouchon de fermeture spécifique.\n\n"
    "Consigne vitale post-intervention :\n"
    "- Dès que le camion a fini de pomper, remplir IMMÉDIATEMENT la fosse à l'eau claire au tuyau d'arrosage "
    "pendant environ 3 heures pour équilibrer la pression hydrostatique du sol et éviter toute déformation ou remontée de la cuve."
)

TASK_79_NEW_CHECKLIST = [
    {
        "text": "Évaluation de l'opportunité : Vérifier les signes d'alerte (odeurs chambre Eugénie, évacuation lente) ou attendre le cycle (printemps 2027 Presbytère, 2027/2028 Rosings).",
        "completed": False
    },
    {
        "text": "Prise de rendez-vous : Contacter la SARL Les Vidanges Conchoises (02 32 30 17 51 ou 02 32 29 71 16) pour convenir du passage du camion hydrocureur.",
        "completed": False
    },
    {
        "text": "Dégagement préalable des accès : Dégager la terre et l'herbe sur les dalles en béton (dans le pré au Presbytère ; au pied de l'escalier extérieur à Rosings).",
        "completed": False
    },
    {
        "text": "Accueil & Guidage : Ouvrir les portails et guider le chauffeur au plus près des regards de pompage.",
        "completed": False
    },
    {
        "text": "Consigne vitale : Dès la fin du pompage, remplir immédiatement la fosse à l'eau claire au tuyau d'arrosage pendant 3 heures pour équilibrer la pression du sol.",
        "completed": False
    },
    {
        "text": "Facturation & Certificat officiel : Récupérer le bordereau de suivi des matières de vidange (SPANC) et la facture libellée à la SCI HELLENVILLIERS.",
        "completed": False
    },
    {
        "text": "Règlement & Dépôt : Régler la facture (virement Swan, carte pro SCI ou avance) et téléverser les justificatifs sur l'application.",
        "completed": False
    }
]

NEW_OPERATIONAL_TASKS = [
    {
        "title": "Réparer ou remplacer la lampe cassée signalée à la maison",
        "category": "Presbytère",
        "subject": "Presbytère",
        "complexity": "Facile",
        "charge_points": 1,
        "priority": "Normale",
        "status": "PROPOSED",
        "created_by": "Henri Jamet",
        "description": (
            "Intervention opérationnelle signalée lors de la réunion du 11/10 (r-fc1081-7/8) : "
            "inspecter, réparer ou remplacer la lampe cassée signalée au Presbytère afin de garantir un éclairage sécurisé et confortable."
        ),
        "checklist": [
            {"text": "Identifier la lampe défectueuse et contrôler l'ampoule et le câble d'alimentation", "completed": False},
            {"text": "Acheter la pièce détachée ou un luminaire de remplacement adapté", "completed": False},
            {"text": "Poser, brancher et vérifier le bon fonctionnement de l'éclairage", "completed": False}
        ]
    },
    {
        "title": "Réparer l'équipement de douche défectueux (flexible, pommeau ou mitigeur)",
        "category": "Presbytère",
        "subject": "Presbytère",
        "complexity": "Modéré",
        "charge_points": 2,
        "priority": "Normale",
        "status": "PROPOSED",
        "created_by": "Henri Jamet",
        "description": (
            "Intervention opérationnelle signalée lors de la réunion du 11/10 (r-fc1081-7/8) : "
            "inspecter la robinetterie de douche au Presbytère, remplacer le flexible fuyard, pommeau entartré ou cartouche mitigeur pour éliminer les fuites d'eau."
        ),
        "checklist": [
            {"text": "Examiner la cabine de douche et localiser la fuite ou l'élément défaillant (flexible, joint, mitigeur)", "completed": False},
            {"text": "Acheter le flexible ou matériel de remplacement adéquat avec joints d'étanchéité", "completed": False},
            {"text": "Monter le matériel avec joints neufs et vérifier l'étanchéité sous pression d'eau", "completed": False}
        ]
    },
    {
        "title": "Réparer et régler la porte-fenêtre abîmée avant l'hiver",
        "category": "Presbytère",
        "subject": "Presbytère",
        "complexity": "Modéré",
        "charge_points": 2,
        "priority": "Haute",
        "status": "PROPOSED",
        "created_by": "Henri Jamet",
        "description": (
            "Intervention de confort thermique signalée lors de la réunion du 11/10 (r-fc1081-7/8) : "
            "ajuster les paumelles, régler la crémone de fermeture et remplacer les joints d'isolation de la porte-fenêtre abîmée avant les froids hivernaux."
        ),
        "checklist": [
            {"text": "Constater les frottements au sol et les défauts d'étanchéité à l'air de la porte-fenêtre", "completed": False},
            {"text": "Régler les ferrures, paumelles et huiler la crémone de verrouillage", "completed": False},
            {"text": "Remplacer ou poser un joint d'isolation adapté si l'air passe en périphérie", "completed": False},
            {"text": "Tester la souplesse d'ouverture et l'étanchéité thermique", "completed": False}
        ]
    },
    {
        "title": "Organiser le ménage saisonnier de printemps et fin d'été (grands textiles et liste de Maman)",
        "category": "Presbytère",
        "subject": "Presbytère",
        "complexity": "Modéré",
        "charge_points": 3,
        "priority": "Normale",
        "status": "PROPOSED",
        "created_by": "Henri Jamet",
        "description": (
            "Coordination du grand ménage périodique signalée lors de la réunion du 11/10 (r-fc1081-7/8) : "
            "organiser le lavage des grands textiles (couettes, housses, rideaux) et exécuter les points clés de la liste de recommandations de Maman."
        ),
        "checklist": [
            {"text": "Prendre connaissance de la liste des points de vigilance ménage établie par Maman", "completed": False},
            {"text": "Planifier les cycles de lavage et séchage des couettes, alèses et grands textiles", "completed": False},
            {"text": "Procéder au dépoussiérage et nettoyage approfondi des pièces et literies", "completed": False},
            {"text": "Faire le réassort des consommables et ranger le linge propre", "completed": False}
        ]
    }
]


def sync_tasks(session: Session, dry_run: bool = True) -> Dict[str, Any]:
    """
    Exécute ou simule la synchronisation des tâches.
    Retourne un dictionnaire résumant les actions prévues ou effectuées.
    """
    report = {
        "dry_run": dry_run,
        "task_79_updated": False,
        "tasks_inserted": [],
        "tasks_already_present": []
    }

    # 1. Mise à jour de la tâche #79
    task_79 = session.query(Task).filter(
        (Task.id == 79) | (Task.title.ilike("%Vidanger les fosses septiques%"))
    ).first()

    if task_79:
        if not dry_run:
            task_79.description = TASK_79_NEW_DESCRIPTION
            task_79.checklist = json.dumps(TASK_79_NEW_CHECKLIST, ensure_ascii=False)
            task_79.updated_at = datetime.utcnow()
        report["task_79_updated"] = True
    else:
        report["task_79_updated"] = False

    # 2. Insertion des 4 tâches opérationnelles
    for task_def in NEW_OPERATIONAL_TASKS:
        existing = session.query(Task).filter(Task.title == task_def["title"]).first()
        if existing:
            report["tasks_already_present"].append(task_def["title"])
        else:
            if not dry_run:
                new_t = Task(
                    title=task_def["title"],
                    category=task_def["category"],
                    subject=task_def["subject"],
                    complexity=task_def["complexity"],
                    charge_points=task_def["charge_points"],
                    priority=task_def["priority"],
                    status=task_def["status"],
                    created_by=task_def["created_by"],
                    description=task_def["description"],
                    checklist=json.dumps(task_def["checklist"], ensure_ascii=False),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_t)
            report["tasks_inserted"].append({
                "title": task_def["title"],
                "points": task_def["charge_points"],
                "creator": task_def["created_by"]
            })

    if not dry_run:
        session.commit()

    return report


def main():
    parser = argparse.ArgumentParser(description="Synchronisation de la roadmap tâches d'octobre 2026")
    parser.add_argument("--apply", action="store_true", help="Applique réellement les modifications en base")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Mode simulation sans écriture (actif par défaut)")
    parser.add_argument("--db-url", type=str, default=None, help="URL de la base de données cible (optionnel)")
    args = parser.parse_args()

    # Si --apply n'est pas spécifié, on est en dry_run par défaut
    is_dry_run = not args.apply

    mode_str = "[DRY-RUN - SIMULATION]" if is_dry_run else "[APPLY - PRODUCTION / REEL]"
    print(f"=== {mode_str} Exécution du script sync_oct2026_roadmap_tasks ===")

    # Déterminer la connexion
    if args.db_url:
        db_url = args.db_url
    else:
        # Charger .env
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
        report = sync_tasks(session, dry_run=is_dry_run)
        print("\n--- Résumé des opérations ---")
        print(f"Mode dry-run : {report['dry_run']}")
        print(f"Tâche #79 (Vidange fosses) trouvée et mise à jour : {report['task_79_updated']}")
        print(f"Nouvelles tâches à insérer ({len(report['tasks_inserted'])}) :")
        for t in report["tasks_inserted"]:
            print(f"  + [{t['points']} pts] {t['title']} (créateur: {t['creator']})")
        if report["tasks_already_present"]:
            print(f"Tâches déjà présentes ({len(report['tasks_already_present'])}) :")
            for title in report["tasks_already_present"]:
                print(f"  = {title}")
        print("\nOpération terminée avec succès.")
    except Exception as e:
        session.rollback()
        print(f"Erreur lors de l'exécution: {e}")
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
