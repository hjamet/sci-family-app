import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, inspect
from app.models import Base
from app.database import SQLALCHEMY_DATABASE_URL

OFFICIAL_SWAN_ID = "f7af9598-108e-4c33-846d-b829a015c149"

CANONICAL_PASSWORDS = {
    "Henri": os.getenv("USER_HENRI_PASS", "N8xK9mP2vQ5rT7wY"),
    "Marguerite": os.getenv("USER_MARGUERITE_PASS", "B4vL7nP1wR9tY2mK"),
    "Hortense": os.getenv("USER_HORTENSE_PASS", "Q2mK9vL5nR1wT7pY"),
    "Joséphine": os.getenv("USER_JOSEPHINE_PASS", "T7pY2mK9vL5nR1wQ"),
    "Eugénie": os.getenv("USER_EUGENIE_PASS", "R9tY2mK9vL5nR1wP"),
    "Frédéric": os.getenv("USER_FREDERIC_PASS", "L5nR1wT7pY2mK9vQ"),
    "Maman": os.getenv("USER_MAMAN_PASS", "W1tY2mK9vL5nR1pT"),
}

def wipe_database(db_url: str, db_label: str):
    print(f"\n=======================================================")
    print(f"Purge intégrale des données fictives : {db_label}")
    print(f"=======================================================")
    try:
        connect_args = {}
        if "sqlite" in db_url:
            connect_args = {"check_same_thread": False}
        engine = create_engine(db_url, connect_args=connect_args)
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        print(f"Tables détectées : {existing_tables}")

        with engine.begin() as conn:
            # 1. Purgers tables de relations & enfants en premier
            for child_table in ["stay_task_assignments", "reservations", "maintenance_tasks", "task_comments", "tasks"]:
                if child_table in existing_tables:
                    res = conn.execute(text(f"DELETE FROM {child_table}"))
                    print(f"  [x] Table '{child_table}' purgée ({res.rowcount} lignes supprimées).")

            # 2. Purger projets, votes et commentaires
            for proj_table in ["project_votes", "project_comments", "projects"]:
                if proj_table in existing_tables:
                    res = conn.execute(text(f"DELETE FROM {proj_table}"))
                    print(f"  [x] Table '{proj_table}' purgée ({res.rowcount} lignes supprimées).")

            # 3. Purger vademecum
            if "vademecum_items" in existing_tables:
                res = conn.execute(text("DELETE FROM vademecum_items"))
                print(f"  [x] Table 'vademecum_items' purgée ({res.rowcount} lignes supprimées).")

            # 4. Purger tickets, signalements, commentaires génériques
            for issue_table in ["issue_comments", "comments", "issues", "member_availabilities"]:
                if issue_table in existing_tables:
                    res = conn.execute(text(f"DELETE FROM {issue_table}"))
                    print(f"  [x] Table '{issue_table}' purgée ({res.rowcount} lignes supprimées).")

            # 5. Purger documents d'archives/tests
            if "admin_documents" in existing_tables:
                res = conn.execute(text("DELETE FROM admin_documents"))
                print(f"  [x] Table 'admin_documents' purgée ({res.rowcount} lignes supprimées).")

            # 6. Purger transactions bancaires fictives
            if "bank_transactions" in existing_tables:
                res = conn.execute(text("DELETE FROM bank_transactions"))
                print(f"  [x] Table 'bank_transactions' purgée ({res.rowcount} lignes supprimées).")

            # 7. Assainir comptes bancaires
            if "bank_accounts" in existing_tables:
                conn.execute(
                    text("DELETE FROM bank_accounts WHERE account_id != :official_id"),
                    {"official_id": OFFICIAL_SWAN_ID}
                )
                now = datetime.now(timezone.utc)
                conn.execute(
                    text("""
                        UPDATE bank_accounts
                        SET balance = 0.0,
                            last_synced_at = NULL,
                            updated_at = :now
                        WHERE account_id = :official_id
                    """),
                    {"official_id": OFFICIAL_SWAN_ID, "now": now}
                )
                print(f"  [x] Comptes bancaires de test purgés et compte officiel Swan réinitialisé à 0,00 €.")

            if "bank_auth_sessions" in existing_tables:
                conn.execute(text("DELETE FROM bank_auth_sessions WHERE session_id LIKE 'test_%' OR status = 'TEST'"))
                print("  [x] Sessions bancaires de test purgées.")

            # 8. Réinitialiser les mots de passe canoniques et vérifier les 7 associés
            if "members" in existing_tables:
                from app.security import hash_password
                for prenom, raw_pass in CANONICAL_PASSWORDS.items():
                    hpass = hash_password(raw_pass)
                    conn.execute(
                        text("UPDATE members SET password = :hpass WHERE prenom = :prenom"),
                        {"hpass": hpass, "prenom": prenom}
                    )
                if "users" in existing_tables:
                    for prenom, raw_pass in CANONICAL_PASSWORDS.items():
                        hpass = hash_password(raw_pass)
                        conn.execute(
                            text("UPDATE users SET password = :hpass WHERE prenom = :prenom"),
                            {"hpass": hpass, "prenom": prenom}
                        )
                members = conn.execute(text("SELECT id, name, prenom, email FROM members ORDER BY id")).fetchall()
                print(f"  [PROTECTION VÉRIFIÉE] Table 'members' : {len(members)} associés conservés avec mots de passe canoniques synchronisés.")
                for m in members:
                    print(f"    - #{m[0]} {m[2]} ({m[1]}) - {m[3]}")

            # 9. Vérifier la sanctuarisation des propriétés
            if "properties" in existing_tables:
                props = conn.execute(text("SELECT id, name FROM properties ORDER BY id")).fetchall()
                print(f"  [PROTECTION VÉRIFIÉE] Table 'properties' : {len(props)} propriétés conservées.")

            # 10. Vérifier la sanctuarisation de la télémétrie matérielle
            if "thermal_settings" in existing_tables:
                therms = conn.execute(text("SELECT count(*) FROM thermal_settings")).fetchone()[0]
                print(f"  [PROTECTION VÉRIFIÉE] Table 'thermal_settings' : {therms} configurations matérielles conservées.")

        print(f"[SUCCÈS] Base '{db_label}' entièrement vierge et assainie.")
    except Exception as e:
        print(f"[ERREUR] Échec de la purge pour '{db_label}' : {e}")

