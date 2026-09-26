import os
import sys
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.database import SessionLocal
from app.models import Task, TaskComment

client = TestClient(app)

def test_task_delete_with_comments_cascade():
    # 1. Créer une tâche
    create_payload = {
        "title": "Tâche Test Suppression & Chat",
        "description": "Description de test pour suppression et cascade",
        "subject": "SCI",
        "category": "Maintenance",
        "priority": "Normale",
        "status": "EN_COURS",
        "budget": 500.0,
        "assigned_members": ["Henri Jamet", "Joséphine Jamet"],
        "checklist": [{"text": "Point 1", "done": False}],
        "created_by": "Henri"
    }
    res = client.post("/api/tasks", json=create_payload)
    assert res.status_code == 201, f"Erreur création tâche: {res.text}"
    task = res.json()
    task_id = task["id"]

    # 2. Ajouter des commentaires via /comments et /messages (alias)
    c1_res = client.post(f"/api/tasks/{task_id}/comments", json={
        "content": "Premier commentaire test",
        "author_name": "Henri Jamet",
        "author_role": "Gérant"
    })
    assert c1_res.status_code == 201
    c1 = c1_res.json()
    assert c1["content"] == "Premier commentaire test"

    c2_res = client.post(f"/api/tasks/{task_id}/messages", json={
        "content": "Deuxième message via alias /messages",
        "author_name": "Joséphine Jamet",
        "author_role": "Gérante"
    })
    assert c2_res.status_code == 201
    c2 = c2_res.json()
    assert c2["content"] == "Deuxième message via alias /messages"

    # 3. Vérifier la récupération des messages via /messages
    get_msgs = client.get(f"/api/tasks/{task_id}/messages")
    assert get_msgs.status_code == 200
    msgs = get_msgs.json()
    assert len(msgs) == 2

    # 4. Supprimer la tâche via DELETE /api/tasks/{task_id}
    del_res = client.delete(f"/api/tasks/{task_id}")
    assert del_res.status_code == 204

    # 5. Vérifier que la tâche n'existe plus
    get_res = client.get(f"/api/tasks/{task_id}")
    assert get_res.status_code == 404

    # 6. Vérifier en base que les commentaires associés ont été supprimés en cascade
    db = SessionLocal()
    try:
        orphans = db.query(TaskComment).filter(TaskComment.task_id == task_id).all()
        assert len(orphans) == 0, "Les commentaires orphelins doivent être purgés en cascade"
    finally:
        db.close()
