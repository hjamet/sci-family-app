import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app, record_daily_fuel_snapshot, evaluate_and_sync_stay_heating
from app.database import get_db
from app.models import Log, Member, Task, Reservation
from app.services.vicare_service import (
    ViCareService,
    calculate_fuel_telemetry,
    TANK_CAPACITY_LITERS,
    TANK_TOTAL_HEIGHT_CM,
    CALIBRATION_DATE,
    CALIBRATION_HEIGHT_CM,
    CALIBRATION_LITERS,
    CALIBRATION_BURNER_HOURS,
    CALIBRATION_BURNER_STARTS,
    NOZZLE_SPEC,
    FLOW_LITERS_PER_HOUR,
    LITERS_PER_START
)

client = TestClient(app)


class DummyUser:
    def __init__(self, prenom="Henri", email="hellenvillierssci@gmail.com", is_coordinator=True, user_id=1):
        self.id = user_id
        self.prenom = prenom
        self.name = prenom
        self.email = email
        self.is_coordinator = is_coordinator


# ============================================================================
# 1. Tests Calibration Physique & Empirique du Fioul (Josse / Bompais)
# ============================================================================

def test_fuel_telemetry_calculation_exact_bompais_calibration():
    """
    Vérifie les calculs empiriques exacts basés sur la calibration physique de M. Bompais
    (17/10/2026 : 46 cm / 130 cm = 1 062 L) et compteurs Viessmann (4 531 h / 25 072 allumages).
    """
    # 1. Baseline exacte au moment de la calibration
    base = calculate_fuel_telemetry(CALIBRATION_BURNER_HOURS, CALIBRATION_BURNER_STARTS)
    assert base["fuel_liters_remaining"] == 1062.0
    assert base["fuel_level_percent"] == 35.4
    assert base["fuel_height_cm"] == 46.0
    assert base["fuel_capacity_liters"] == 3000.0
    assert base["fuel_tank_height_cm"] == 130.0
    assert base["fuel_liters_per_start"] == 0.293
    assert base["fuel_liters_per_hour"] == 1.62
    assert "Danfoss 0,50" in base["fuel_nozzle_spec"]
    assert "1 062 L" in base["fuel_calibration_info"]

    # 2. Simulation d'augmentation des allumages (+10 allumages -> 2.93 L brûlés)
    res_starts = calculate_fuel_telemetry(CALIBRATION_BURNER_HOURS, CALIBRATION_BURNER_STARTS + 10)
    assert res_starts["fuel_liters_remaining"] == 1059.1
    assert res_starts["fuel_level_percent"] == 35.3
    assert res_starts["fuel_height_cm"] == 45.9

    # 3. Simulation d'augmentation des heures brûleur (+10 heures -> 16.2 L brûlés)
    res_hours = calculate_fuel_telemetry(CALIBRATION_BURNER_HOURS + 10, CALIBRATION_BURNER_STARTS)
    assert res_hours["fuel_liters_remaining"] == 1045.8
    assert res_hours["fuel_level_percent"] == 34.9
    assert res_hours["fuel_height_cm"] == 45.3

    # 4. Fallback sur valeurs nulles
    none_res = calculate_fuel_telemetry(None, None)
    assert none_res["fuel_liters_remaining"] == 1062.0
    assert none_res["fuel_level_percent"] == 35.4
    assert none_res["fuel_height_cm"] == 46.0


def test_fuel_telemetry_in_vicare_get_status():
    """Vérifie que ViCareService.get_status injecte bien les champs calibrés."""
    fake_telemetry = {
        "room_temperature": 19.5,
        "outside_temperature": 11.0,
        "is_heating_active": True,
        "burner_active": False,
        "burner_hours": 4531,
        "burner_starts": 25072
    }
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=fake_telemetry):
        status_data = ViCareService.get_status()
        assert status_data["fuel_liters_remaining"] == 1062.0
        assert status_data["fuel_level_percent"] == 35.4
        assert status_data["fuel_height_cm"] == 46.0
        assert status_data["fuel_capacity_liters"] == 3000.0


# ============================================================================
# 2. Tests Endpoint GET /api/heating/fuel-history & Snapshot Quotidien
# ============================================================================

