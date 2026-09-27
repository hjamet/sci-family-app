import os
import sys
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.database import SessionLocal
from app.models import Project, ProjectVote

client = TestClient(app)

def test_modify_vote_on_project():
    """Test Annotation 12: associates can modify their vote on projects without 400 errors."""
    with SessionLocal() as db:
        # Create a test project
        project = Project(
            property_id=1,
            title="Projet Test Modification Vote",
            description="Vérification de la résilience du vote et des modifications",
            estimated_cost=1200.0,
            category="Amélioration",
            priority="HAUTE",
            submitted_by="Henri",
            status="EN_VOTE"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

    try:
        # 1. Henri casts an initial vote "POUR"
        resp1 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR", "comment": "Pour à 100%"}
        )
        assert resp1.status_code == 200, f"Initial vote failed: {resp1.text}"
        data1 = resp1.json()
        assert data1["status"] == "EN_VOTE"

        # 2. Henri modifies his vote to "REPORT_PROCHAINE_AG" using full name "Henri Jamet"
        resp2 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri Jamet", "vote": "REPORT_PROCHAINE_AG", "comment": "Je souhaite en débattre en AG d'abord"}
        )
        assert resp2.status_code == 200, f"Modified vote failed: {resp2.text}"
        data2 = resp2.json()
        # Single-veto rule triggers REPORT_AG
        assert data2["status"] == "REPORT_AG"

        # Verify that only 1 vote exists for Henri (no duplicate created by name variation)
        with SessionLocal() as db:
            votes = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).all()
            assert len(votes) == 1
            assert votes[0].vote == "REPORT_PROCHAINE_AG"

        # 3. Henri changes his vote back to "POUR"
        resp3 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR", "comment": "Finalement d'accord"}
        )
        assert resp3.status_code == 200, f"Second modification failed: {resp3.text}"
        data3 = resp3.json()
        # Since no vote requests REPORT_AG anymore, status should revert to EN_VOTE
        assert data3["status"] == "EN_VOTE"
    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_modify_vote_on_approved_or_in_progress_project():
    """Verify vote modification succeeds even when project status is APPROUVE or EN_COURS."""
    with SessionLocal() as db:
        project = Project(
            property_id=1,
            title="Projet Déjà Approuvé ou En Cours",
            description="Test vote modification on already adopted project",
            estimated_cost=3000.0,
            category="Amélioration",
            priority="MOYENNE",
            submitted_by="Joséphine",
            status="APPROUVE"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

        # Seed an existing vote from Joséphine
        vote = ProjectVote(
            project_id=proj_id,
            user_name="Joséphine",
            vote="POUR",
            comment="Validation initiale"
        )
        db.add(vote)
        db.commit()

    try:
        # Joséphine modifies her vote
        resp = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Joséphine Jamet", "vote": "ABSTENTION", "comment": "Changement en abstention"}
        )
        assert resp.status_code == 200, f"Vote modification on APPROUVE failed: {resp.text}"

        with SessionLocal() as db:
            votes = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).all()
            assert len(votes) == 1
            assert votes[0].vote == "ABSTENTION"
    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_vote_on_archived_project_fails_400():
    """Verify archived projects reject votes with 400."""
    with SessionLocal() as db:
        project = Project(
            property_id=1,
            title="Projet Archivé",
            description="Ne doit plus accepter de votes",
            estimated_cost=500.0,
            category="Amélioration",
            priority="BASSE",
            submitted_by="Frédéric",
            status="ARCHIVEE"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

    try:
        resp = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR", "comment": "Trop tard"}
        )
        assert resp.status_code == 400
        assert "Ce projet n'est pas ouvert au vote actuellement" in resp.json()["detail"]
    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()
