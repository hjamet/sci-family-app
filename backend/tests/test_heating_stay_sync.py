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
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    tz_paris = ZoneInfo("Europe/Paris")
    now_paris = datetime.now(tz_paris)
    start_date = (now_paris - timedelta(days=1)).strftime("%Y-%m-%d")
    end_date = (now_paris + timedelta(days=2)).strftime("%Y-%m-%d")

    res = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Henri Jamet",
        year=now_paris.year,
        week_number=now_paris.isocalendar()[1],
        start_date=start_date,
        end_date=end_date,
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
        mock_set_not_called = mock_set_temp.assert_not_called()


def test_evaluate_and_sync_configured_comfort_preserved(db_session):
    """
    a) Vérifie que la consigne confort configurée dans ThermalSettings(equipment_type='heating') (ex. 21.0°C)
    est respectée et n'est pas écrasée par 20.0 ni par 5.0 hors séjour.
    """
    setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating", mode="standby", target_temperature=21.0)
        db_session.add(setting)
    else:
        setting.mode = "standby"
        setting.target_temperature = 21.0
    db_session.commit()

    current_status = {
        "heating_mode": "standby",
        "mode": "standby",
        "target_temp": 21.0,
        "target_temperature": 21.0,
        "dhw_target_temp": 52.0,
        "dhw_target_temperature": 52.0,
        "room_temperature": 18.0,
        "outside_temperature": 10.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):

        # 1. Hors séjour (aucune réservation active)
        res = evaluate_and_sync_stay_heating(db_session, force_sync=True)
        assert res["need_heating"] is False
        db_session.refresh(setting)
        # La consigne confort en base reste bien 21.0°C et n'a pas été écrasée par 5.0 ni 20.0
        assert setting.target_temperature == 21.0

        # 2. Pendant un séjour sans consigne explicite dans les notes -> hérite de la consigne configurée 21.0°C
        from zoneinfo import ZoneInfo
        from datetime import datetime, timedelta
        tz_paris = ZoneInfo("Europe/Paris")
        now_paris = datetime.now(tz_paris)
        stay = Reservation(
            property_id=2,
            property_name="Presbytère",
            user_name="Henri Jamet",
            year=now_paris.year,
            week_number=now_paris.isocalendar()[1],
            start_date=(now_paris - timedelta(days=1)).strftime("%Y-%m-%d"),
            end_date=(now_paris + timedelta(days=2)).strftime("%Y-%m-%d"),
            arrival_time="12:00",
            departure_time="12:00",
            status="Confirmée",
            notes="Séjour famille - Chauffage Presbytère souhaité"
        )
        db_session.add(stay)
        db_session.commit()

        res_stay = evaluate_and_sync_stay_heating(db_session, force_sync=True)
        assert res_stay["need_heating"] is True
        assert res_stay["target_comfort_temperature"] == 21.0
        db_session.refresh(setting)
        assert setting.target_temperature == 21.0

        # 3. Même avec une note contenant le texte par défaut 'Chauffage Presbytère 20°C',
        # si la consigne configurée sur /sejour est abaissée à 19.0°C, c'est 19.0°C qui fait foi (source unique).
        setting.target_temperature = 19.0
        db_session.commit()
        stay.notes = "Séjour famille [Domotique: Chauffage Presbytère 20°C]"
        db_session.commit()

        res_stay_19 = evaluate_and_sync_stay_heating(db_session, force_sync=True)
        assert res_stay_19["need_heating"] is True
        assert res_stay_19["target_comfort_temperature"] == 19.0
        db_session.refresh(setting)
        assert setting.target_temperature == 19.0



