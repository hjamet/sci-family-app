import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# 1. FORÇAGE STRICT DE L'ENVIRONNEMENT DE TEST (ZERO LEAKAGE TO SUPABASE)
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["POSTGRES_URL"] = ""
os.environ["EMAIL_TEST_MODE"] = "true"
os.environ["DISABLE_ALL_EMAILS"] = "true"
os.environ["VICARE_TEST_MODE_READ_ONLY"] = "true"
os.environ["KLEREO_TEST_MODE_READ_ONLY"] = "true"
os.environ["RATE_LIMIT_GENERAL_PER_MINUTE"] = "999999"

# Insérer backend dans le path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app.database as db_module
from app.database import Base, get_db
import app.models  # Assure le chargement de tous les modèles SQLAlchemy
from app.main import app
from app.services.drive_service import drive_jail_service

# Moteur SQLite en mémoire partagé avec StaticPool
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)

# Activer les foreign keys SQLite
@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Remplacement chirurgical des objets du module app.database
db_module.engine = test_engine
db_module.SessionLocal = TestingSessionLocal
db_module.SQLALCHEMY_DATABASE_URL = TEST_DATABASE_URL
db_module.is_sqlite = True

# Création initiale de toutes les tables
Base.metadata.create_all(bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def hermetic_resend_mock():
    """
    STRICT HERMETIC MOCK:
    Intercepte TOUT appel sortant vers Resend API pour 100% des tests pytest.
    Garantit 0 requête réseau et 0 email envoyé accidentellement en test.
    """
    import httpx
    real_post = httpx.Client.post
    mock_post = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "mock_conftest_hermetic_resend"}
    mock_resp.text = '{"id": "mock_conftest_hermetic_resend"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


@pytest.fixture(autouse=True)
def isolate_test_database_and_drive():
    """
    Fixture autouse exécutée pour 100% des tests pytest :
    - Re-crée les tables SQLite fraîches pour chaque test
    - Mocke impérativement Google Drive pour empêcher toute requête réseau ou écriture
    - Restaure l'état propre après chaque test
    """
    # 1. Isolation Google Drive (Empêche toute fuite vers Google Drive de production)
    mock_drive = MagicMock()
    mock_drive.is_configured.return_value = False
    mock_drive.list_files.return_value = []
    mock_drive.upload_file.return_value = {"id": "mock_drive_id_123", "name": "mock.pdf"}
    mock_drive.delete_file.return_value = True

    # 2. Reset des tables SQLite en mémoire
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    # 3. Seed minimal obligatoire pour les propriétés et membres de test
    with TestingSessionLocal() as db:
        from app.models import Property, Member
        p1 = Property(id=1, name="Rosings", address="Hellenvilliers", description="Propriété 1")
        p2 = Property(id=2, name="Le Presbytère", address="Hellenvilliers", description="Propriété 2")
        db.add_all([p1, p2])

        members_seed = [
            Member(id=1, prenom="Henri", name="Henri Jamet", email="hellenvillierssci@gmail.com", role="Coordinateur", is_coordinator=True, notif_thermal_changes=True),
            Member(id=2, prenom="Hortense", name="Hortense Jamet", email="hortense@jamet.local", role="Membre Associé", notif_thermal_changes=False),
            Member(id=3, prenom="Marguerite", name="Marguerite Jamet", email="marguerite@jamet.local", role="Membre Associé", notif_thermal_changes=False),
            Member(id=4, prenom="Eugénie", name="Eugénie Jamet", email="eugenie_jamet@yahoo.fr", role="Membre Associé", notif_thermal_changes=False),
            Member(id=5, prenom="Joséphine", name="Joséphine Jamet", email="josephine@jamet.local", role="Coordinatrice Adjointe", is_coordinator=True, notif_thermal_changes=True),
            Member(id=6, prenom="Élisabeth", name="Maman (Élisabeth) Jamet", email="elisabeth@jamet.local", role="Membre Associé", notif_thermal_changes=False),
            Member(id=7, prenom="Frédéric", name="Frédéric Jamet", email="frederic@jamet.local", role="Membre Associé", notif_thermal_changes=False),
        ]
        db.add_all(members_seed)
        db.commit()

    # Client Google Drive mocké par défaut (0 appel réseau vers Google Drive)
    default_mock_service = MagicMock()
    default_mock_service.files.return_value.list.return_value.execute.return_value = {"files": []}
    default_mock_service.files.return_value.create.return_value.execute.return_value = {
        "id": "mock_file_id",
        "name": "mock.pdf",
        "mimeType": "application/pdf",
        "size": 1024,
    }
    default_mock_service.files.return_value.delete.return_value.execute.return_value = {}

    with patch.object(drive_jail_service, "_get_client", return_value=default_mock_service):
        yield

    # Nettoyage
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
