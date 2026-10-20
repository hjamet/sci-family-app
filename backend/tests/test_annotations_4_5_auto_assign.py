import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models import Task, Member, Reservation
from app.security import create_access_token
from app.services.workload_balancer import get_task_recommendations, resolve_auto_assignment_by_workload

client = TestClient(app)

@pytest.fixture
def coordinator_headers():
    token = create_access_token({"sub": "henri", "prenom": "Henri", "is_coordinator": True})
    return {"Authorization": f"Bearer {token}"}

def test_annotation_5_recommendations_endpoint():
    """
    Annotation 5 :
    Vérifie l'endpoint /api/tasks/recommendations qui retourne le Top 3
    des membres selon le sujet/domaine et les scores de charge actuels.
    """
    res = client.get("/api/tasks/recommendations?subject=Rosings")
    assert res.status_code == 200
    data = res.json()
    assert data["subject"] == "Rosings"
    recs = data["recommendations"]
    assert isinstance(recs, list)
    # Frédéric Jamet est exempté d'attribution automatique
    names = [r["name"] for r in recs]
    assert "Frédéric Jamet" not in names
    assert len(recs) <= 6
    assert len(recs) >= 3
    
    # Vérification des rangs et attributs
    assert recs[0]["rank"] == 1
    assert recs[1]["rank"] == 2
    assert recs[2]["rank"] == 3
    assert "charge" in recs[0]["reason"].lower() or "tâche" in recs[0]["reason"].lower() or "rosings" in recs[0]["reason"].lower()

    # Vérification avec paramètre limit=3 (Top 3 explicite)
    res3 = client.get("/api/tasks/recommendations?subject=Rosings&limit=3")
    assert res3.status_code == 200
    assert len(res3.json()["recommendations"]) == 3

def test_annotation_4_accept_task_auto_assignment_unblocked(coordinator_headers):
    """
    Annotation 4 :
    Vérifie qu'une tâche configurée en attribution automatique (auto_assign_by_workload=True)
    peut être acceptée par le coordinateur SANS être bloquée par l'erreur "aucun membre n'est assigné",
    et qu'elle bascule en 'EN_COURS' avec un membre assigné automatiquement.
    """
    # 1. Créer une tâche en mode auto-attribution
    create_res = client.post("/api/tasks", json={
        "title": "Tâche Test Déblocage Auto Attribution",
        "description": "Vérification du déblocage de l'acceptation sans assigné préalable",
        "subject": "Rosings",
        "auto_assign_by_workload": True,
        "assigned_members": [],
        "status": "PROPOSED",
        "created_by": "Marguerite Jamet"
    }, headers=coordinator_headers)
    assert create_res.status_code == 201
    task = create_res.json()
    task_id = task["id"]

    try:
        # 2. Forcer explicitement assigned_members à None/vide en base pour simuler le cas exact rapporté par Henri
        db = next(get_db())
        db_task = db.query(Task).filter(Task.id == task_id).first()
        db_task.assigned_members = "[]"
        db_task.assignee_id = None
        db_task.auto_assign_by_workload = True
        db.commit()

        # 3. Acceptation de la tâche par le coordinateur
        accept_res = client.post(f"/api/tasks/{task_id}/accept", json={}, headers=coordinator_headers)
        assert accept_res.status_code == 200, f"Erreur acceptation : {accept_res.text}"
        
        accepted = accept_res.json()
        assert accepted["status"] == "EN_COURS"
        assert accepted["assigned_members"] is not None
        assert len(accepted["assigned_members"]) > 0
        assert accepted["auto_assign_by_workload"] is True
    finally:
        client.delete(f"/api/tasks/{task_id}", headers=coordinator_headers)