def test_evaluate_and_sync_pool_preheating_active_any_season(db_session):
    """
    b) Vérifie qu'une réservation avec 'Préchauffage Piscine 27°C' active bien
    ThermalSettings(equipment_type='pool') en mode confort quelle que soit la saison.
    """
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    from app.services.klereo_service import KlereoService

    tz_paris = ZoneInfo("Europe/Paris")
    now_paris = datetime.now(tz_paris)

    res_pool = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Associé Famille",
        year=now_paris.year,
        week_number=now_paris.isocalendar()[1],
        start_date=(now_paris - timedelta(days=1)).strftime("%Y-%m-%d"),
        end_date=(now_paris + timedelta(days=2)).strftime("%Y-%m-%d"),
        arrival_time="12:00",
        departure_time="12:00",
        status="Confirmée",
        notes="Séjour automne - Préchauffage Piscine 27°C demandé"
    )
    db_session.add(res_pool)

    pool_setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    if not pool_setting:
        pool_setting = ThermalSettings(equipment_type="pool", mode="eco", filtration_mode="auto", target_temperature=27.0)
        db_session.add(pool_setting)
    else:
        pool_setting.mode = "eco"
        pool_setting.filtration_mode = "auto"
        pool_setting.target_temperature = 27.0
    db_session.commit()

    with patch.object(ViCareService, "get_status", return_value={"room_temperature": 16.0, "outside_temperature": 10.0}), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"), \
         patch.object(KlereoService, "is_read_only_mode", return_value=False), \
         patch.object(KlereoService, "get_status", return_value={"is_heating_active": False}), \
         patch.object(KlereoService, "set_heating_mode") as mock_klereo_set_heating:

        result = evaluate_and_sync_stay_heating(db_session, force_sync=False)

        assert result["need_pool"] is True
        db_session.refresh(pool_setting)
        assert pool_setting.mode == "confort"
        assert pool_setting.filtration_mode == "marche"
        mock_klereo_set_heating.assert_called_once_with(mode="confort", active=True, target_temperature=27.0)


def test_post_heating_settings_updates_reservation_domotique_tag(db_session):
    """
    c) Vérifie qu'un appel manuel à POST /api/heating/settings pendant un séjour actif
    au Presbytère met à jour le tag [Domotique: ...] de la réservation en cours.
    """
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    tz_paris = ZoneInfo("Europe/Paris")
    now_paris = datetime.now(tz_paris)

    stay = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Henri Jamet",
        year=now_paris.year,
        week_number=now_paris.isocalendar()[1],
        start_date=(now_paris - timedelta(days=1)).strftime("%Y-%m-%d"),
        end_date=(now_paris + timedelta(days=2)).strftime("%Y-%m-%d"),
        arrival_time="14:00",
        departure_time="11:00",
        status="Confirmée",
        notes="Séjour en cours [Domotique: Eau Chaude Sanitaire Coupée • Chauffage Presbytère Hors-gel 12°C]"
    )
    db_session.add(stay)
    db_session.commit()

    current_status = {
        "heating_mode": "standby",
        "mode": "standby",
        "target_temp": 18.0,
        "dhw_target_temp": 52.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):

        resp = client.post("/api/heating/settings", json={
            "mode": "dhwAndHeating",
            "target_temperature": 21.0,
            "is_heating_active": True,
            "is_dhw_active": True
        })
        assert resp.status_code == 200

        db_session.refresh(stay)
        assert "[Domotique:" in stay.notes
        assert "Eau Chaude Sanitaire 52°C" in stay.notes
        assert "Chauffage Presbytère 21°C" in stay.notes


def test_post_heating_settings_updates_reservation_domotique_tag_heating_off(db_session):
    """
    Vérifie qu'un appel à POST /api/heating/settings avec is_heating_active=False
    écrit bien 'Chauffage Presbytère Coupé' dans le tag [Domotique: ...] (au lieu de Hors-gel 12°C).
    """
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    tz_paris = ZoneInfo("Europe/Paris")
    now_paris = datetime.now(tz_paris)

    stay = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Henri Jamet",
        year=now_paris.year,
        week_number=now_paris.isocalendar()[1],
        start_date=(now_paris - timedelta(days=1)).strftime("%Y-%m-%d"),
        end_date=(now_paris + timedelta(days=2)).strftime("%Y-%m-%d"),
        arrival_time="14:00",
        departure_time="11:00",
        status="Confirmée",
        notes="Séjour en cours [Domotique: Eau Chaude Sanitaire 52°C • Chauffage Presbytère 20°C]"
    )
    db_session.add(stay)
    db_session.commit()

    current_status = {
        "heating_mode": "dhwAndHeating",
        "mode": "dhwAndHeating",
        "target_temp": 20.0,
        "dhw_target_temp": 52.0
    }

    with patch.object(ViCareService, "get_status", return_value=current_status), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):

        resp = client.post("/api/heating/settings", json={
            "mode": "dhw",
            "is_heating_active": False,
            "is_dhw_active": True
        })
        assert resp.status_code == 200

        db_session.refresh(stay)
        assert "[Domotique:" in stay.notes
        assert "Eau Chaude Sanitaire 52°C" in stay.notes
        assert "Chauffage Presbytère Coupé" in stay.notes
        assert "Hors-gel" not in stay.notes


