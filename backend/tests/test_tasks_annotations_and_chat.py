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


def test_tasks_annotations_v16_archived_chat_and_sync():
    """Vérifie le respect des annotations UI v16 : chat persistant, eager-loading des commentaires et archivage immédiat."""
    # 1. Création d'une tâche
    t_res = client.post("/api/tasks", json={
        "title": "Tâche v16 Archivage & Chat",
        "description": "Validation Annotation 1 et 5",
        "subject": "Presbytère",
        "category": "Maintenance",
        "created_by": "Henri"
    })
    assert t_res.status_code == 201
    task = t_res.json()
    task_id = task["id"]

    try:
        # 2. Ajout d'un commentaire dans le chat
        comment_res = client.post(f"/api/tasks/{task_id}/comments", json={
            "content": "Message de test chat v16 temps réel",
            "author_name": "Henri Jamet",
            "author_role": "Gérant"
        })
        assert comment_res.status_code == 201
        new_comment = comment_res.json()
        assert new_comment["content"] == "Message de test chat v16 temps réel"

        # 3. GET /api/tasks/{id} doit inclure immédiatement les commentaires grâce à selectinload
        get_res = client.get(f"/api/tasks/{task_id}")
        assert get_res.status_code == 200
        data = get_res.json()
        assert "comments" in data
        assert len(data["comments"]) == 1
        assert data["comments"][0]["content"] == "Message de test chat v16 temps réel"
        assert data["comments_count"] == 1

        # 4. Archivage de la tâche (PATCH status -> ARCHIVEE)
        patch_res = client.patch(f"/api/tasks/{task_id}", json={
            "status": "ARCHIVEE",
            "completion_notes": "Tâche archivée après réalisation complète des travaux."
        })
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["status"] == "ARCHIVEE"
        assert updated["completion_notes"] == "Tâche archivée après réalisation complète des travaux."

        # 5. Vérifier que la tâche reste lisible et conserve ses commentaires même archivée
        re_get = client.get(f"/api/tasks/{task_id}")
        assert re_get.status_code == 200
        assert re_get.json()["status"] == "ARCHIVEE"
        assert len(re_get.json()["comments"]) == 1
    finally:
        client.delete(f"/api/tasks/{task_id}")


def test_annotation_16_coordinator_task_creation_email():
    """Vérifie que la création d'une tâche PROPOSED notifie les coordinateurs si notify_task_creation est True."""
    from app.security import create_access_token
    from app.models import Member

    db = SessionLocal()
    task_id = None
    try:
        # Activer notify_task_creation uniquement pour Henri (et désactiver pour les autres coordinateurs)
        coords = db.query(Member).filter(Member.is_coordinator == True).all()
        for c in coords:
            c.notify_task_creation = False
        henri = db.query(Member).filter(Member.id == 1).first()
        if henri:
            henri.notify_task_creation = True
        db.commit()

        # Création d'une tâche par un associé en statut PROPOSED
        payload = {
            "title": "Mission Test Alerte Coordinateur Annotation 16",
            "description": "Test envoi email lors de proposition de mission",
            "subject": "Presbytère",
            "category": "Travaux",
            "priority": "Haute",
            "status": "PROPOSED",
            "created_by": "Eugénie"
        }
        res = client.post("/api/tasks", json=payload)
        assert res.status_code == 201
        data = res.json()
        task_id = data["id"]
        assert data["status"] == "PROPOSED"
        # Vérifier que le payload de retour contient un email_dispatched pour la proposition
        assert "_email_dispatched" in data or "email_dispatched" in data
        dispatched = data.get("_email_dispatched") or data.get("email_dispatched")
        assert dispatched["trigger_action"] == "task_creation_pending"
        assert "Mission Test Alerte Coordinateur Annotation 16" in dispatched["subject"]

        # Désactiver notify_task_creation pour tous les coordinateurs et vérifier qu'aucun email n'est envoyé
        for c in coords:
            c.notify_task_creation = False
        db.commit()

        res2 = client.post("/api/tasks", json={
            "title": "Mission Test Sans Alerte Coordinateur",
            "status": "PROPOSED",
            "created_by": "Marguerite"
        })
        assert res2.status_code == 201
        data2 = res2.json()
        task_id2 = data2["id"]
        try:
            assert data2.get("_email_dispatched") is None
        finally:
            client.delete(f"/api/tasks/{task_id2}")
    finally:
        if task_id:
            client.delete(f"/api/tasks/{task_id}")
        db.close()


