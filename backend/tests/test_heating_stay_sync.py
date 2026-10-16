import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app, evaluate_and_sync_stay_heating
from app.services.vicare_service import ViCareService
from app.models import ThermalSettings, Reservation

try:
    from conftest import TestingSessionLocal
except ImportError:
    from tests.conftest import TestingSessionLocal

client = TestClient(app)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_vicare_set_mode_refresh_status_parameter():
    """
    Vérifie que set_mode accepte refresh_status:
    - si False, n'appelle pas get_status(force_refresh=True) et renvoie le statut ok.
    - si True, appelle get_status(force_refresh=True).
    """
    mock_boiler = MagicMock()
    mock_circuit = MagicMock()

    with patch.object(ViCareService, "_get_boiler_and_circuit", return_value=(mock_boiler, mock_circuit)), \
         patch.object(ViCareService, "get_status") as mock_get_status, \
         patch("app.services.vicare_service.is_read_only_mode", return_value=False):
        mock_get_status.return_value = {"mode": "standby", "heating_mode": "standby"}

        # 1. refresh_status = False
        res_no_refresh = ViCareService.set_mode("standby", refresh_status=False)
        mock_circuit.setMode.assert_called_with("standby")
        mock_get_status.assert_not_called()
        assert res_no_refresh == {"status": "ok", "mode": "standby"}

        # 2. refresh_status = True
        res_refresh = ViCareService.set_mode("dhwAndHeating", refresh_status=True)
        mock_circuit.setMode.assert_called_with("dhwAndHeating")
        mock_get_status.assert_called_once_with(force_refresh=True)
        assert res_refresh["heating_mode"] == "standby"


def test_vicare_set_temperature_dhw_clamped_in_10_60():
    """
    Vérifie que la consigne ECS est bridée dans [10, 60] conformément à la contrainte VPlusHO1_40:
    - 65°C est bridé à 60°C (jamais de dépassement matériel ni de crash)
    - 8°C est bridé à 10°C (seuil plancher)
    - refresh_status=False n'appelle pas get_status
    """
    mock_boiler = MagicMock()
    mock_circuit = MagicMock()

    with patch.object(ViCareService, "_get_boiler_and_circuit", return_value=(mock_boiler, mock_circuit)), \
         patch.object(ViCareService, "get_status") as mock_get_status, \
         patch("app.services.vicare_service.is_read_only_mode", return_value=False):

        # 1. Test clamping 65°C -> 60°C
        res_high = ViCareService.set_temperature(65.0, program="dhw", refresh_status=False)
        mock_boiler.setDomesticHotWaterTemperature.assert_called_with(60)
        mock_get_status.assert_not_called()
        assert res_high["status"] == "ok"

        # 2. Test clamping 5°C -> 10°C
        res_low = ViCareService.set_temperature(5.0, program="dhw", refresh_status=False)
        mock_boiler.setDomesticHotWaterTemperature.assert_called_with(10)
        mock_get_status.assert_not_called()
        assert res_low["status"] == "ok"

        # 3. Test consigne normale 52°C
        ViCareService.set_temperature(52.0, program="dhw", refresh_status=False)
        mock_boiler.setDomesticHotWaterTemperature.assert_called_with(52)


def test_vicare_trigger_anti_legionella_targets_60():
    """
    Vérifie que le cycle anti-légionelle cible 60.0°C (plafond matériel VPlusHO1_40)
    au lieu de 65.0°C.
    """
    mock_boiler = MagicMock()
    mock_circuit = MagicMock()

    with patch.object(ViCareService, "_get_boiler_and_circuit", return_value=(mock_boiler, mock_circuit)), \
         patch("app.services.vicare_service.is_read_only_mode", return_value=False):
        res = ViCareService.trigger_anti_legionella_cycle()
        mock_boiler.setDomesticHotWaterTemperature.assert_called_with(60)
        assert res["target"] == 60.0
        assert "60°C" in res["message"]


def test_vicare_set_dhw_mode_never_forces_10_degrees():
    """
    Vérifie que set_dhw_mode(is_active=False) ne force JAMAIS la consigne ECS à 10°C
    (alignement application officielle ViCare).
    """
    with patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp, \
         patch.object(ViCareService, "get_status", return_value={"is_heating_active": True}):

        # Désactivation ECS avec chauffage actif
        ViCareService.set_dhw_mode(is_active=False, is_heating_active=True)
        mock_set_mode.assert_called_with("dhwAndHeating")
        mock_set_temp.assert_not_called()

        # Désactivation ECS sans chauffage actif
        mock_set_mode.reset_mock()
        mock_set_temp.reset_mock()
        ViCareService.set_dhw_mode(is_active=False, is_heating_active=False)
        mock_set_mode.assert_called_with("standby")
        mock_set_temp.assert_not_called()