def test_dynamic_lead_hours_calculation(db_session):
    """
    Vérifie la formule physique d'anticipation dynamique (lead_hours) selon
    la température ambiante (room_temp) et extérieure (outside_temp) :
    - À 12°C ext et delta 3°C (18°C -> 21°C) : heating_rate = 1.20°C/h -> lead_hours = 0.5 + 3.0/1.2 = 3.0h
    - À 0°C ext et delta 3°C : heating_rate = 1.20 - 0.045*12 = 0.66°C/h -> lead_hours = 0.5 + 3.0/0.66 = 5.05h
    - À -10°C ext et delta 5°C : heating_rate clippé à 0.40°C/h -> lead_hours = 0.5 + 5.0/0.4 = 13.0h
    - Déjà chaud (delta 0°C) avec ECS : min_lead = 2.0h
    """
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    tz_paris = ZoneInfo("Europe/Paris")
    now_paris = datetime.now(tz_paris)

    # Création du setting thermique à 21.0°C
    setting = db_session.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating", mode="standby", target_temperature=21.0)
        db_session.add(setting)
    else:
        setting.target_temperature = 21.0
    db_session.commit()

    # Réservation future (dans 24h) pour observer lead_hours calculé dans evaluated_stays
    arrival_dt = now_paris + timedelta(hours=24)
    departure_dt = arrival_dt + timedelta(days=2)

    stay = Reservation(
        property_id=2,
        property_name="Presbytère",
        user_name="Henri Jamet",
        year=arrival_dt.year,
        week_number=arrival_dt.isocalendar()[1],
        start_date=arrival_dt.strftime("%Y-%m-%d"),
        end_date=departure_dt.strftime("%Y-%m-%d"),
        arrival_time=arrival_dt.strftime("%H:%M"),
        departure_time=departure_dt.strftime("%H:%M"),
        status="Confirmée",
        notes="Séjour futur - Chauffage Presbytère"
    )
    db_session.add(stay)
    db_session.commit()

    # 1. Cas 12°C ext, 18°C intérieur -> delta 3.0°C -> 3.00h
    status_12 = {"room_temperature": 18.0, "outside_temperature": 12.0}
    with patch.object(ViCareService, "get_status", return_value=status_12), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):
        res = evaluate_and_sync_stay_heating(db_session, force_sync=False)
        evaluated = [s for s in res["evaluated_stays"] if s["id"] == stay.id][0]
        assert evaluated["lead_hours"] == 3.0

    # 2. Cas 0°C ext, 18°C intérieur -> delta 3.0°C -> 5.05h (> 3.0h)
    status_0 = {"room_temperature": 18.0, "outside_temperature": 0.0}
    with patch.object(ViCareService, "get_status", return_value=status_0), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):
        res = evaluate_and_sync_stay_heating(db_session, force_sync=False)
        evaluated = [s for s in res["evaluated_stays"] if s["id"] == stay.id][0]
        assert evaluated["lead_hours"] == 5.05
        assert evaluated["lead_hours"] > 3.0

    # 3. Cas grand froid -10°C ext, 16°C intérieur -> delta 5.0°C -> plancher 0.40°C/h -> 13.00h
    status_cold = {"room_temperature": 16.0, "outside_temperature": -10.0}
    with patch.object(ViCareService, "get_status", return_value=status_cold), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):
        res = evaluate_and_sync_stay_heating(db_session, force_sync=False)
        evaluated = [s for s in res["evaluated_stays"] if s["id"] == stay.id][0]
        assert evaluated["lead_hours"] == 13.0

    # 4. Cas déjà à consigne (18°C intérieur pour consigne 18°C) avec ECS -> min_lead = 2.0h
    setting.target_temperature = 18.0
    db_session.commit()
    status_warm = {"room_temperature": 18.0, "outside_temperature": 15.0}
    with patch.object(ViCareService, "get_status", return_value=status_warm), \
         patch.object(ViCareService, "set_mode"), \
         patch.object(ViCareService, "set_temperature"):
        res = evaluate_and_sync_stay_heating(db_session, force_sync=False)
        evaluated = [s for s in res["evaluated_stays"] if s["id"] == stay.id][0]
        assert evaluated["lead_hours"] == 2.0