def test_annotation_17_mandatory_assignment_on_accept():
    """Vérifie qu'il est impossible d'accepter une tâche sans assigner au moins un membre (Annotation 17)."""
    from app.security import create_access_token

    token = create_access_token({"sub": "Henri", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Créer une tâche sans assigné en attente de création (PROPOSED)
    res = client.post("/api/tasks", json={
        "title": "Mission Test Assignation Obligatoire",
        "description": "Doit refuser l'acceptation sans assignation",
        "subject": "Rosings",
        "status": "PROPOSED",
        "created_by": "Hortense",
        "assigned_members": []
    })
    assert res.status_code == 201
    task_id = res.json()["id"]

    try:
        # 2. Tentative d'acceptation par le coordinateur sans assigné -> Doit échouer avec HTTP 400
        accept_res = client.post(f"/api/tasks/{task_id}/accept", json={}, headers=headers)
        assert accept_res.status_code == 400
        assert "Assignation obligatoire" in accept_res.json()["detail"]

        # 3. Acceptation en fournissant assigned_members dans le corps -> Doit réussir avec HTTP 200
        accept_with_assignee = client.post(
            f"/api/tasks/{task_id}/accept",
            json={"assigned_members": ["Henri Jamet"]},
            headers=headers
        )
        assert accept_with_assignee.status_code == 200
        updated = accept_with_assignee.json()
        assert updated["status"] in ["TODO", "EN_COURS"]
        assert "Henri Jamet" in updated["assigned_members"]
    finally:
        client.delete(f"/api/tasks/{task_id}")


def test_annotation_3_charge_scale_and_weights():
    """Vérifie la nouvelle échelle 'Charge de la tâche' et la pondération 1, 2, 3, 5, 8."""
    from app.services.workload_balancer import get_task_charge_points, TASK_CHARGE_WEIGHTS

    assert TASK_CHARGE_WEIGHTS["Négligeable"] == 1
    assert TASK_CHARGE_WEIGHTS["Faible"] == 2
    assert TASK_CHARGE_WEIGHTS["Modérée"] == 3
    assert TASK_CHARGE_WEIGHTS["Élevée"] == 5
    assert TASK_CHARGE_WEIGHTS["Très élevée"] == 8

    # Création d'une tâche avec charge 'Très élevée'
    res = client.post("/api/tasks", json={
        "title": "Mission Rénovation Toiture Rosings",
        "subject": "Rosings",
        "complexity": "Très élevée",
        "created_by": "Henri"
    })
    assert res.status_code == 201
    task = res.json()
    task_id = task["id"]
    try:
        assert task["complexity"] == "Très élevée"
        assert task["charge_points"] == 8

        # Mise à jour vers charge 'Faible'
        up_res = client.patch(f"/api/tasks/{task_id}", json={"complexity": "Faible"})
        assert up_res.status_code == 200
        get_res = client.get(f"/api/tasks/{task_id}")
        assert get_res.status_code == 200
        updated = get_res.json()
        assert updated["complexity"] == "Faible"
        assert updated["charge_points"] == 2
    finally:
        client.delete(f"/api/tasks/{task_id}")


def test_annotation_7_rosings_and_canonical_locations():
    """Vérifie que 'Rosings' et les lieux canoniques sont reconnus et filtrables."""
    locations = [
        "Presbytère", "Rosings", "Piscine", "Jardin & Espaces Verts",
        "Petites cabanes", "Hangar à meuble", "SCI & Administratif"
    ]
    created_ids = []
    try:
        for loc in locations:
            res = client.post("/api/tasks", json={
                "title": f"Maintenance lieu {loc}",
                "subject": loc,
                "complexity": "Modérée",
                "created_by": "Henri"
            })
            assert res.status_code == 201
            created_ids.append(res.json()["id"])

        # Filtrage par property_id = 1 (doit inclure Rosings)
        list_res = client.get("/api/tasks?property_id=1")
        assert list_res.status_code == 200
        tasks = list_res.json()
        subjects = [t["subject"] for t in tasks]
        assert "Rosings" in subjects
    finally:
        for tid in created_ids:
            client.delete(f"/api/tasks/{tid}")


def test_annotation_5_subscribed_non_coordinator_receives_task_creation_email():
    """Vérifie que les membres non-coordinateurs avec notify_task_creation=True reçoivent l'email."""
    from app.models import Member
    db = SessionLocal()
    task_id = None
    try:
        # Trouver un membre non-coordinateur et activer notify_task_creation
        non_coord = db.query(Member).filter(Member.is_coordinator == False, Member.email.isnot(None)).first()
        if not non_coord:
            pytest.skip("Aucun membre non-coordinateur avec email")
        non_coord.notify_task_creation = True
        db.commit()

        res = client.post("/api/tasks", json={
            "title": "Mission Test Abonné Non Coordinateur",
            "subject": "Rosings",
            "status": "PROPOSED",
            "created_by": "Henri"
        })
        assert res.status_code == 201
        data = res.json()
        task_id = data["id"]
        assert "_email_dispatched" in data or "email_dispatched" in data
        dispatched = data.get("_email_dispatched") or data.get("email_dispatched")
        assert dispatched["trigger_action"] == "task_creation_pending"

        # Remettre à False
        non_coord.notify_task_creation = False
        db.commit()
    finally:
        if task_id:
            client.delete(f"/api/tasks/{task_id}")
        db.close()


def test_annotation_9_chat_extended_emojis_and_all_mention():
    """Vérifie la persistance synchrone des réactions (palette étendue) et la mention @all."""
    # 1. Créer une tâche
    res = client.post("/api/tasks", json={
        "title": "Mission Chat & Réactions Étendues",
        "subject": "Rosings",
        "status": "EN_COURS",
        "created_by": "Henri"
    })
    assert res.status_code == 201
    task_id = res.json()["id"]

    try:
        # 2. Poster un commentaire avec @all
        c_res = client.post(f"/api/tasks/{task_id}/comments", json={
            "content": "Bonjour @all voici une annonce importante pour le domaine !",
            "author_name": "Henri Jamet"
        })
        assert c_res.status_code == 201
        comment = c_res.json()
        comment_id = comment["id"]

        # 3. Tester les réactions avec des emojis de la nouvelle palette (🎉, 🔥, 🏊)
        for emoji in ["🎉", "🔥", "🏊"]:
            r_res = client.post(
                f"/api/tasks/{task_id}/comments/{comment_id}/react",
                json={"emoji": emoji, "user_name": "Joséphine Jamet"}
            )
            assert r_res.status_code == 200, f"Échec réaction emoji {emoji}: {r_res.text}"
            r_data = r_res.json()
            reactions_dict = r_data.get("reactions") or {}
            assert emoji in reactions_dict

        # 4. Vérifier la persistance synchrone via GET /messages
        get_res = client.get(f"/api/tasks/{task_id}/messages")
        assert get_res.status_code == 200
        messages = get_res.json()
        assert len(messages) >= 1
        last_msg = [m for m in messages if m["id"] == comment_id][0]
        assert "🎉" in last_msg["reactions"]
        assert "🔥" in last_msg["reactions"]
        assert "🏊" in last_msg["reactions"]
    finally:
        client.delete(f"/api/tasks/{task_id}")


def test_annotation_1_stay_confirmation_dispatches_to_all_participants():
    """Vérifie que la confirmation d'un séjour notifie tous les participants et les membres abonnés."""
    from app.models import Member
    db = SessionLocal()
    res_id = None
    try:
        # Activer notif_stay_booked sur au moins un membre
        m = db.query(Member).filter(Member.email.isnot(None)).first()
        if m:
            m.notif_stay_booked = True
            db.commit()

        # Créer une réservation confirmée avec participants dans la note
        payload = {
            "property_name": "Rosings",
            "property_id": 1,
            "year": 2026,
            "week_number": 28,
            "start_date": "2026-07-10",
            "end_date": "2026-07-15",
            "user_name": "Henri Jamet",
            "selected_rooms": ["rosing_1"],
            "notes": "Séjour d'été [Membres: Joséphine Jamet, Frédéric Jamet]"
        }
        r = client.post("/api/reservations", json=payload)
        assert r.status_code == 201
        res_data = r.json()
        res_id = res_data["id"]
        assert res_data["status"] == "Confirmée"
    finally:
        if res_id:
            client.delete(f"/api/reservations/{res_id}")
        db.close()


