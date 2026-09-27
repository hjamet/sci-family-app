import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime

from app.main import app, get_db
from app.models import Member, Task, TaskComment
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
        task_titles = [
            "Tâche Test Autorisation",
            "Nettoyage toiture Rosings",
            "Vérification niveau fioul et vanne",
            "Pose étagères buanderie"
        ]
        created_task_ids = [t.id for t in db.query(Task).filter(Task.title.in_(task_titles)).all()]
        if created_task_ids:
            db.query(TaskComment).filter(TaskComment.task_id.in_(created_task_ids)).delete(synchronize_session=False)
            db.query(Task).filter(Task.id.in_(created_task_ids)).delete(synchronize_session=False)
            db.commit()
        db.close()


def test_members_expose_is_coordinator(auth_headers):
    # Test GET /api/members
    res = client.get("/api/members", headers=auth_headers["henri"])
    assert res.status_code == 200
    members = res.json()
    assert len(members) >= 2
    
    henri_member = next((m for m in members if m["prenom"] == "Henri"), None)
    assert henri_member is not None
    assert henri_member["is_coordinator"] is True

    josephine_member = next((m for m in members if "Jos" in m["prenom"]), None)
    assert josephine_member is not None
    assert josephine_member["is_coordinator"] is True

    hortense_member = next((m for m in members if m["prenom"] == "Hortense"), None)
    assert hortense_member is not None
    assert hortense_member["is_coordinator"] is False

    # Test GET /api/auth/me for coordinator
    me_res = client.get("/api/auth/me", headers=auth_headers["henri"])
    assert me_res.status_code == 200
    assert me_res.json()["is_coordinator"] is True

    # Test GET /api/auth/me for non-coordinator
    me_res2 = client.get("/api/auth/me", headers=auth_headers["hortense"])
    assert me_res2.status_code == 200
    assert me_res2.json()["is_coordinator"] is False


def test_coordinator_authorization_forbidden_for_non_coordinator(auth_headers, db_session):
    # Create test task
    task = Task(
        title="Tâche Test Autorisation",
        description="Vérification 403",
        subject="SCI",
        status="PENDING_VALIDATION",
        created_by="Hortense",
        is_recurring=False
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Hortense (non-coordinatrice) tente de valider
    res_val = client.post(f"/api/tasks/{task.id}/validate", headers=auth_headers["hortense"])
    assert res_val.status_code == 403
    assert "Action réservée aux coordinateurs" in res_val.json()["detail"]

    # Hortense tente d'invalider
    res_inval = client.post(f"/api/tasks/{task.id}/invalidate", headers=auth_headers["hortense"])
    assert res_inval.status_code == 403
    assert "Action réservée aux coordinateurs" in res_inval.json()["detail"]


def test_validate_one_time_task_by_coordinator(auth_headers, db_session):
    # Tâche ponctuelle soumise en attente de validation
    task = Task(
        title="Nettoyage toiture Rosings",
        description="Nettoyer les mousses",
        subject="Rosing",
        status="PENDING_VALIDATION",
        created_by="Hortense",
        is_recurring=False
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Henri valide la tâche ponctuelle
    res = client.post(f"/api/tasks/{task.id}/validate", headers=auth_headers["henri"])
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "TERMINEE"

    # Vérification en base
    db_session.refresh(task)
    assert task.status == "TERMINEE"


def test_validate_recurring_task_by_coordinator(auth_headers, db_session):
    # Tâche récurrente soumise en attente de validation
    task = Task(
        title="Vérification niveau fioul et vanne",
        description="Contrôle mensuel de la cuve",
        subject="Presbytère",
        status="PENDING_VALIDATION",
        created_by="Henri",
        is_recurring=True,
        last_completed_at=None
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Joséphine (coordinatrice adjointe) valide la tâche récurrente
    res = client.post(f"/api/tasks/{task.id}/validate", headers=auth_headers["josephine"])
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "A_FAIRE"
    assert data["last_completed_at"] is not None

    # Vérification en base
    db_session.refresh(task)
    assert task.status == "A_FAIRE"
    assert task.last_completed_at is not None


def test_invalidate_task_by_coordinator_with_explanation(auth_headers, db_session):
    task = Task(
        title="Pose étagères buanderie",
        description="Fixer 2 crémaillères",
        subject="Presbytère",
        status="PENDING_VALIDATION",
        created_by="Marguerite",
        is_recurring=False
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Henri invalide la tâche avec un message explicatif pour la famille
    explanation_text = "Merci de fournir une photo de la fixation murale et le ticket de caisse des chevilles."
    res = client.post(
        f"/api/tasks/{task.id}/invalidate",
        json={"explanation": explanation_text},
        headers=auth_headers["henri"]
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "A_FAIRE"

    # Vérification du commentaire ajouté dans le FamilyChat
    comments = data.get("comments", [])
    assert any(explanation_text in c["content"] for c in comments)
