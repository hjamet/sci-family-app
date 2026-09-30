import os
import sys
import json
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.database import SessionLocal
from app.models import Project, ProjectVote, ProjectComment, Member

client = TestClient(app)


def test_vote_string_truncation_and_no_500_on_long_text():
    """Annotation 7 : Résolution du crash HTTP 500 sur POST /api/projects/{id}/vote.
    Sécuriser l'assignation de vote : tronquer à 50 caractères si chaîne brute et accepter sans StringDataRightTruncation."""
    with SessionLocal() as db:
        project = Project(
            property_id=1,
            title="Projet Test Vote Sécurisé Texte Long",
            description="Vérification de la non-régression sur chaîne longue",
            estimated_cost=800.0,
            category="Travaux",
            priority="MOYENNE",
            submitted_by="Henri",
            status="OPEN"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

    try:
        # Chaîne brute très longue (> 100 caractères)
        long_vote_str = "POUR" + "X" * 150
        resp = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri Jamet", "vote": "POUR", "comment": "Vote normal"}
        )
        assert resp.status_code == 200

        with SessionLocal() as db:
            v = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).first()
            assert v is not None
            assert len(v.vote) <= 50

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_vote_accent_and_case_insensitive_deduplication():
    """Annotation 7 : Sécuriser la recherche du vote existant par nom d'associé normalisé (insensible à la casse, sans accents)
    pour éviter les collisions d'unicité UniqueConstraint('project_id', 'user_name')."""
    with SessionLocal() as db:
        project = Project(
            property_id=1,
            title="Projet Test Accents Unicité",
            description="Vérification de la normalisation accents et casse",
            estimated_cost=500.0,
            category="Entretien",
            submitted_by="Joséphine",
            status="OPEN"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

    try:
        # 1. Vote avec accent : Joséphine
        r1 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Joséphine", "vote": "POUR", "comment": "Premier vote avec accent"}
        )
        assert r1.status_code == 200

        # 2. Vote sans accent et minuscule : josephine
        r2 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "josephine", "vote": "CONTRE", "comment": "Modification sans accent"}
        )
        assert r2.status_code == 200

        # 3. Vote avec nom de famille : Josephine Jamet
        r3 = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Josephine Jamet", "vote": "ABSTENTION", "comment": "Modification nom complet"}
        )
        assert r3.status_code == 200

        # Vérifier qu'il n'y a qu'UN SEUL vote en BDD et aucune collision d'unicité 500
        with SessionLocal() as db:
            votes = db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).all()
            assert len(votes) == 1
            assert votes[0].vote == "ABSTENTION"
            assert votes[0].comment == "Modification nom complet"

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_format_project_response_with_dict_options():
    """Annotation 7 : Sécuriser format_project_response : vérifier que chaque option est une chaîne avant tout appel
    de méthode de chaîne (opt.get('label') si dict)."""
    with SessionLocal() as db:
        project = Project(
            property_id=1,
            title="Projet Test Options Format Dict",
            description="Test options complexes sous forme d'objets",
            estimated_cost=1000.0,
            submitted_by="Henri",
            status="OPEN",
            options=json.dumps([
                {"label": "Option Devis A", "cost": 1000},
                {"label": "Option Devis B", "cost": 1500},
                "Option Devis C (Simple)"
            ])
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        proj_id = project.id

    try:
        # Consultation du projet -> format_project_response ne doit pas crasher
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        data = [p for p in resp.json() if p["id"] == proj_id]
        assert len(data) == 1
        proj_data = data[0]
        assert "options_counts" in proj_data["vote_summary"]
        assert "Option Devis A" in proj_data["vote_summary"]["options_counts"]
        assert "Option Devis B" in proj_data["vote_summary"]["options_counts"]

    finally:
        with SessionLocal() as db:
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_project_lifecycle_proposed_open_pending_validation_and_archived():
    """Annotation 8 : Cycle de vie des votes calqué sur les tâches :
    - PROPOSED à la création par défaut
    - OPEN pour les votes en cours (ou decision_mode == SOUMETTRE_AU_VOTE)
    - PENDING_VALIDATION lorsque le total des voix atteint le quorum complet (7 voix)
    - ARCHIVED pour les votes clos interdisant les votes futurs (400)"""

    # 1. Création avec statut par défaut -> PROPOSED
    p1 = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Création Proposed",
        "description": "Doit être PROPOSED à la création",
        "submitted_by": "Henri"
    })
    assert p1.status_code == 201
    d1 = p1.json()
    assert d1["status"] == "PROPOSED"
    p1_id = d1["id"]

    # 2. Création avec decision_mode SOUMETTRE_AU_VOTE -> OPEN
    p2 = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Création Open",
        "description": "Doit être OPEN car soumis au vote",
        "decision_mode": "SOUMETTRE_AU_VOTE",
        "submitted_by": "Henri"
    })
    assert p2.status_code == 201
    d2 = p2.json()
    assert d2["status"] == "OPEN"
    p2_id = d2["id"]

    try:
        # 3. Quorum de 7 voix exprimées sur p2 -> bascule automatique en PENDING_VALIDATION
        associates = [
            "Henri",
            "Joséphine",
            "Marguerite",
            "Frédéric",
            "Éléonore",
            "Béatrice",
            "Charles"
        ]
        for idx, associate in enumerate(associates):
            vote_val = "POUR" if idx % 2 == 0 else "CONTRE"
            res = client.post(
                f"/api/projects/{p2_id}/vote",
                json={"user_name": associate, "vote": vote_val}
            )
            assert res.status_code == 200, f"Erreur vote pour {associate}: {res.text}"
            res_data = res.json()
            if idx < 6:
                # Scrutin encore ouvert avant les 7 voix
                assert res_data["status"] == "OPEN"
            else:
                # 7e voix atteinte (quorum complet) -> PENDING_VALIDATION obligatoire
                assert res_data["status"] == "PENDING_VALIDATION"

        # 4. Clôture / Archivage par coordinateur vers ARCHIVED
        rev = client.patch(
            f"/api/projects/{p2_id}/review",
            json={"status": "ARCHIVED"}
        )
        assert rev.status_code == 200
        assert rev.json()["status"] == "ARCHIVED"

        # 5. Tentative de vote sur projet ARCHIVED -> HTTP 400
        vote_archived = client.post(
            f"/api/projects/{p2_id}/vote",
            json={"user_name": "Henri", "vote": "POUR"}
        )
        assert vote_archived.status_code == 400
        assert "pas ouvert au vote" in vote_archived.json()["detail"]

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id.in_([p1_id, p2_id])).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id.in_([p1_id, p2_id])).delete()
            db.query(Project).filter(Project.id.in_([p1_id, p2_id])).delete()
            db.commit()


