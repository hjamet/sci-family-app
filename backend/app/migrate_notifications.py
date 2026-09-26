import os
import sqlite3
import logging
from sqlalchemy import text, inspect

logger = logging.getLogger("migration")

# Columns with default TRUE (standard operational notifications)
GENERAL_NOTIFICATION_COLUMNS = [
    ("notif_task_assigned", "BOOLEAN DEFAULT TRUE"),
    ("notif_vote_needed", "BOOLEAN DEFAULT TRUE"),
    ("notif_vote_closed", "BOOLEAN DEFAULT TRUE"),
    ("notif_stay_booked", "BOOLEAN DEFAULT TRUE"),
    ("notify_mentions", "BOOLEAN DEFAULT TRUE"),
]

# Column for thermal changes (default FALSE, activated for coordinators)
THERMAL_NOTIFICATION_COLUMN = ("notif_thermal_changes", "BOOLEAN DEFAULT FALSE")


def migrate_sqlite_db(db_path: str = None):
    """
    Idempotent migration for SQLite database:
    1. Adds notif_task_assigned, notif_vote_needed, notif_vote_closed, notif_stay_booked (DEFAULT 1/True)
    2. Adds notif_thermal_changes (DEFAULT 0/False)
    3. Activates notif_thermal_changes = 1 for Henri Jamet (Coordinateur/Gérant)
       and Coordinatrice Adjointe (Joséphine Jamet / Hortense / Marguerite si désignée)
    4. Creates thermal_settings table if missing.
    """
    targets = []
    if db_path:
        targets.append(db_path)
    else:
        # Migrate both backend/sci_family.db and root sci_family.db
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        root_dir = os.path.dirname(base_dir)
        targets.append(os.path.join(base_dir, "sci_family.db"))
        targets.append(os.path.join(root_dir, "sci_family.db"))

    for target in targets:
        if not os.path.exists(target):
            logger.info(f"[MIGRATION SQLite] Database file {target} does not exist. Skipping.")
            continue

        conn = sqlite3.connect(target)
        cursor = conn.cursor()
        try:
            cursor.execute("PRAGMA table_info(members)")
            existing_cols = {row[1] for row in cursor.fetchall()}

            if not existing_cols:
                logger.info(f"[MIGRATION SQLite] Table members does not exist in {target}.")
            else:
                # 1. General columns
                for col_name, col_def in GENERAL_NOTIFICATION_COLUMNS:
                    if col_name not in existing_cols:
                        logger.info(f"[MIGRATION SQLite] Adding column {col_name} to members in {target}.")
                        cursor.execute(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}")
                for col_name, _ in GENERAL_NOTIFICATION_COLUMNS:
                    cursor.execute(f"UPDATE members SET {col_name} = 1 WHERE {col_name} IS NULL")

                # 2. Thermal column
                col_name, col_def = THERMAL_NOTIFICATION_COLUMN
                if col_name not in existing_cols:
                    logger.info(f"[MIGRATION SQLite] Adding column {col_name} to members in {target}.")
                    cursor.execute(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}")

                # Set FALSE by default where NULL
                cursor.execute(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL")

                # Activate TRUE (1) for Henri Jamet (Coordinateur / Gérant)
                cursor.execute(
                    f"UPDATE members SET {col_name} = 1 WHERE "
                    "LOWER(prenom) = 'henri' OR LOWER(name) LIKE '%henri%' "
                    "OR LOWER(role) LIKE '%coordinateur g%' OR LOWER(role) LIKE '%gérant%'"
                )

                # Activate TRUE (1) for Coordinatrice Adjointe (Joséphine, ou Hortense/Marguerite si désignée)
                cursor.execute(
                    f"UPDATE members SET {col_name} = 1 WHERE "
                    "LOWER(prenom) LIKE 'jos%' "
                    "OR LOWER(role) LIKE '%coordinatrice adjointe%' "
                    "OR (LOWER(prenom) IN ('hortense', 'marguerite') AND LOWER(role) LIKE '%coordinat%')"
                )

            # 3. Create thermal_settings table if missing
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS thermal_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    equipment_type VARCHAR(50) UNIQUE NOT NULL,
                    target_temperature FLOAT,
                    mode VARCHAR(50),
                    filtration_mode VARCHAR(50),
                    updated_by VARCHAR(100),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 4. Also migrate member_settings table if present
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='member_settings'")
            if cursor.fetchone():
                cursor.execute("PRAGMA table_info(member_settings)")
                ms_cols = {row[1] for row in cursor.fetchall()}
                if "notify_thermal_changes" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_thermal_changes BOOLEAN DEFAULT FALSE")
                cursor.execute("UPDATE member_settings SET notify_thermal_changes = 0 WHERE notify_thermal_changes IS NULL")
                if "notify_mentions" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_mentions BOOLEAN DEFAULT TRUE")
                cursor.execute("UPDATE member_settings SET notify_mentions = 1 WHERE notify_mentions IS NULL")
                # Activate for coordinator and assistant
                cursor.execute("""
                    UPDATE member_settings SET notify_thermal_changes = 1
                    WHERE member_id IN (
                        SELECT id FROM members WHERE LOWER(prenom) = 'henri' OR LOWER(prenom) LIKE 'jos%' OR LOWER(role) LIKE '%coordinat%'
                    )
                """)

            conn.commit()
            logger.info(f"[MIGRATION SQLite] Completed successfully on {target}.")
        except Exception as e:
            logger.error(f"[MIGRATION SQLite ERROR] {target}: {e}")
            conn.rollback()
            raise
        finally:
            conn.close()


def migrate_engine(engine):
    """
    Idempotent migration for SQLAlchemy engine (works for both PostgreSQL / Supabase and SQLite).
    """
    dialect_name = engine.dialect.name
    logger.info(f"[MIGRATION] Checking notification columns on engine dialect '{dialect_name}'...")

    with engine.connect() as conn:
        try:
            if dialect_name == "sqlite":
                inspector_query = text("PRAGMA table_info(members)")
                result = conn.execute(inspector_query).fetchall()
                existing_cols = {row[1] for row in result}

                for col_name, col_def in GENERAL_NOTIFICATION_COLUMNS:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}"))
                for col_name, _ in GENERAL_NOTIFICATION_COLUMNS:
                    conn.execute(text(f"UPDATE members SET {col_name} = 1 WHERE {col_name} IS NULL"))

                col_name, col_def = THERMAL_NOTIFICATION_COLUMN
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}"))
                conn.execute(text(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL"))

                # Activate TRUE for Henri Jamet and Coordinatrice Adjointe
                conn.execute(text(
                    f"UPDATE members SET {col_name} = 1 WHERE "
                    "LOWER(prenom) = 'henri' OR LOWER(name) LIKE '%henri%' "
                    "OR LOWER(role) LIKE '%coordinateur g%' OR LOWER(role) LIKE '%gérant%'"
                ))
                conn.execute(text(
                    f"UPDATE members SET {col_name} = 1 WHERE "
                    "LOWER(prenom) LIKE 'jos%' "
                    "OR LOWER(role) LIKE '%coordinatrice adjointe%' "
                    "OR (LOWER(prenom) IN ('hortense', 'marguerite') AND LOWER(role) LIKE '%coordinat%')"
                ))

                # thermal_settings
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS thermal_settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        equipment_type VARCHAR(50) UNIQUE NOT NULL,
                        target_temperature FLOAT,
                        mode VARCHAR(50),
                        filtration_mode VARCHAR(50),
                        updated_by VARCHAR(100),
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.commit()
            else:
                # PostgreSQL (Supabase)
                for col_name, col_def in GENERAL_NOTIFICATION_COLUMNS:
                    conn.execute(text(f"ALTER TABLE members ADD COLUMN IF NOT EXISTS {col_name} {col_def};"))
                for col_name, _ in GENERAL_NOTIFICATION_COLUMNS:
                    conn.execute(text(f"UPDATE members SET {col_name} = TRUE WHERE {col_name} IS NULL;"))

                # Thermal notification column
                col_name, col_def = THERMAL_NOTIFICATION_COLUMN
                conn.execute(text(f"ALTER TABLE members ADD COLUMN IF NOT EXISTS {col_name} {col_def};"))
                conn.execute(text(f"UPDATE members SET {col_name} = FALSE WHERE {col_name} IS NULL;"))

                # Activate TRUE for Henri Jamet and Coordinatrice Adjointe
                conn.execute(text(
                    f"UPDATE members SET {col_name} = TRUE WHERE "
                    "LOWER(prenom) = 'henri' OR LOWER(name) LIKE '%henri%' "
                    "OR LOWER(role) LIKE '%coordinateur g%' OR LOWER(role) LIKE '%gérant%';"
                ))
                conn.execute(text(
                    f"UPDATE members SET {col_name} = TRUE WHERE "
                    "LOWER(prenom) LIKE 'jos%' "
                    "OR LOWER(role) LIKE '%coordinatrice adjointe%' "
                    "OR (LOWER(prenom) IN ('hortense', 'marguerite') AND LOWER(role) LIKE '%coordinat%');"
                ))

                # thermal_settings table in Postgres
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS thermal_settings (
                        id SERIAL PRIMARY KEY,
                        equipment_type VARCHAR(50) UNIQUE NOT NULL,
                        target_temperature FLOAT,
                        mode VARCHAR(50),
                        filtration_mode VARCHAR(50),
                        updated_by VARCHAR(100),
                        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    );
                """))

                # member_settings notify_mentions
                try:
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("UPDATE member_settings SET notify_mentions = TRUE WHERE notify_mentions IS NULL;"))
                except Exception as ms_mig_err:
                    logger.debug(f"[MIGRATION NOTICE] member_settings notice: {ms_mig_err}")

                # admin_documents drive_file_id
                try:
                    conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);"))
                except Exception as doc_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] admin_documents drive_file_id notice: {doc_mig_err}")

                # Refresh users view if exists
                try:
                    conn.execute(text("CREATE OR REPLACE VIEW users AS SELECT * FROM members;"))
                except Exception as view_err:
                    logger.warning(f"[MIGRATION VIEW NOTICE] Could not refresh view users: {view_err}")

                conn.commit()
            logger.info(f"[MIGRATION] Successfully updated members notification columns on {dialect_name}.")
        except Exception as e:
            logger.error(f"[MIGRATION ERROR] Failed on {dialect_name}: {e}")
            conn.rollback()
            raise


if __name__ == "__main__":
    import sys
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from dotenv import load_dotenv
    load_dotenv(os.path.join(backend_dir, ".env"))

    # 1. Migrate SQLite
    print("--- 1. Migrating local SQLite sci_family.db ---")
    migrate_sqlite_db()

    # 2. Migrate remote Supabase PostgreSQL via DATABASE_URL
    print("--- 2. Migrating database via SQLAlchemy engine (DATABASE_URL) ---")
    from app.database import engine
    migrate_engine(engine)
    print("--- Migration completed successfully! ---")
