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
            else:
                # PostgreSQL (Supabase)
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS charge_points INTEGER DEFAULT 3;"))
                conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                conn.commit()
    except Exception as exc:
        import logging
        logging.getLogger("sci_api").warning(f"Notice auto-migration database.py (charge_points): {exc}")

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