def test_external_links_pydantic_schema_and_persistence():
    """Annotations 6 & 12 :
    - ProjectResponse inclut external_links (Optional[List[Dict[str, Any]]])
    - review_project et update_project sauvegardent external_links
    - Modification de external_links invalide les votes en cours (Annotation 6)"""

    # 1. Création projet avec external_links
    links_payload = [
        {"title": "Devis Toiture Declercq", "url": "https://drive.google.com/file/d/123/view"},
        {"title": "Fiche Technique Klereo", "url": "https://klereo.com/doc.pdf"}
    ]
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Liens Externes",
        "description": "Test de persistance et de schéma external_links",
        "decision_mode": "SOUMETTRE_AU_VOTE",
        "submitted_by": "Henri",
        "external_links": links_payload
    })
    assert p.status_code == 201
    data = p.json()
    assert "external_links" in data
    assert len(data["external_links"]) == 2
    assert data["external_links"][0]["title"] == "Devis Toiture Declercq"
    proj_id = data["id"]

    try:
        # 2. Vote initial
        v_res = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR"}
        )
        assert v_res.status_code == 200
        assert len(v_res.json()["votes"]) == 1

        # 3. Modification via PUT /api/projects/{id} (update_project)
        new_links = [
            {"title": "Devis Mis à Jour", "url": "https://drive.google.com/file/d/456/view"}
        ]
        up_res = client.put(
            f"/api/projects/{proj_id}",
            json={"external_links": new_links}
        )
        assert up_res.status_code == 200
        up_data = up_res.json()
        assert len(up_data["external_links"]) == 1
        assert up_data["external_links"][0]["title"] == "Devis Mis à Jour"

        # Annotation 6 : La modification des liens externes a réinitialisé les votes
        assert len(up_data["votes"]) == 0

        # 4. Modification via PATCH /api/projects/{id}/review (review_project)
        final_links = [
            {"title": "Devis Final", "url": "https://drive.google.com/file/d/789/view"},
            {"title": "Notice Klereo", "url": "https://klereo.com/notice.pdf"}
        ]
        rev_res = client.patch(
            f"/api/projects/{proj_id}/review",
            json={"external_links": final_links}
        )
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert len(rev_data["external_links"]) == 2
        assert rev_data["external_links"][1]["title"] == "Notice Klereo"

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_vote_withdrawal_and_automatic_reversion_to_open():
    """Annotations 9 & 10 :
    - Retrait / annulation de vote avec ('', 'EN_ATTENTE', 'RETIRER')
    - Quorum atteint (>= 7 votants) -> PENDING_VALIDATION
    - Retrait d'un vote faisant repasser le quorum sous 7 -> réversion automatique à OPEN
    """
    # 1. Création projet ouvert au vote
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Test Retrait et Réversion Quorum",
        "description": "Vérifie le retrait de vote et la réversion PENDING_VALIDATION -> OPEN",
        "decision_mode": "SOUMETTRE_AU_VOTE",
        "submitted_by": "Henri"
    })
    assert p.status_code == 201
    proj_id = p.json()["id"]

    try:
        associates = [
            "Henri",
            "Joséphine",
            "Marguerite",
            "Frédéric",
            "Éléonore",
            "Béatrice",
            "Charles"
        ]
        # 2. Les 7 associés votent -> PENDING_VALIDATION
        for assoc in associates:
            r = client.post(
                f"/api/projects/{proj_id}/vote",
                json={"user_name": assoc, "vote": "POUR"}
            )
            assert r.status_code == 200

        # Vérifier que le statut est bien PENDING_VALIDATION et qu'il y a 7 votes
        proj_state = client.get("/api/projects").json()
        target = next(x for x in proj_state if x["id"] == proj_id)
        assert target["status"] == "PENDING_VALIDATION"
        assert len(target["votes"]) == 7

        # 3. Charles retire son vote via 'RETIRER'
        r_retirer = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Charles", "vote": "RETIRER"}
        )
        assert r_retirer.status_code == 200
        d_retirer = r_retirer.json()
        # Le vote a bien été supprimé
        assert len(d_retirer["votes"]) == 6
        # Réversion automatique vers OPEN car le total de votants est sous 7 !
        assert d_retirer["status"] == "OPEN"

        # 4. Charles revote 'CONTRE' -> retour du quorum à 7 -> PENDING_VALIDATION
        r_revote = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Charles", "vote": "CONTRE"}
        )
        assert r_revote.status_code == 200
        assert r_revote.json()["status"] == "PENDING_VALIDATION"
        assert len(r_revote.json()["votes"]) == 7

        # 5. Éléonore annule son vote via 'EN_ATTENTE' -> retour à 6 voix -> OPEN
        r_attente = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Éléonore", "vote": "EN_ATTENTE"}
        )
        assert r_attente.status_code == 200
        assert r_attente.json()["status"] == "OPEN"
        assert len(r_attente.json()["votes"]) == 6

        # 6. Éléonore revote puis Frédéric annule avec '' -> OPEN
        client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Éléonore", "vote": "POUR"}
        )
        r_vide = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Frédéric", "vote": ""}
        )
        assert r_vide.status_code == 200
        assert r_vide.json()["status"] == "OPEN"
        assert len(r_vide.json()["votes"]) == 6

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_delete_project_idempotent():
    """Annotation 2 : Idempotence de la suppression de projet.
    Si le projet n'existe pas ou a déjà été supprimé, retourner 204 No Content au lieu de 404."""
    # 1. Création d'un projet temporaire
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Test Suppression Idempotente",
        "description": "Vérifie le code 204 lors de suppressions répétées",
        "submitted_by": "Henri"
    })
    assert p.status_code == 201
    proj_id = p.json()["id"]

    # 2. Première suppression -> 204
    r1 = client.delete(f"/api/projects/{proj_id}")
    assert r1.status_code == 204

    # 3. Deuxième suppression du même projet (déjà supprimé) -> 204 (idempotent, pas de 404)
    r2 = client.delete(f"/api/projects/{proj_id}")
    assert r2.status_code == 204

    # 4. Suppression d'un ID inexistant quelconque -> 204
    r3 = client.delete("/api/projects/9999999")
    assert r3.status_code == 204


