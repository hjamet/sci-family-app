import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Task, Member, Project, ProjectVote, MemberExpense
from app.security import create_access_token

client = TestClient(app)


@pytest.fixture
def coordinator_headers():
    token = create_access_token({"sub": "henri", "prenom": "Henri", "is_coordinator": True})
    return {"Authorization": f"Bearer {token}"}


def test_livrable_1_task_assignment_synchronization(coordinator_headers):
    """
    Livrable 1 :
    Vérifie que PUT /api/tasks/{task_id} synchronise correctement :
    1. assigned_members -> assignee_id et assignee
    2. Vidage de l'attribution (assigned_members: [], auto_assign_by_workload: False) -> assignee_id = None
    3. auto_assign_by_workload: True -> résolution automatique via resolve_auto_assignment_by_workload
    """
    # 1. Création d'une tâche test
    create_res = client.post("/api/tasks", json={
        "title": "Tâche Test Cohérence Modaux",
        "description": "Vérification synchronisation assignee_id et auto_assign_by_workload",
        "subject": "Rosings",
        "priority": "Normale",
        "status": "A_FAIRE",
        "created_by": "Henri Jamet"
    }, headers=coordinator_headers)
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]

    try:
        with SessionLocal() as db:
            henri = db.query(Member).filter(Member.prenom == "Henri").first()
            assert henri is not None, "Membre Henri introuvable"
            henri_id = henri.id
            henri_name = henri.name

        # 2. Assigner manuellement Henri Jamet via assigned_members
        put_res1 = client.put(f"/api/tasks/{task_id}", json={
            "assigned_members": [henri_name],
            "priority": "Haute",
            "deadline": "2026-09-30"
        }, headers=coordinator_headers)
        assert put_res1.status_code == 200
        t1 = put_res1.json()
        assert t1["assigned_members"] == [henri_name]
        assert t1["assignee_id"] == henri_id
        assert t1["priority"] == "Haute"
        assert t1["deadline"] == "2026-09-30"

        # 3. Vider l'assignation manuellement avec auto_assign désactivé
        put_res2 = client.put(f"/api/tasks/{task_id}", json={
            "assigned_members": [],
            "auto_assign_by_workload": False
        }, headers=coordinator_headers)
        assert put_res2.status_code == 200
        t2 = put_res2.json()
        assert t2["assigned_members"] == []
        assert t2["assignee_id"] is None
        assert t2["auto_assign_by_workload"] is False

        # 4. Activer l'auto-attribution équitable
        put_res3 = client.put(f"/api/tasks/{task_id}", json={
            "auto_assign_by_workload": True,
            "assigned_members": []
        }, headers=coordinator_headers)
        assert put_res3.status_code == 200
        t3 = put_res3.json()
        assert t3["auto_assign_by_workload"] is True
        assert len(t3["assigned_members"]) == 1
        assert t3["assignee_id"] is not None
        # Frédéric Jamet ne doit pas être sélectionné
        assert "Frédéric Jamet" not in t3["assigned_members"]

    finally:
        client.delete(f"/api/tasks/{task_id}", headers=coordinator_headers)


