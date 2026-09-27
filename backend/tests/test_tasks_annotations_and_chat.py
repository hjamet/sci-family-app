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

def test_task_document_upload_and_admin_indexing():
    # 1. Créer une tâche cible
    t_res = client.post("/api/tasks", json={
        "title": "Tâche Test Upload & Admin",
        "description": "Validation intégration universelle documents",
        "subject": "Presbytère",
        "category": "Travaux & Chantiers",
        "created_by": "Henri"
    })
    assert t_res.status_code == 201
    task = t_res.json()
    task_id = task["id"]

    try:
        # 2. Téléversement canonique via /api/documents/upload avec task_id
        fake_pdf = b"%PDF-1.4 Fake PDF Content for Task Upload Test"
        upload_data = {
            "organisme": "Declercq",
            "title": "Devis Toiture Presbytere",
            "category": "Travaux & Chantiers",
            "task_id": str(task_id),
            "uploaded_by": "Henri Jamet"
        }
        files = {
            "file": ("devis_toiture.pdf", fake_pdf, "application/pdf")
        }
        up_res = client.post("/api/documents/upload", data=upload_data, files=files)
        assert up_res.status_code == 201, f"Erreur upload document: {up_res.text}"
        doc = up_res.json()
        assert doc["title"] == "Devis Toiture Presbytere"
        assert doc["task_id"] == task_id
        assert "Declercq" in doc["file_name"]

        # 3. Vérifier que le document apparaît dans l'onglet administratif (GET /api/documents)
        admin_docs_res = client.get("/api/documents")
        assert admin_docs_res.status_code == 200
        all_docs = admin_docs_res.json()
        found_in_admin = any(d.get("id") == doc["id"] for d in all_docs)
        assert found_in_admin, "Le document téléversé depuis la tâche doit être présent dans /api/documents"

        # 4. Vérifier que le document apparaît dans GET /api/tasks/{task_id}/documents
        task_docs_res = client.get(f"/api/tasks/{task_id}/documents")
        assert task_docs_res.status_code == 200
        task_docs = task_docs_res.json()
        assert any(d.get("id") == doc["id"] for d in task_docs)

        # 5. Vérifier que le document est inclus dans GET /api/tasks/{task_id}
        get_task_res = client.get(f"/api/tasks/{task_id}")
        assert get_task_res.status_code == 200
        task_data = get_task_res.json()
        assert any(d.get("id") == doc["id"] or "devis_toiture" in str(d) for d in task_data["documents"])

        # 6. Tester aussi la résilience de POST /api/tasks/upload-documents
        fallback_file = {
            "files": ("photo_chantier.jpg", b"fake jpeg image content", "image/jpeg")
        }
        post_tasks_docs_res = client.post(
            "/api/tasks/upload-documents",
            data={"task_id": str(task_id)},
            files=fallback_file
        )
        assert post_tasks_docs_res.status_code == 200
        fb_res = post_tasks_docs_res.json()
        assert "document_urls" in fb_res
        assert len(fb_res["document_urls"]) > 0
    finally:
        # 7. Nettoyage impératif de la tâche de test
        client.delete(f"/api/tasks/{task_id}")
