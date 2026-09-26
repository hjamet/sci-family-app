import os
import sqlite3
import logging
from sqlalchemy import text, inspect

logger = logging.getLogger("migration")

NOTIFICATION_COLUMNS = [
    ("notif_task_assigned", "BOOLEAN DEFAULT TRUE"),
    ("notif_vote_needed", "BOOLEAN DEFAULT TRUE"),
    ("notif_vote_closed", "BOOLEAN DEFAULT TRUE"),
    ("notif_stay_booked", "BOOLEAN DEFAULT TRUE")
]

def migrate_sqlite_db(db_path: str = None):
    """
    Idempotent migration for SQLite database:
    Adds notif_task_assigned, notif_vote_needed, notif_vote_closed, notif_stay_booked
    to the members table and ensures all 7 authentic associates have them set to 1 (True).
    """
    if not db_path:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(base_dir, "sci_family.db")

    if not os.path.exists(db_path):
        logger.info(f"[MIGRATION SQLite] Database file {db_path} does not exist yet. Skipping.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(members)")
        existing_cols = {row[1] for row in cursor.fetchall()}

        if not existing_cols:
            logger.info("[MIGRATION SQLite] Table members does not exist in SQLite DB.")
            return

        for col_name, col_def in NOTIFICATION_COLUMNS:
            if col_name not in existing_cols:
                logger.info(f"[MIGRATION SQLite] Adding column {col_name} to members table.")
                cursor.execute(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}")

        # Ensure all existing members have True (1)
        for col_name, _ in NOTIFICATION_COLUMNS:
            cursor.execute(f"UPDATE members SET {col_name} = 1 WHERE {col_name} IS NULL")

        conn.commit()
        logger.info("[MIGRATION SQLite] Notification preference columns successfully applied to SQLite.")
    except Exception as e:
        logger.error(f"[MIGRATION SQLite ERROR] {e}")
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

                for col_name, col_def in NOTIFICATION_COLUMNS:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}"))
                for col_name, _ in NOTIFICATION_COLUMNS:
                    conn.execute(text(f"UPDATE members SET {col_name} = 1 WHERE {col_name} IS NULL"))
                conn.commit()
            else:
                # PostgreSQL (Supabase)
                for col_name, col_def in NOTIFICATION_COLUMNS:
                    conn.execute(text(f"ALTER TABLE members ADD COLUMN IF NOT EXISTS {col_name} {col_def};"))
                for col_name, _ in NOTIFICATION_COLUMNS:
                    conn.execute(text(f"UPDATE members SET {col_name} = TRUE WHERE {col_name} IS NULL;"))
                
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
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
    
    # 1. Migrate SQLite
    print("--- 1. Migrating local SQLite sci_family.db ---")
    migrate_sqlite_db()

    # 2. Migrate remote Supabase PostgreSQL via DATABASE_URL
    print("--- 2. Migrating database via SQLAlchemy engine (DATABASE_URL) ---")
    from app.database import engine
    migrate_engine(engine)
    print("--- Migration completed successfully! ---")