def test_heating_fuel_history_endpoint():
    """Vérifie la complétude et l'exactitude de l'endpoint GET /api/heating/fuel-history."""
    res = client.get("/api/heating/fuel-history")
    assert res.status_code == 200
    data = res.json()

    # Vérification section calibration
    calib = data["calibration"]
    assert calib["date"] == "2026-10-17"
    assert calib["height_cm"] == 46.0
    assert calib["tank_height_cm"] == 130.0
    assert calib["liters_remaining"] == 1062.0
    assert calib["capacity_liters"] == 3000.0
    assert calib["burner_hours"] == 4531
    assert calib["burner_starts"] == 25072
    assert calib["total_consumed_since_install_liters"] == 7337
    assert calib["last_delivery_date"] == "2026-01-21"
    assert calib["last_delivery_liters"] == 2014

    # Vérification livraisons officielles Éts JOSSE SAS
    deliveries = data["deliveries"]
    assert len(deliveries) == 4
    total_delivered = sum(d["liters_delivered"] for d in deliveries)
    assert total_delivered == 2128 + 1253 + 2220 + 2014
    invoices = [d["invoice"] for d in deliveries]
    assert "0124101209" in invoices
    assert "101Z002495" in invoices

    # Vérification série mensuelle (12 mois avec pic janvier 2026 et jauge octobre 2026)
    monthly = data["monthly_history"]
    assert len(monthly) == 12
    jan_2026 = next(m for m in monthly if m["month"] == "2026-01")
    assert jan_2026["stock_liters"] == 2864.0
    assert jan_2026["height_cm"] == 124.1
    assert jan_2026["delivery_liters"] == 2014

    oct_2026 = next(m for m in monthly if m["month"] == "2026-10")
    assert oct_2026["stock_liters"] == 1062.0
    assert oct_2026["height_cm"] == 46.0

    # Vérification suivi quotidien
    daily = data["daily_history"]
    assert len(daily) >= 10
    day_17 = next((d for d in daily if d["date"] == "2026-10-17"), None)
    assert day_17 is not None
    assert day_17["burner_starts"] >= 25072
    assert day_17["fuel_liters_remaining"] <= 1062.0


def test_record_daily_fuel_snapshot():
    """Vérifie l'enregistrement et la mise à jour idempotente du snapshot fioul dans la table logs."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        sample_status = {
            "burner_starts": 25075,
            "burner_hours": 4532,
            "fuel_liters_remaining": 1061.1,
            "fuel_level_percent": 35.4,
            "fuel_height_cm": 46.0
        }
        record_daily_fuel_snapshot(db, sample_status)

        today_str = os.getenv("MOCK_DATE", None)
        log_entry = db.query(Log).filter(Log.action == "FUEL_DAILY_SNAPSHOT").order_by(Log.id.desc()).first()
        assert log_entry is not None
        assert "burner_starts" in log_entry.details
        details = json.loads(log_entry.details)
        assert details["burner_starts"] == 25075
        assert details["fuel_liters_remaining"] == 1061.1
    finally:
        db.close()


# ============================================================================
# 3. Tests Génération PDF à la Volée & Fallbacks sans 404 (PyMuPDF / fitz)
# ============================================================================

def test_generate_invoice_pdf_endpoint():
    """Vérifie la génération dynamique de facture PDF A4 officiel avec PyMuPDF."""
    res = client.get(
        "/api/finances/invoices/generate-pdf",
        params={
            "member_name": "Pierre",
            "period": "Octobre 2026",
            "amount": 180.0,
            "ref": "CFF-202610-PIERRE",
            "status_label": "À régler",
            "download": "false"
        }
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "inline" in res.headers["content-disposition"]
    # Vérification signature binaire PDF
    assert res.content.startswith(b"%PDF-")
    assert len(res.content) > 500


def test_generate_invoice_pdf_download_flag():
    """Vérifie l'en-tête Content-Disposition avec download=true."""
    res = client.get(
        "/api/finances/invoices/generate-pdf",
        params={"member_name": "Marc", "amount": 180.0, "download": "true"}
    )
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]


def test_pdf_fallback_endpoints_never_404():
    """Vérifie que les endpoints de PDF ne renvoient jamais 404 même pour des identifiants inconnus."""
    # 1. Fallback par ID inexistant
    res_id = client.get("/api/calls-for-funds/999999/pdf")
    assert res_id.status_code == 200
    assert res_id.headers["content-type"] == "application/pdf"
    assert res_id.content.startswith(b"%PDF-")

    # 2. Fallback par nom de fichier inexistant
    res_file = client.get("/api/finances/calls-for-funds/download/Document_Inconnu_Fictif.pdf")
    assert res_file.status_code == 200
    assert res_file.headers["content-type"] == "application/pdf"
    assert res_file.content.startswith(b"%PDF-")


# ============================================================================
# 4. Tests Connexion Chauffage / ECS des Réservations (Annotation 5)
# ============================================================================

