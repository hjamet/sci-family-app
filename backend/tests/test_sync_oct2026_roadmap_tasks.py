"""
Tests unitaires pour le script de synchronisation des tâches roadmap oct 2026.
Validation hermétique sur base SQLite en mémoire (sqlite:///:memory:).
"""

import json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Task
from scripts.sync_oct2026_roadmap_tasks import (
    sync_tasks,
    TASK_79_NEW_DESCRIPTION,
    TASK_79_NEW_CHECKLIST,
    NEW_OPERATIONAL_TASKS
)


@pytest.fixture
def db_session():
    """Crée une base SQLite éphémère en mémoire pour chaque test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    yield session

    session.close()


def test_sync_tasks_dry_run_leaves_db_untouched(db_session):
    """En mode dry-run, aucune modification ne doit être écrite en base."""
    # Créer une tâche #79 factice avec l'ancienne description
    old_task_79 = Task(
        id=79,
        title="Vidanger les fosses septiques et contrôler les accès (SARL Les Vidanges Conchoises)",
        description="Ancienne description",
        checklist=json.dumps([{"text": "Ancienne étape", "completed": False}]),
        created_by="Admin"
    )
    db_session.add(old_task_79)
    db_session.commit()

    report = sync_tasks(db_session, dry_run=True)

    assert report["dry_run"] is True
    assert report["task_79_updated"] is True
    assert len(report["tasks_inserted"]) == 4
    assert len(report["tasks_already_present"]) == 0

    # Vérification que la base n'a pas bougé
    t79 = db_session.query(Task).filter(Task.id == 79).first()
    assert t79.description == "Ancienne description"
    assert json.loads(t79.checklist)[0]["text"] == "Ancienne étape"

    # Aucune autre tâche ne doit exister
    all_tasks = db_session.query(Task).all()
    assert len(all_tasks) == 1


def test_sync_tasks_apply_updates_task_79_and_inserts_new_tasks(db_session):
    """En mode apply, la tâche #79 est mise à jour et les 4 tâches opérationnelles sont créées."""
    old_task_79 = Task(
        id=79,
        title="Vidanger les fosses septiques et contrôler les accès (SARL Les Vidanges Conchoises)",
        description="Ancienne description",
        checklist=json.dumps([{"text": "Ancienne étape", "completed": False}]),
        created_by="Admin"
    )
    db_session.add(old_task_79)
    db_session.commit()

    report = sync_tasks(db_session, dry_run=False)

    assert report["dry_run"] is False
    assert report["task_79_updated"] is True
    assert len(report["tasks_inserted"]) == 4

    # 1. Vérification tâche #79
    t79 = db_session.query(Task).filter(Task.id == 79).first()
    assert t79.description == TASK_79_NEW_DESCRIPTION
    cl = json.loads(t79.checklist)
    assert len(cl) == len(TASK_79_NEW_CHECKLIST)
    assert "remplir immédiatement la fosse" in cl[4]["text"].lower()

    # 2. Vérification des 4 nouvelles tâches
    tasks = db_session.query(Task).filter(Task.id != 79).all()
    assert len(tasks) == 4

    task_map = {t.title: t for t in tasks}

    # Tâche 1 : Lampe
    t_lampe = task_map["Réparer ou remplacer la lampe cassée signalée à la maison"]
    assert t_lampe.category == "Presbytère"
    assert t_lampe.charge_points == 1
    assert t_lampe.complexity == "Facile"
    assert t_lampe.created_by == "Henri Jamet"
    assert t_lampe.status == "PROPOSED"

    # Tâche 2 : Douche
    t_douche = task_map["Réparer l'équipement de douche défectueux (flexible, pommeau ou mitigeur)"]
    assert t_douche.category == "Presbytère"
    assert t_douche.charge_points == 2
    assert t_douche.complexity == "Modéré"
    assert t_douche.created_by == "Henri Jamet"

    # Tâche 3 : Porte-fenêtre
    t_porte = task_map["Réparer et régler la porte-fenêtre abîmée avant l'hiver"]
    assert t_porte.category == "Presbytère"
    assert t_porte.charge_points == 2
    assert t_porte.priority == "Haute"
    assert t_porte.created_by == "Henri Jamet"

    # Tâche 4 : Ménage
    t_menage = task_map["Organiser le ménage saisonnier de printemps et fin d'été (grands textiles et liste de Maman)"]
    assert t_menage.category == "Presbytère"
    assert t_menage.charge_points == 3
    assert t_menage.created_by == "Henri Jamet"


def test_sync_tasks_idempotence(db_session):
    """Un second appel en mode apply ne doit pas réinsérer de doublons."""
    # Premier passage
    sync_tasks(db_session, dry_run=False)

    # Deuxième passage
    second_report = sync_tasks(db_session, dry_run=False)
    assert len(second_report["tasks_inserted"]) == 0
    assert len(second_report["tasks_already_present"]) == 4

    # Nombre total de tâches = 4
    assert db_session.query(Task).count() == 4
