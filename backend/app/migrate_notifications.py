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
    ("notify_mention_all", "BOOLEAN DEFAULT TRUE"),
    ("notif_new_invoices", "BOOLEAN DEFAULT TRUE"),
]

# Column for thermal changes (default FALSE, activated for coordinators)
THERMAL_NOTIFICATION_COLUMN = ("notif_thermal_changes", "BOOLEAN DEFAULT FALSE")

# Columns for coordinator vote options (default FALSE)
COORDINATOR_VOTE_COLUMNS = [
    ("notify_vote_creation", "BOOLEAN DEFAULT FALSE"),
    ("notify_vote_arbitration", "BOOLEAN DEFAULT FALSE"),
]


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

                # Set FALSE (0) by default for ALL members without exception
                cursor.execute(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL")
                logger.info(f"[MIGRATION SQLite] {col_name} initialized to 0 (default off) for all members.")

                # 2bis. Coordinator vote columns
                for col_name, col_def in COORDINATOR_VOTE_COLUMNS:
                    if col_name not in existing_cols:
                        logger.info(f"[MIGRATION SQLite] Adding column {col_name} to members in {target}.")
                        cursor.execute(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}")
                    cursor.execute(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL")

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

            # 4. Create notifications table if missing
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    type VARCHAR(50) DEFAULT 'info',
                    link_path VARCHAR(255),
                    link_id VARCHAR(100),
                    email_entry TEXT,
                    is_read BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 5. Also migrate member_settings table if present
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
                if "notify_mention_all" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_mention_all BOOLEAN DEFAULT TRUE")
                cursor.execute("UPDATE member_settings SET notify_mention_all = 1 WHERE notify_mention_all IS NULL")
                if "notify_task_creation" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_task_creation BOOLEAN DEFAULT FALSE")
                cursor.execute("UPDATE member_settings SET notify_task_creation = 0 WHERE notify_task_creation IS NULL")
                if "notify_vote_creation" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_vote_creation BOOLEAN DEFAULT FALSE")
                cursor.execute("UPDATE member_settings SET notify_vote_creation = 0 WHERE notify_vote_creation IS NULL")
                if "notify_vote_arbitration" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notify_vote_arbitration BOOLEAN DEFAULT FALSE")
                cursor.execute("UPDATE member_settings SET notify_vote_arbitration = 0 WHERE notify_vote_arbitration IS NULL")
                if "notif_new_invoices" not in ms_cols:
                    cursor.execute("ALTER TABLE member_settings ADD COLUMN notif_new_invoices BOOLEAN DEFAULT TRUE")
                cursor.execute("UPDATE member_settings SET notif_new_invoices = 1 WHERE notif_new_invoices IS NULL")
                # Activate for coordinator and assistant
                cursor.execute("""
                    UPDATE member_settings SET notify_thermal_changes = 1
                    WHERE member_id IN (
                        SELECT id FROM members WHERE LOWER(prenom) = 'henri' OR LOWER(prenom) LIKE 'jos%' OR LOWER(role) LIKE '%coordinat%'
                    )
                """)

            # 5bis. monthly_contribution on members
            cursor.execute("PRAGMA table_info(members)")
            m_cols = {row[1] for row in cursor.fetchall()}
            if "monthly_contribution" not in m_cols:
                cursor.execute("ALTER TABLE members ADD COLUMN monthly_contribution FLOAT DEFAULT 50.0")
            cursor.execute("UPDATE members SET monthly_contribution = 50.0 WHERE monthly_contribution IS NULL")
            # Frédéric paie 1000 € pour le couple parental
            cursor.execute("UPDATE members SET monthly_contribution = 1000.0 WHERE LOWER(email) = 'frdjamet@gmail.com' OR LOWER(prenom) IN ('frédéric', 'frederic')")
            # Maman (Élisabeth) a une quote-part de 0 € (incluse dans les 1000 € du couple avec Frédéric)
            cursor.execute("UPDATE members SET monthly_contribution = 0.0 WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' OR LOWER(prenom) = 'maman'")

            # Nettoyage idempotent : supprimer les écritures d'échéances indues pour Maman au grand livre
            try:
                cursor.execute("""
                    DELETE FROM member_ledger_entries
                    WHERE member_id IN (
                        SELECT id FROM members 
                        WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' 
                           OR LOWER(prenom) = 'maman'
                    )
                    AND entry_type = 'ECHEANCE'
                """)
                cursor.execute("""
                    UPDATE calls_for_funds
                    SET theoretical_contribution = 0.0, net_amount = 0.0, amount_due = 0.0, status = 'COUVERT'
                    WHERE member_id IN (
                        SELECT id FROM members 
                        WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' 
                           OR LOWER(prenom) = 'maman'
                    )
                """)
            except Exception:
                pass

            # 5ter. Create calls_for_funds and member_expenses tables if missing
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS calls_for_funds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reference VARCHAR(50) UNIQUE NOT NULL,
                    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                    member_name VARCHAR(255) NOT NULL,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    period_label VARCHAR(100) NOT NULL,
                    theoretical_contribution FLOAT NOT NULL DEFAULT 50.0,
                    approved_expenses_total FLOAT NOT NULL DEFAULT 0.0,
                    net_amount FLOAT NOT NULL DEFAULT 50.0,
                    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_SWAN_IBAN',
                    iban VARCHAR(100),
                    bic VARCHAR(20),
                    payment_reference VARCHAR(150) NOT NULL,
                    pdf_filename VARCHAR(255),
                    pdf_url VARCHAR(255),
                    details_json TEXT,
                    notification_sent BOOLEAN DEFAULT 0,
                    notification_sent_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_member_period_call UNIQUE (member_id, year, month)
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS member_expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                    member_prenom VARCHAR(100) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    amount FLOAT NOT NULL,
                    expense_date VARCHAR(50) NOT NULL,
                    category VARCHAR(100) NOT NULL DEFAULT 'Entretien & Fournitures',
                    payer_type VARCHAR(50) NOT NULL DEFAULT 'member',
                    status VARCHAR(50) NOT NULL DEFAULT 'VALIDATED',
                    document_id INTEGER REFERENCES admin_documents(id) ON DELETE SET NULL,
                    document_url VARCHAR(255),
                    document_filename VARCHAR(255),
                    call_for_funds_id INTEGER REFERENCES calls_for_funds(id) ON DELETE SET NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            cursor.execute("PRAGMA table_info(member_expenses)")
            me_cols = {row[1] for row in cursor.fetchall()}
            if "payer_type" not in me_cols:
                cursor.execute("ALTER TABLE member_expenses ADD COLUMN payer_type VARCHAR(50) DEFAULT 'member'")
            cursor.execute("UPDATE member_expenses SET payer_type = 'member' WHERE payer_type IS NULL")

            # 6. Migrate tasks table (charge_points) (Annotation 1)
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
            if cursor.fetchone():
                cursor.execute("PRAGMA table_info(tasks)")
                task_cols = {row[1] for row in cursor.fetchall()}
                if "charge_points" not in task_cols:
                    logger.info(f"[MIGRATION SQLite] Adding column charge_points to tasks in {target}.")
                    cursor.execute("ALTER TABLE tasks ADD COLUMN charge_points INTEGER DEFAULT 3")
                    cursor.execute("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL")

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
                # Invariant : notif_thermal_changes est désactivé par défaut (0) pour TOUS les associés sans exception
                conn.execute(text(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL"))

                for col_name, col_def in COORDINATOR_VOTE_COLUMNS:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE members ADD COLUMN {col_name} {col_def}"))
                    conn.execute(text(f"UPDATE members SET {col_name} = 0 WHERE {col_name} IS NULL"))

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

                # notifications table in SQLite
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        type VARCHAR(50) DEFAULT 'info',
                        link_path VARCHAR(255),
                        link_id VARCHAR(100),
                        email_entry TEXT,
                        is_read BOOLEAN DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))

                # SQLite member_settings table if exists
                try:
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN notify_mention_all BOOLEAN DEFAULT 1;"))
                except Exception:
                    pass
                try:
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN notify_vote_creation BOOLEAN DEFAULT 0;"))
                except Exception:
                    pass
                try:
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN notify_vote_arbitration BOOLEAN DEFAULT 0;"))
                except Exception:
                    pass

                # tasks.charge_points in SQLite (Annotation 1)
                try:
                    t_res = conn.execute(text("PRAGMA table_info(tasks)")).fetchall()
                    if t_res:
                        t_cols = {row[1] for row in t_res}
                        if "charge_points" not in t_cols:
                            conn.execute(text("ALTER TABLE tasks ADD COLUMN charge_points INTEGER DEFAULT 3;"))
                            conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                except Exception as t_err:
                    logger.debug(f"[MIGRATION NOTICE] tasks.charge_points notice: {t_err}")

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

                # Coordinator vote columns
                for col_name, col_def in COORDINATOR_VOTE_COLUMNS:
                    conn.execute(text(f"ALTER TABLE members ADD COLUMN IF NOT EXISTS {col_name} {col_def};"))
                    conn.execute(text(f"UPDATE members SET {col_name} = FALSE WHERE {col_name} IS NULL;"))

                # Invariant : notif_thermal_changes est désactivé par défaut (FALSE) pour TOUS les associés sans exception
                conn.execute(text(f"UPDATE members SET {col_name} = FALSE WHERE {col_name} IS NULL;"))

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

                # notifications table in Postgres
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS notifications (
                        id SERIAL PRIMARY KEY,
                        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        type VARCHAR(50) DEFAULT 'info',
                        link_path VARCHAR(255),
                        link_id VARCHAR(100),
                        email_entry TEXT,
                        is_read BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    );
                """))

                # member_settings notifications
                try:
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_task_assigned BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_task_completed BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_vote_required BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_task_chat_activity BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("UPDATE member_settings SET notif_task_chat_activity = FALSE WHERE notif_task_chat_activity IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_vote_chat_activity BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("UPDATE member_settings SET notif_vote_chat_activity = FALSE WHERE notif_vote_chat_activity IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_stay_reminder BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_heating_start BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_heating_stop BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_thermal_changes BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("UPDATE member_settings SET notify_mentions = TRUE WHERE notify_mentions IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_mention_all BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("UPDATE member_settings SET notify_mention_all = TRUE WHERE notify_mention_all IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_task_creation BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("UPDATE member_settings SET notify_task_creation = FALSE WHERE notify_task_creation IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_vote_creation BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("UPDATE member_settings SET notify_vote_creation = FALSE WHERE notify_vote_creation IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notify_vote_arbitration BOOLEAN DEFAULT FALSE;"))
                    conn.execute(text("UPDATE member_settings SET notify_vote_arbitration = FALSE WHERE notify_vote_arbitration IS NULL;"))
                    conn.execute(text("ALTER TABLE member_settings ADD COLUMN IF NOT EXISTS notif_new_invoices BOOLEAN DEFAULT TRUE;"))
                    conn.execute(text("UPDATE member_settings SET notif_new_invoices = TRUE WHERE notif_new_invoices IS NULL;"))
                except Exception as ms_mig_err:
                    logger.debug(f"[MIGRATION NOTICE] member_settings notice: {ms_mig_err}")

                # monthly_contribution on members in Postgres
                try:
                    conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS monthly_contribution FLOAT DEFAULT 50.0;"))
                    conn.execute(text("UPDATE members SET monthly_contribution = 50.0 WHERE monthly_contribution IS NULL;"))
                    conn.execute(text("""
                        UPDATE members 
                        SET monthly_contribution = 1000.0 
                        WHERE LOWER(email) = 'frdjamet@gmail.com' 
                           OR LOWER(prenom) IN ('frédéric', 'frederic');
                    """))
                    conn.execute(text("""
                        UPDATE members 
                        SET monthly_contribution = 0.0 
                        WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' 
                           OR LOWER(prenom) = 'maman';
                    """))

                    # Nettoyage idempotent : supprimer les écritures d'échéances indues pour Maman au grand livre
                    conn.execute(text("""
                        DELETE FROM member_ledger_entries
                        WHERE member_id IN (
                            SELECT id FROM members 
                            WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' 
                               OR LOWER(prenom) = 'maman'
                        )
                        AND entry_type = 'ECHEANCE';
                    """))

                    # Mettre à jour les éventuels appels de fonds antérieurs de Maman pour éviter solde débiteur
                    conn.execute(text("""
                        UPDATE calls_for_funds
                        SET theoretical_contribution = 0.0, net_amount = 0.0, amount_due = 0.0, status = 'COUVERT'
                        WHERE member_id IN (
                            SELECT id FROM members 
                            WHERE LOWER(email) = 'elizabeth_jamet@yahoo.fr' 
                               OR LOWER(prenom) = 'maman'
                        );
                    """))
                    conn.commit()
                except Exception as m_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] members monthly_contribution notice: {m_mig_err}")

                # calls_for_funds table in Postgres
                try:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS calls_for_funds (
                            id SERIAL PRIMARY KEY,
                            reference VARCHAR(50) UNIQUE NOT NULL,
                            member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                            member_name VARCHAR(255) NOT NULL,
                            year INTEGER NOT NULL,
                            month INTEGER NOT NULL,
                            period_label VARCHAR(100) NOT NULL,
                            theoretical_contribution FLOAT NOT NULL DEFAULT 50.0,
                            approved_expenses_total FLOAT NOT NULL DEFAULT 0.0,
                            net_amount FLOAT NOT NULL DEFAULT 50.0,
                            status VARCHAR(50) NOT NULL DEFAULT 'PENDING_SWAN_IBAN',
                            iban VARCHAR(100),
                            bic VARCHAR(20),
                            payment_reference VARCHAR(150) NOT NULL,
                            pdf_filename VARCHAR(255),
                            pdf_url VARCHAR(255),
                            details_json TEXT,
                            notification_sent BOOLEAN DEFAULT FALSE,
                            notification_sent_at TIMESTAMPTZ,
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT uq_member_period_call UNIQUE (member_id, year, month)
                        );
                    """))
                except Exception as cff_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] calls_for_funds notice: {cff_mig_err}")

                # member_expenses table in Postgres
                try:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS member_expenses (
                            id SERIAL PRIMARY KEY,
                            member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                            member_prenom VARCHAR(100) NOT NULL,
                            title VARCHAR(255) NOT NULL,
                            amount FLOAT NOT NULL,
                            expense_date VARCHAR(50) NOT NULL,
                            category VARCHAR(100) NOT NULL DEFAULT 'Entretien & Fournitures',
                            payer_type VARCHAR(50) NOT NULL DEFAULT 'member',
                            status VARCHAR(50) NOT NULL DEFAULT 'VALIDATED',
                            document_id INTEGER REFERENCES admin_documents(id) ON DELETE SET NULL,
                            document_url VARCHAR(255),
                            document_filename VARCHAR(255),
                            call_for_funds_id INTEGER REFERENCES calls_for_funds(id) ON DELETE SET NULL,
                            notes TEXT,
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                        );
                    """))
                    conn.execute(text("ALTER TABLE member_expenses ADD COLUMN IF NOT EXISTS payer_type VARCHAR(50) DEFAULT 'member';"))
                    conn.execute(text("UPDATE member_expenses SET payer_type = 'member' WHERE payer_type IS NULL;"))
                    conn.commit()
                except Exception as me_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] member_expenses notice: {me_mig_err}")

                # admin_documents drive_file_id
                try:
                    conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);"))
                except Exception as doc_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] admin_documents drive_file_id notice: {doc_mig_err}")

                # tasks.charge_points in Postgres (Annotation 1)
                try:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS charge_points INTEGER DEFAULT 3;"))
                    conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                except Exception as task_mig_err:
                    logger.warning(f"[MIGRATION NOTICE] tasks charge_points notice: {task_mig_err}")

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