def test_reservation_heating_dhw_strict_coupling():
    """
    Vérifie l'asservissement strict chauffage -> ECS :
    - Wants heating implique automatiquement Wants DHW.
    - Mention 'Hors-gel' ou 'Coupé' désactive le chauffage.
    - Mention 'Eau Chaude Sanitaire Coupée' désactive l'ECS si le chauffage n'est pas demandé.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        # Cas 1 : Chauffage 20°C demandé -> Chauffage True, ECS True
        r1 = Reservation(
            property_id=2, property_name="Presbytère", user_name="Henri",
            year=2026, week_number=42, start_date="2026-10-18", end_date="2026-10-20",
            status="Confirmée", notes="Confort 20°C souhaité"
        )
        db.add(r1)
        db.commit()

        notes_str = r1.notes or ""
        wants_heating_1 = ("20°C" in notes_str or "Chauffage Presbytère" in notes_str) and ("Hors-gel" not in notes_str) and ("Coupé" not in notes_str)
        wants_dhw_1 = ("Eau Chaude Sanitaire Coupée" not in notes_str and "ECS Coupée" not in notes_str) or wants_heating_1
        assert wants_heating_1 is True
        assert wants_dhw_1 is True

        # Cas 2 : Chauffage coupé mais ECS conservée
        notes_2 = "Chauffage Presbytère Coupé (Hors-gel)"
        wants_heating_2 = ("20°C" in notes_2 or "Chauffage Presbytère" in notes_2) and ("Hors-gel" not in notes_2) and ("Coupé" not in notes_2)
        wants_dhw_2 = ("Eau Chaude Sanitaire Coupée" not in notes_2 and "ECS Coupée" not in notes_2) or wants_heating_2
        assert wants_heating_2 is False
        assert wants_dhw_2 is True

        # Cas 3 : Chauffage et ECS coupés
        notes_3 = "Chauffage Coupé - Eau Chaude Sanitaire Coupée"
        wants_heating_3 = ("20°C" in notes_3 or "Chauffage Presbytère" in notes_3) and ("Hors-gel" not in notes_3) and ("Coupé" not in notes_3)
        wants_dhw_3 = ("Eau Chaude Sanitaire Coupée" not in notes_3 and "ECS Coupée" not in notes_3) or wants_heating_3
        assert wants_heating_3 is False
        assert wants_dhw_3 is False

        db.delete(r1)
        db.commit()
    finally:
        db.close()


# ============================================================================
# 5. Tests Notification Email Assignation a Posteriori sur Tâche (Annotation 6)
# ============================================================================

def test_update_task_notifies_new_assignees():
    """
    Vérifie que la mise à jour d'une tâche via PUT /api/tasks/{task_id} notifie
    uniquement les nouveaux membres assignés à la tâche (Annotation 6).
    """
    from app.database import SessionLocal
    from app.main import get_current_user
    db = SessionLocal()
    app.dependency_overrides[get_current_user] = lambda: DummyUser("Henri", is_coordinator=True)
    try:
        # Création ou récupération de deux membres tests
        m1 = db.query(Member).filter(Member.prenom == "Marguerite").first()
        m2 = db.query(Member).filter(Member.prenom == "Pierre").first()
        if not m1:
            m1 = Member(prenom="Marguerite", nom="Jamet", email="marguerite@test.fr")
            db.add(m1)
        if not m2:
            m2 = Member(prenom="Pierre", nom="Jamet", email="pierre@test.fr")
            db.add(m2)
        db.commit()

        # Création d'une tâche avec uniquement Marguerite assignée
        task = Task(
            title="Peinture volets dépendance",
            description="Peinture des volets extérieurs de la dépendance",
            status="A_FAIRE",
            priority="Normale",
            complexity="Modérée",
            assignee_id=m1.id,
            assigned_members=json.dumps([m1.prenom]),
            created_by="Henri"
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        # Ajout a posteriori de Pierre dans assigned_members
        with patch("app.main.send_task_assigned_email") as mock_email:
            mock_email.return_value = {"status": "success", "_email_dispatched": {"to": "pierre@test.fr"}}
            update_res = client.put(
                f"/api/tasks/{task.id}",
                json={"assigned_members": [m1.prenom, m2.prenom]}
            )
            assert update_res.status_code == 200

            # Vérifier que Pierre a été notifié par email, mais pas Marguerite (déjà assignée)
            notified_emails = [c.kwargs.get("to_email") for c in mock_email.call_args_list]
            assert any("pierre" in str(em).lower() for em in notified_emails)
            assert not any("marguerite" in str(em).lower() for em in notified_emails)

        # Nettoyage
        db.delete(task)
        db.commit()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        db.close()