def test_livrable_2_project_vote_preservation_and_cost():
    """
    Livrable 2 :
    Vérifie que PUT /api/projects/{id} :
    1. Conserve les votes lors de modifications du titre, de la description ou du coût estimé
    2. Met bien à jour estimated_cost et priority
    3. Ne réinitialise les votes QUE si les options changent ou si reset_votes=True
    """
    with SessionLocal() as db:
        proj = Project(
            property_id=1,
            title="Projet Test Préservation Votes",
            description="Description initiale du projet",
            estimated_cost=500.0,
            category="Travaux",
            priority="MOYENNE",
            submitted_by="Henri",
            status="OPEN",
            options='["OUI", "NON"]'
        )
        db.add(proj)
        db.commit()
        db.refresh(proj)
        proj_id = proj.id

    try:
        # 1. Deux votes enregistrés
        v1 = client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Henri Jamet", "vote": "OUI"})
        assert v1.status_code == 200
        v2 = client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Marguerite Jamet", "vote": "NON"})
        assert v2.status_code == 200

        with SessionLocal() as db:
            assert db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).count() == 2

        # 2. Modifier le titre, la description, estimated_cost et priority SANS toucher aux options
        update_res = client.put(f"/api/projects/{proj_id}", json={
            "title": "Projet Test Préservation Votes (Titre Mis à Jour)",
            "description": "Description enrichie avec détails techniques",
            "estimated_cost": 1850.50,
            "priority": "HAUTE"
        })
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["title"] == "Projet Test Préservation Votes (Titre Mis à Jour)"
        assert updated["estimated_cost"] == 1850.50
        assert updated["priority"] == "HAUTE"

        # VÉRIFICATION DÉCISIVE : Les votes n'ont PAS été supprimés !
        with SessionLocal() as db:
            votes_after_title_edit = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).count()
            assert votes_after_title_edit == 2, f"Les votes ont été supprimés à tort ({votes_after_title_edit} != 2) !"

        # 3. Modifier les options de vote -> doit réinitialiser les votes
        opt_res = client.put(f"/api/projects/{proj_id}", json={
            "options": ["POUR", "CONTRE", "BLANC"]
        })
        assert opt_res.status_code == 200

        with SessionLocal() as db:
            votes_after_options_edit = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).count()
            assert votes_after_options_edit == 0, f"Les votes auraient dû être réinitialisés ({votes_after_options_edit} != 0)"

        # 4. Re-voter et tester le reset explicite reset_votes=True
        client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Henri Jamet", "vote": "POUR"})
        with SessionLocal() as db:
            assert db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).count() == 1

        reset_res = client.put(f"/api/projects/{proj_id}", json={
            "title": "Nouveau Titre avec Reset Explicite",
            "reset_votes": True
        })
        assert reset_res.status_code == 200
        with SessionLocal() as db:
            assert db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).count() == 0

    finally:
        with SessionLocal() as db:
            from app.models import ProjectComment
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_livrable_3_member_expense_put_endpoint():
    """
    Livrable 3 :
    Vérifie l'endpoint PUT /api/member-expenses/{expense_id} pour la mise à jour
    d'une dépense / avance de frais membre.
    """
    # 1. Création d'une dépense initiale
    create_res = client.post("/api/member-expenses", json={
        "title": "Achat outillage jardinage",
        "amount": 89.90,
        "category": "Jardin & Espaces Verts",
        "payer_type": "member",
        "member_name": "Henri Jamet",
        "date_str": "2026-05-10"
    })
    assert create_res.status_code == 201
    expense = create_res.json()
    expense_id = expense["id"]
    assert expense["amount"] == 89.90
    assert expense["payer_type"] == "member"

    try:
        # 2. Mise à jour via PUT /api/member-expenses/{expense_id}
        put_res = client.put(f"/api/member-expenses/{expense_id}", json={
            "title": "Achat taille-haie professionnel et outillage",
            "amount": 219.00,
            "category": "Gros Outillage",
            "payer_type": "sci",
            "status": "VALIDATED",
            "member_name": "Marguerite Jamet",
            "date_str": "2026-05-12"
        })
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["id"] == expense_id
        assert updated["title"] == "Achat taille-haie professionnel et outillage"
        assert updated["amount"] == 219.00
        assert updated["category"] == "Gros Outillage"
        assert updated["payer_type"] == "sci"
        assert updated["status"] == "VALIDATED"
        assert updated["expense_date"] == "2026-05-12"
        assert updated["member_prenom"] == "Marguerite"

        # 3. Vérification via GET /api/member-expenses/{expense_id}
        get_res = client.get(f"/api/member-expenses/{expense_id}")
        assert get_res.status_code == 200
        fetched = get_res.json()
        assert fetched["amount"] == 219.00
        assert fetched["member_prenom"] == "Marguerite"

    finally:
        with SessionLocal() as db:
            db.query(MemberExpense).filter(MemberExpense.id == expense_id).delete()
            db.commit()


def test_livrable_3_finances_expenses_put_endpoint(coordinator_headers):
    """
    Vérifie l'endpoint unifié PUT /api/finances/expenses/{expense_id} avec
    category, payer_type, status, member_id / paid_by.
    """
    create_res = client.post("/api/member-expenses", json={
        "title": "Achat peinture volets",
        "amount": 75.50,
        "category": "Travaux & Entretien",
        "payer_type": "member",
        "member_name": "Henri Jamet",
        "date_str": "2026-06-01"
    })
    assert create_res.status_code == 201
    expense = create_res.json()
    expense_id = expense["id"]

    try:
        put_res = client.put(
            f"/api/finances/expenses/{expense_id}",
            json={
                "title": "Achat peinture volets et pinceaux",
                "amount": 95.00,
                "category": "Peinture & Rénovation",
                "payer_type": "sci",
                "status": "APPROVED",
                "paid_by": "Marguerite Jamet",
                "expense_date": "2026-06-03"
            },
            headers=coordinator_headers
        )
        assert put_res.status_code == 200
        data = put_res.json()
        assert data["id"] == expense_id
        assert data["title"] == "Achat peinture volets et pinceaux"
        assert data["amount"] == 95.00
        assert data["category"] == "Peinture & Rénovation"
        assert data["payer_type"] == "sci"
        assert data["status"] == "APPROVED"
        assert data["expense_date"] == "2026-06-03"
        assert data["member_prenom"] == "Marguerite"

    finally:
        with SessionLocal() as db:
            db.query(MemberExpense).filter(MemberExpense.id == expense_id).delete()
            db.commit()
