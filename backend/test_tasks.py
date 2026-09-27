import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime

from app.main import app
from app.models import Member, Task, TaskComment, AdminDocument
from app.security import create_access_token, hash_password

client = TestClient(app)


@pytest.fixture
def auth_headers(db_session: Session):
    # Retrieve coordinator (Henri) and non-coordinator (Hortense)
    henri = db_session.query(Member).filter(Member.prenom == "Henri").first()
    if not henri:
        henri = Member(
            prenom="Henri",
            name="Henri Jamet",
            email="henri@example.com",
            password=hash_password("pass123"),
            is_coordinator=True,
            role="Coordinateur"
        )
        db_session.add(henri)
        db_session.commit()
        db_session.refresh(henri)
    else:
        henri.is_coordinator = True
        db_session.commit()

    josephine = db_session.query(Member).filter(Member.prenom == "Joséphine").first()
    if not josephine:
        josephine = Member(
            prenom="Joséphine",
            name="Joséphine Jamet",
            email="josephine@example.com",
            password=hash_password("pass123"),
            is_coordinator=True,
            role="Coordinatrice Adjointe"
        )
        db_session.add(josephine)
        db_session.commit()
        db_session.refresh(josephine)
    else:
        josephine.is_coordinator = True
        db_session.commit()

    hortense = db_session.query(Member).filter(Member.prenom == "Hortense").first()
    if not hortense:
        hortense = Member(
            prenom="Hortense",
            name="Hortense Jamet",
            email="hortense@example.com",
            password=hash_password("pass123"),
            is_coordinator=False,
            role="Membre Associé"
        )
        db_session.add(hortense)
        db_session.commit()
        db_session.refresh(hortense)
    else:
        hortense.is_coordinator = False
        db_session.commit()

    henri_token = create_access_token(data={"sub": henri.prenom, "user_id": henri.id})
    josephine_token = create_access_token(data={"sub": josephine.prenom, "user_id": josephine.id})
    hortense_token = create_access_token(data={"sub": hortense.prenom, "user_id": hortense.id})

    return {
        "henri": {"Authorization": f"Bearer {henri_token}"},
        "josephine": {"Authorization": f"Bearer {josephine_token}"},
        "hortense": {"Authorization": f"Bearer {hortense_token}"},
        "henri_user": henri,
        "josephine_user": josephine,
        "hortense_user": hortense,
    }


@pytest.fixture
def db_session():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        # Nettoyage ciblé des tâches de test
        tasks = db.query(Task).filter(Task.title.like("TEST_%")).all()
        for t in tasks:
            db.query(TaskComment).filter(TaskComment.task_id == t.id).delete(synchronize_session=False)
            db.delete(t)
        # Nettoyage des documents de test
        admin_docs = db.query(AdminDocument).filter(AdminDocument.title.like("TEST_%")).all()
        for d in admin_docs:
            db.delete(d)
        db.commit()
        db.close()


def test_member_creates_task_defaults_to_proposed(auth_headers):
    # Hortense (membre simple) propose une tâche sans spécifier de statut
    payload1 = {
        "title": "TEST_Proposition Peinture Cuisine",
        "description": "Repeindre le mur nord",
        "subject": "Presbytère",
        "category": "Travaux"
    }
    res1 = client.post("/api/tasks", json=payload1, headers=auth_headers["hortense"])
    assert res1.status_code == 201
    task1 = res1.json()
    assert task1["status"] == "PROPOSED"
    assert task1["budget"] == 0.0 or task1["budget"] is None

    # Hortense tente de forcer le statut actif "EN_COURS" lors de sa proposition
    payload2 = {
        "title": "TEST_Tentative Forcage Actif",
        "description": "Je veux que ma tâche soit directement active",
        "subject": "Rosing",
        "status": "EN_COURS"
    }
    res2 = client.post("/api/tasks", json=payload2, headers=auth_headers["hortense"])
    assert res2.status_code == 201
    task2 = res2.json()
    # Règle d'or Henri : la tâche ne doit pas être directement active, elle reste PROPOSED
    assert task2["status"] == "PROPOSED"


def test_coordinator_creates_task_lifecycle(auth_headers):
    # Henri (coordinateur) crée une tâche sans statut -> PROPOSED par défaut
    res1 = client.post("/api/tasks", json={
        "title": "TEST_Coord Sans Statut",
        "description": "Tâche de coordination"
    }, headers=auth_headers["henri"])
    assert res1.status_code == 201
    assert res1.json()["status"] == "PROPOSED"

    # Henri spécifie explicitement un statut actif ("EN_COURS")
    res2 = client.post("/api/tasks", json={
        "title": "TEST_Coord Statut Actif",
        "description": "Tâche urgente lancée immédiatement",
        "status": "EN_COURS"
    }, headers=auth_headers["henri"])
    assert res2.status_code == 201
    assert res2.json()["status"] == "EN_COURS"


