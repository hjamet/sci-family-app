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
    # Using NullPool prevents stale connections across serverless lambda freezes
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        poolclass=NullPool
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