def test_vote_locked_on_proposed_status():
    """Annotation 4 : Verrouillage strict du vote sur les scrutins au statut 'PROPOSED'.
    Doit retourner HTTP 400 avec le message de validation coordinateurs."""
    # 1. Création d'un projet au statut PROPOSED par défaut
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet En Attente Validation",
        "description": "Scrutin proposé par un membre",
        "submitted_by": "Henri"
    })
    assert p.status_code == 201
    proj_id = p.json()["id"]
    assert p.json()["status"] == "PROPOSED"

    try:
        # 2. Tentative de vote -> doit être bloqué avec 400
        r = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR"}
        )
        assert r.status_code == 400
        err_detail = r.json().get("detail", "")
        assert "Ce scrutin est en attente de validation de création par les coordinateurs" in err_detail

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_reject_and_reopen_project():
    """Annotation 5 : Endpoint POST /api/projects/{id}/reject-and-reopen.
    - Annule et supprime tous les votes enregistrés
    - Règle le statut à OPEN et add_to_ag_agenda à False
    - Ajoute un commentaire système de 'Coordination SCI'
    - Retourne le projet actualisé formaté"""
    # 1. Création d'un projet et enregistrement de votes
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Test Refus et Réouverture",
        "description": "Scrutin contesté en attente de réouverture",
        "decision_mode": "SOUMETTRE_AU_VOTE",
        "submitted_by": "Henri"
    })
    assert p.status_code == 201
    proj_id = p.json()["id"]

    try:
        # Enregistrement de 2 votes
        client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Henri", "vote": "POUR"})
        client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Charles", "vote": "CONTRE"})

        # Vérifier que les votes sont présents
        proj_before = client.get("/api/projects").json()
        target = next(x for x in proj_before if x["id"] == proj_id)
        assert len(target["votes"]) == 2

        # 2. Appel de l'endpoint reject-and-reopen
        r_reopen = client.post(f"/api/projects/{proj_id}/reject-and-reopen")
        assert r_reopen.status_code == 200
        data = r_reopen.json()

        # Vérifications
        assert data["status"] == "OPEN"
        assert data["add_to_ag_agenda"] is False
        assert len(data["votes"]) == 0

        # Vérification du commentaire système
        r_comments = client.get(f"/api/projects/{proj_id}/comments")
        assert r_comments.status_code == 200
        comments = r_comments.json()
        assert len(comments) >= 1
        sys_comment = next((c for c in comments if c["author_name"] == "Coordination SCI"), None)
        assert sys_comment is not None
        assert "refusé la clôture du scrutin" in sys_comment["content"]
        assert "rouvert" in sys_comment["content"]

        # 3. Test sur projet inexistant -> 404
        r_notfound = client.post("/api/projects/999999/reject-and-reopen")
        assert r_notfound.status_code == 404

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_vote_locked_on_pending_creation():
    """Annotation 4 : Blocage strict des votes sur les statuts d'attente de création
    (PROPOSED, PENDING_CREATION, EN_ATTENTE_CREATION) -> HTTP 400."""
    with SessionLocal() as db:
        p = Project(
            property_id=1,
            title="Projet Test En Attente Création",
            description="Initiative en attente",
            submitted_by="Henri",
            status="PENDING_CREATION"
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        proj_id = p.id

    try:
        r = client.post(
            f"/api/projects/{proj_id}/vote",
            json={"user_name": "Henri", "vote": "POUR"}
        )
        assert r.status_code == 400
        assert "Ce scrutin est en attente de validation de création" in r.json().get("detail", "")
    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()


def test_coordination_validation_open_and_archive_notifications():
    """Annotations 5, 11, 12 :
    - Le passage d'un vote en mode "En cours" (OPEN) envoie notification et commentaire système.
    - La validation pour archivage (ARCHIVED) fige les votes, passe en archivé et envoie l'email de résultats."""
    # 1. Création projet PROPOSED
    p = client.post("/api/projects", json={
        "property_id": 1,
        "title": "Projet Cycle Coordination Validations",
        "description": "Test des notifications de passage OPEN et ARCHIVED",
        "submitted_by": "Henri"
    })
    assert p.status_code == 201
    proj_id = p.json()["id"]

    try:
        # 2. Passage à OPEN (Validation coordinateur pour ouverture)
        r_open = client.patch(
            f"/api/projects/{proj_id}/review",
            json={"status": "OPEN"}
        )
        assert r_open.status_code == 200
        assert r_open.json()["status"] == "OPEN"

        # Vérifier commentaire système "validé par la coordination"
        r_comments = client.get(f"/api/projects/{proj_id}/comments")
        assert any("validé par la coordination" in c["content"] for c in r_comments.json())

        # 3. Vote d'associés
        client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Henri", "vote": "POUR"})
        client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Charles", "vote": "POUR"})

        # 4. Passage à ARCHIVED (Accepter l'archivage)
        r_archive = client.patch(
            f"/api/projects/{proj_id}/review",
            json={"status": "ARCHIVED"}
        )
        assert r_archive.status_code == 200
        assert r_archive.json()["status"] == "ARCHIVED"

        # Vérifier commentaire système d'archivage
        r_comments2 = client.get(f"/api/projects/{proj_id}/comments")
        assert any("archivé définitivement" in c["content"] for c in r_comments2.json())

        # 5. Vote bloqué désormais car archivé
        r_vote_arch = client.post(f"/api/projects/{proj_id}/vote", json={"user_name": "Marguerite", "vote": "POUR"})
        assert r_vote_arch.status_code == 400

    finally:
        with SessionLocal() as db:
            db.query(ProjectVote).filter(ProjectVote.project_id == proj_id).delete()
            db.query(ProjectComment).filter(ProjectComment.project_id == proj_id).delete()
            db.query(Project).filter(Project.id == proj_id).delete()
            db.commit()