def test_accept_task_proposal_by_coordinator(auth_headers):
    # 1. Création d'une proposition par Hortense
    res_create = client.post("/api/tasks", json={
        "title": "TEST_Remplacement Filtre Piscine",
        "description": "Nouveau filtre à sable nécessaire"
    }, headers=auth_headers["hortense"])
    assert res_create.status_code == 201
    task_id = res_create.json()["id"]
    assert res_create.json()["status"] == "PROPOSED"

    # 2. Hortense (non-coordinatrice) tente d'accepter sa propre tâche -> 403
    res_hortense = client.post(f"/api/tasks/{task_id}/accept", headers=auth_headers["hortense"])
    assert res_hortense.status_code == 403
    assert "Action réservée aux coordinateurs" in res_hortense.json()["detail"]

    # 3. Henri (coordinateur) accepte la tâche sans payload -> bascule à TODO
    res_accept = client.post(f"/api/tasks/{task_id}/accept", headers=auth_headers["henri"])
    assert res_accept.status_code == 200
    assert res_accept.json()["status"] == "TODO"

    # 4. Joséphine (coordinatrice) peut aussi l'accepter avec un statut cible personnalisé
    res_accept_custom = client.post(f"/api/tasks/{task_id}/accept", json={"status": "EN_COURS"}, headers=auth_headers["josephine"])
    assert res_accept_custom.status_code == 200
    assert res_accept_custom.json()["status"] == "EN_COURS"


def test_reject_task_proposal_by_coordinator(auth_headers):
    # 1. Création proposition
    res_create = client.post("/api/tasks", json={
        "title": "TEST_Achat Jacuzzi Extérieur",
        "description": "Installation sur la terrasse"
    }, headers=auth_headers["hortense"])
    task_id = res_create.json()["id"]

    # 2. Refus par non-coordinateur -> 403
    res_forbidden = client.post(f"/api/tasks/{task_id}/reject", json={"reason": "Non"}, headers=auth_headers["hortense"])
    assert res_forbidden.status_code == 403

    # 3. Refus par Henri avec motif -> statut REJECTED et commentaire
    refusal_reason = "Hors budget prévisionnel de l'année 2026."
    res_reject = client.post(
        f"/api/tasks/{task_id}/reject",
        json={"reason": refusal_reason},
        headers=auth_headers["henri"]
    )
    assert res_reject.status_code == 200
    data = res_reject.json()
    assert data["status"] == "REJECTED"
    assert any(refusal_reason in c["content"] for c in data.get("comments", []))

    # 4. Option suppression définitive
    res_create_del = client.post("/api/tasks", json={
        "title": "TEST_Doublon Erreur",
        "description": "À supprimer"
    }, headers=auth_headers["hortense"])
    del_task_id = res_create_del.json()["id"]

    res_delete_reject = client.post(
        f"/api/tasks/{del_task_id}/reject",
        json={"action": "delete"},
        headers=auth_headers["henri"]
    )
    assert res_delete_reject.status_code == 200
    assert res_delete_reject.json().get("deleted") is True

    # Vérification que la tâche n'existe plus
    get_res = client.get(f"/api/tasks/{del_task_id}")
    assert get_res.status_code == 404


def test_update_task_authorization_and_attachments(auth_headers, db_session):
    # Création d'un document administratif en base
    doc = AdminDocument(
        title="TEST_Devis Toiture",
        category="Factures",
        file_url="/uploads/test_devis_toiture.pdf",
        file_name="devis_toiture.pdf",
        file_size=204800
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    # 1. Hortense crée une proposition
    res_task = client.post("/api/tasks", json={
        "title": "TEST_Rénovation Toiture Rosings",
        "description": "Remplacement ardoises"
    }, headers=auth_headers["hortense"])
    task_id = res_task.json()["id"]

    # 2. Hortense (créatrice) peut modifier sa propre tâche, y ajouter checklist et document_ids
    put_payload = {
        "title": "TEST_Rénovation Toiture Rosings - Mise à jour",
        "checklist": [{"text": "Demander devis 2", "completed": False}],
        "document_ids": [doc.id]
    }
    res_update_creator = client.put(f"/api/tasks/{task_id}", json=put_payload, headers=auth_headers["hortense"])
    assert res_update_creator.status_code == 200
    updated_data = res_update_creator.json()
    assert updated_data["title"] == "TEST_Rénovation Toiture Rosings - Mise à jour"
    assert len(updated_data["checklist"]) == 1
    assert any(d.get("url") == "/uploads/test_devis_toiture.pdf" for d in updated_data["documents"])

    # 3. Hortense tente de forcer le passage à "EN_COURS" via PUT sur sa proposition -> 403
    res_force = client.put(f"/api/tasks/{task_id}", json={"status": "EN_COURS"}, headers=auth_headers["hortense"])
    assert res_force.status_code == 403
    assert "Action réservée aux coordinateurs" in res_force.json()["detail"]

    # 4. Henri (coordinateur) peut modifier et valider
    res_coord_update = client.put(
        f"/api/tasks/{task_id}",
        json={"priority": "Haute", "attachments": [{"name": "Plan", "url": "/uploads/plan.pdf", "type": "PDF"}]},
        headers=auth_headers["henri"]
    )
    assert res_coord_update.status_code == 200
    assert res_coord_update.json()["priority"] == "Haute"
    assert any(d.get("url") == "/uploads/plan.pdf" for d in res_coord_update.json()["documents"])
