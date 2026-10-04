import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

# Determine database URL:
# 1. DATABASE_URL or POSTGRES_URL from environment (e.g. Supabase Postgres Pooler port 6543)
# 2. Fallback to local SQLite database (sci_family.db)
raw_db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")

if raw_db_url:
    # Normalize postgres:// to postgresql://
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
    
    # If using postgresql:// without explicit driver, check if pg8000 should be used
    if raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+"):
        try:
            import psycopg2
            SQLALCHEMY_DATABASE_URL = raw_db_url
        except ImportError:
            # Fall back to pure-Python pg8000 driver (reliable on Vercel / serverless)
            SQLALCHEMY_DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+pg8000://", 1)
    else:
        SQLALCHEMY_DATABASE_URL = raw_db_url
else:
    default_db = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sci_family.db")
    db_path = os.getenv("DATABASE_PATH", default_db)
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

# Detect if dialect is SQLite
is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

    # Enable WAL mode and foreign keys for SQLite only
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()
else:
    # PostgreSQL configuration (Supabase Pooler port 6543 / Supavisor / Serverless)
    # Un pool léger avec pool_pre_ping et pool_recycle réutilise la connexion TCP/SSL
    # pendant la durée de vie du warm container (économisant 600ms à 1000ms par requête),
    # tout en évitant les connexions périmées ou coupées par Supavisor.
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_recycle=300,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db(target_engine=None):
    """
    Migration automatique et sécurisée du schéma de base de données.
    Vérifie et applique les migrations structurelles indispensables (ex: charge_points sur tasks).
    Garantit l'absence d'erreur 500 sur les endpoints /api/tasks et /api/workload/summary.
    """
    eng = target_engine or engine
    from sqlalchemy import text
    try:
        with eng.connect() as conn:
            if eng.dialect.name == "sqlite":
                check_table = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")).fetchone()
                if check_table:
                    cursor = conn.execute(text("PRAGMA table_info(tasks)"))
                    existing_cols = {row[1] for row in cursor.fetchall()}
                    if "charge_points" not in existing_cols:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN charge_points INTEGER DEFAULT 3;"))
                        conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                        conn.commit()
                    if "key_values" not in existing_cols:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN key_values TEXT;"))
                        conn.commit()
                    if "custom_fields" not in existing_cols:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN custom_fields TEXT DEFAULT '[]';"))
                        conn.commit()

                check_projects = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")).fetchone()
                if check_projects:
                    cursor_p = conn.execute(text("PRAGMA table_info(projects)"))
                    existing_proj_cols = {row[1] for row in cursor_p.fetchall()}
                    if "key_values" not in existing_proj_cols:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN key_values TEXT;"))
                        conn.commit()
                    if "custom_fields" not in existing_proj_cols:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN custom_fields TEXT DEFAULT '[]';"))
                        conn.commit()
                # Migrations Trésorerie & Dépenses (SQLite)
                check_ledger = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='member_ledger_entries'")).fetchone()
                if not check_ledger:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS member_ledger_entries (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                            entry_type VARCHAR(50) NOT NULL,
                            amount FLOAT NOT NULL,
                            balance_after FLOAT,
                            entry_date DATETIME NOT NULL,
                            description VARCHAR(255),
                            expense_id INTEGER REFERENCES member_expenses(id) ON DELETE SET NULL,
                            bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
                            call_for_funds_id INTEGER REFERENCES calls_for_funds(id) ON DELETE SET NULL,
                            created_at DATETIME,
                            updated_at DATETIME
                        );
                    """))
                    conn.commit()

                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_member_ledger_entries_bank_tx ON member_ledger_entries (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_member_ledger_entries_expense_id ON member_ledger_entries (expense_id) WHERE expense_id IS NOT NULL;"))
                conn.commit()

                check_expenses = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='member_expenses'")).fetchone()
                if check_expenses:
                    cursor_exp = conn.execute(text("PRAGMA table_info(member_expenses)"))
                    existing_exp_cols = {row[1] for row in cursor_exp.fetchall()}
                    if "task_id" not in existing_exp_cols:
                        conn.execute(text("ALTER TABLE member_expenses ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;"))
                        conn.commit()
                    if "rejection_reason" not in existing_exp_cols:
                        conn.execute(text("ALTER TABLE member_expenses ADD COLUMN rejection_reason TEXT;"))
                        conn.commit()

                check_members = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='members'")).fetchone()
                if check_members:
                    cursor_mem = conn.execute(text("PRAGMA table_info(members)"))
                    existing_mem_cols = {row[1] for row in cursor_mem.fetchall()}
                    if "payment_reference" not in existing_mem_cols:
                        conn.execute(text("ALTER TABLE members ADD COLUMN payment_reference VARCHAR(50);"))
                        conn.commit()

                check_calls = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='calls_for_funds'")).fetchone()
                if check_calls:
                    cursor_calls = conn.execute(text("PRAGMA table_info(calls_for_funds)"))
                    existing_calls_cols = {row[1] for row in cursor_calls.fetchall()}
                    if "balance_before" not in existing_calls_cols:
                        conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN balance_before FLOAT DEFAULT 0.0;"))
                        conn.commit()
                    if "amount_due" not in existing_calls_cols:
                        conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN amount_due FLOAT DEFAULT 50.0;"))
                        conn.commit()
                    if "bank_transaction_id" not in existing_calls_cols:
                        conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN bank_transaction_id INTEGER;"))
                        conn.commit()
                    if "paid_at" not in existing_calls_cols:
                        conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN paid_at DATETIME;"))
                        conn.commit()
            else:
                # PostgreSQL (Supabase)
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS charge_points INTEGER DEFAULT 3;"))
                conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key_values TEXT;"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_values TEXT;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '[]';"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_fields TEXT DEFAULT '[]';"))

                # Migrations Trésorerie & Dépenses (PostgreSQL Supabase)
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS member_ledger_entries (
                        id SERIAL PRIMARY KEY,
                        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                        entry_type VARCHAR(50) NOT NULL,
                        amount FLOAT NOT NULL,
                        balance_after FLOAT,
                        entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        description VARCHAR(255),
                        expense_id INTEGER REFERENCES member_expenses(id) ON DELETE SET NULL,
                        bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
                        call_for_funds_id INTEGER REFERENCES calls_for_funds(id) ON DELETE SET NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_ledger_entries_member_id ON member_ledger_entries (member_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_ledger_entries_bank_tx ON member_ledger_entries (bank_transaction_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_ledger_entries_call ON member_ledger_entries (call_for_funds_id);"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_member_ledger_entries_bank_tx ON member_ledger_entries (bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_member_ledger_entries_expense_id ON member_ledger_entries (expense_id) WHERE expense_id IS NOT NULL;"))

                conn.execute(text("ALTER TABLE member_expenses ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;"))
                conn.execute(text("ALTER TABLE member_expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(50);"))
                conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN IF NOT EXISTS balance_before FLOAT DEFAULT 0.0;"))
                conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN IF NOT EXISTS amount_due FLOAT DEFAULT 50.0;"))
                conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN IF NOT EXISTS bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL;"))
                conn.execute(text("ALTER TABLE calls_for_funds ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;"))

                conn.commit()

            # Normalisation et synchronisation des payment_reference pour chaque membre
            try:
                import unicodedata
                mem_rows = conn.execute(text("SELECT id, prenom, name, payment_reference FROM members")).fetchall()
                for r in mem_rows:
                    m_id, m_prenom, m_name, m_pref = r[0], r[1], r[2], r[3]
                    if not m_pref or not m_pref.strip():
                        raw_tag = m_prenom or m_name or f"MEMBRE{m_id}"
                        # Dé-accentuer et nettoyer
                        clean_tag = unicodedata.normalize('NFKD', raw_tag).encode('ASCII', 'ignore').decode('utf-8')
                        clean_tag = "".join(c for c in clean_tag if c.isalnum()).upper()
                        pref = f"HLV-{clean_tag}"
                        conn.execute(
                            text("UPDATE members SET payment_reference = :pref WHERE id = :id"),
                            {"pref": pref, "id": m_id}
                        )
                conn.commit()
            except Exception as sync_pref_err:
                pass

    except Exception as exc:
        import logging
        logging.getLogger("sci_api").warning(f"Notice auto-migration database.py (charge_points): {exc}")

    try:
        from .onboarding_service import run_onboarding_migrations
        run_onboarding_migrations(eng)
    except Exception as exc:
        import logging
        logging.getLogger("sci_api").warning(f"Notice auto-migration database.py (onboarding): {exc}")

    try:
        from .migrate_notifications import migrate_engine
        migrate_engine(eng)
    except Exception as exc:
        import logging
        logging.getLogger("sci_api").warning(f"Notice auto-migration database.py (notifications/members): {exc}")

    try:
        with eng.connect() as conn:
            conn.execute(text("""
                UPDATE tasks
                SET status = 'TODO'
                WHERE (
                    id IN (SELECT task_id FROM member_expenses WHERE task_id IS NOT NULL)
                    OR key_values LIKE '%"expense_id"%'
                )
                  AND status = 'PROPOSED';
            """))
            conn.commit()
    except Exception as mig_tasks_err:
        pass

# Auto-migration au chargement du module
try:
    init_db(engine)
except Exception:
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