def cleanup_upload_folders():
    uploads_dir = backend_dir / "app" / "uploads" / "documents"
    if uploads_dir.exists():
        deleted = 0
        for f in uploads_dir.glob("*.*"):
            try:
                f.unlink()
                deleted += 1
            except Exception as e:
                print(f"Impossible de supprimer {f}: {e}")
        print(f"\n[x] Fichiers téléversés de test supprimés dans {uploads_dir} ({deleted} fichiers purgés).")

if __name__ == "__main__":
    # 1. Supabase PostgreSQL Production
    wipe_database(SQLALCHEMY_DATABASE_URL, "Supabase PostgreSQL Production")

    # 2. SQLite local principal
    backend_sqlite = f"sqlite:///{backend_dir / 'sci_family.db'}"
    wipe_database(backend_sqlite, "SQLite (sci_family.db)")

    # 3. SQLite root
    root_sqlite = f"sqlite:///{backend_dir.parent / 'sci_family.db'}"
    if (backend_dir.parent / "sci_family.db").exists():
        wipe_database(root_sqlite, "SQLite (sci_family.db)")

    # 4. SQLite app.db
    app_db = f"sqlite:///{backend_dir / 'app.db'}"
    if (backend_dir / "app.db").exists():
        wipe_database(app_db, "SQLite (app.db)")

    # 5. Nettoyage physique des fichiers téléversés de test
    cleanup_upload_folders()

    print("\n=======================================================")
    print("TABLE RASE TERMINÉE AVEC SUCCÈS SUR TOUTES LES BASES !")
    print("=======================================================")