def test_evaluate_and_sync_standby_only_sets_standby_no_dhw_10(db_session):
    """
    Vérifie qu'un passage en standby via evaluate_and_sync_stay_heating n'envoie
    QUE set_mode('standby') et ne touche jamais à la consigne ECS (10°C banni).
    """
    setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating", mode="dhwAndHeating", target_temperature=20.0)
        db_session.add(setting)
    else:
        setting.mode = "dhwAndHeating"
        setting.target_temperature = 20.0

    dhw_setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "dhw").first()
    if not dhw_setting:
        dhw_setting = ThermalSettings(equipment_type="dhw", mode="on", target_temperature=52.0)
        db_session.add(dhw_setting)
    else:
        dhw_setting.mode = "on"
        dhw_setting.target_temperature = 52.0
    db_session.commit()

    fake_status = {
        "heating_mode": "dhwAndHeating",
        "mode": "dhwAndHeating",
        "target_temp": 20.0,
        "target_temperature": 20.0,
        "dhw_target_temp": 52.0,
        "dhw_target_temperature": 52.0,
        "room_temperature": 18.0,
        "outside_temperature": 10.0
    }

    with patch.object(ViCareService, "get_status", return_value=fake_status), \
         patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp:

        result = evaluate_and_sync_stay_heating(db_session, force_sync=False)

        assert result["target_mode"] == "standby"
        assert result["vicare_command_executed"] is True
        mock_set_mode.assert_called_once_with("standby", refresh_status=True)
        # Consigne 10°C bannie : set_temperature ne doit JAMAIS avoir été appelé !
        mock_set_temp.assert_not_called()

        # En base, la consigne ECS reste à 52°C et non à 10°C
        db_session.refresh(dhw_setting)
        assert dhw_setting.target_temperature == 52.0
        assert dhw_setting.mode == "off"


def test_evaluate_and_sync_dhw_and_heating_no_redundant_writes(db_session):
    """
    Vérifie qu'un démarrage en dhwAndHeating n'envoie pas d'écritures de température
    redondantes si les consignes 20°C / 52°C sont déjà en place sur la chaudière.
    """
    res = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Henri Jamet",
        year=2026,
        week_number=42,
        start_date="2026-10-15",
        end_date="2026-10-20",
        arrival_time="12:00",
        departure_time="12:00",
        status="Confirmée",
        notes="Séjour famille - Chauffage 20°C souhaité"
    )
    db_session.add(res)

    setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating", mode="standby", target_temperature=20.0)
        db_session.add(setting)
    else:
        setting.mode = "standby"

    dhw_setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "dhw").first()
    if not dhw_setting:
        dhw_setting = ThermalSettings(equipment_type="dhw", mode="off", target_temperature=52.0)
        db_session.add(dhw_setting)
    else:
        dhw_setting.mode = "off"
    db_session.commit()

    current_status = {
        "heating_mode": "standby",
        "mode": "standby",
        "target_temp": 20.0,
        "target_temperature": 20.0,
        "dhw_target_temp": 52.0,
        "dhw_target_temperature": 52.0,
        "room_temperature": 18.0,
        "outside_temperature": 10.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp:

        result = evaluate_and_sync_stay_heating(db_session, force_sync=False)

        assert result["target_mode"] == "dhwAndHeating"
        assert result["vicare_command_executed"] is True

        # Seul set_mode doit être appelé (avec refresh_status=False)
        mock_set_mode.assert_called_once_with("dhwAndHeating", refresh_status=False)
        # Pas d'écritures redondantes sur les températures !
        mock_set_temp.assert_not_called()


def test_update_heating_settings_standby_no_dhw_10(db_session):
    """
    Vérifie que l'endpoint POST /api/heating/settings en mode standby
    n'envoie que set_mode('standby') et n'abaisse jamais l'ECS à 10°C.
    """
    current_status = {
        "heating_mode": "dhwAndHeating",
        "mode": "dhwAndHeating",
        "target_temp": 20.0,
        "target_temperature": 20.0,
        "dhw_target_temp": 52.0,
        "dhw_target_temperature": 52.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp:

        resp = client.post("/api/heating/settings", json={"mode": "standby"})
        assert resp.status_code == 200

        mock_set_mode.assert_called_once_with("standby")
        # set_temperature ne doit JAMAIS avoir été appelé (10°C banni)
        mock_set_temp.assert_not_called()


def test_update_heating_settings_no_redundant_writes(db_session):
    """
    Vérifie que l'endpoint POST /api/heating/settings en dhwAndHeating
    n'envoie aucune commande si le mode et les températures sont déjà identiques.
    """
    current_status = {
        "heating_mode": "dhwAndHeating",
        "mode": "dhwAndHeating",
        "target_temp": 20.0,
        "target_temperature": 20.0,
        "dhw_target_temp": 52.0,
        "dhw_target_temperature": 52.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp:

        resp = client.post("/api/heating/settings", json={
            "mode": "dhwAndHeating",
            "target_temperature": 20.0,
            "dhw_target_temperature": 52.0
        })
        assert resp.status_code == 200

        # set_mode applique le mode sélectionné, mais aucune écriture de température redondante
        mock_set_mode.assert_called_once_with("dhwAndHeating")
        mock_set_temp.assert_not_called()
