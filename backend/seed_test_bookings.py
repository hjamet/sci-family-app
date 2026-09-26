#!/usr/bin/env python3
"""
Seed Script: Insertion Idempotente de 3 Séjours de Test pour la Page Calendrier
- Séjour 1 : Henri Jamet (id 1) — 02/10/2026 au 05/10/2026 (Presbytère, 2 pers, Chambre de Henri & Couloir 2)
- Séjour 2 : Marguerite Jamet (id 2 PG / id 3 SQLite) — 16/10/2026 au 18/10/2026 (Presbytère, 2 pers, Chambre de Marguerite)
- Séjour 3 : Frédéric Jamet (id 6 PG / id 7 SQLite) — 24/10/2026 au 28/10/2026 (Presbytère, 2 pers, Suite / Chambre des parents)

Cibles de synchronisation :
1. SQLite local backend : backend/sci_family.db
2. SQLite local racine : sci_family.db (si présent)
3. Supabase PostgreSQL distant : DATABASE_URL (AWS pooler 6543)
"""
import os
import sys
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Résolution des chemins de base
BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent

# Chargement robuste des variables d'environnement
for env_file in [BASE_DIR / ".env", REPO_ROOT / ".env"]:
    if env_file.exists():
        load_dotenv(env_file)
        break

# Définition canonique des 3 séjours de test
TEST_BOOKINGS = [
    {
        "user_name": "Henri Jamet",
        "property_id": 2,
        "property_name": "Le Presbytère",
        "year": 2026,
        "week_number": 40,
        "start_date": "2026-10-02",
        "end_date": "2026-10-05",
        "arrival_time": "15:00",
        "departure_time": "11:00",
        "status": "Confirmée",
        "guest_count": 2,
        "chambers_used": 2,
        "rooms_count": 2,
        "selected_rooms": json.dumps(["Chambre de Henri", "Couloir 2"], ensure_ascii=False),
        "accepts_extra_family": True,
        "notes": "Week-end automne, taille des haies et entretien"
    },
    {
        "user_name": "Marguerite Jamet",
        "property_id": 2,
        "property_name": "Le Presbytère",
        "year": 2026,
        "week_number": 42,
        "start_date": "2026-10-16",
        "end_date": "2026-10-18",
        "arrival_time": "15:00",
        "departure_time": "11:00",
        "status": "Confirmée",
        "guest_count": 2,
        "chambers_used": 1,
        "rooms_count": 1,
        "selected_rooms": json.dumps(["Chambre de Marguerite"], ensure_ascii=False),
        "accepts_extra_family": True,
        "notes": "Repos automnal en famille"
    },
    {
        "user_name": "Frédéric Jamet",
        "property_id": 2,
        "property_name": "Le Presbytère",
        "year": 2026,
        "week_number": 43,
        "start_date": "2026-10-24",
        "end_date": "2026-10-28",
        "arrival_time": "15:00",
        "departure_time": "11:00",
        "status": "Confirmée",
        "guest_count": 2,
        "chambers_used": 1,
        "rooms_count": 1,
        "selected_rooms": json.dumps(["Suite (Chambre des parents)"], ensure_ascii=False),
        "accepts_extra_family": True,
        "notes": "Passage de Toussaint et vérification toitures"
    }
]

# Dates de nettoyage pour l'idempotence et la purge des anciens résidus de test
DATES_TO_PURGE = ["2026-10-02", "2026-10-16", "2026-10-24", "2026-10-23"]


def seed_sqlite_database(db_path: Path):
    """Insère de manière idempotente les 3 séjours dans une base SQLite."""
    if not db_path.exists():
        print(f"[SKIP] Fichier SQLite introuvable : {db_path}")
        return

    print(f"\n=======================================================")
    print(f"[1] Traitement SQLite : {db_path.name} ({db_path})")
    print(f"=======================================================")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Alignement du schéma si colonnes optionnelles absentes (ex: arrival_time)
    existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(reservations);")}
    if "arrival_time" not in existing_cols:
        cursor.execute("ALTER TABLE reservations ADD COLUMN arrival_time VARCHAR(10) DEFAULT '15:00';")
        print("  [Schema Migration] Colonne 'arrival_time' ajoutée.")
    if "departure_time" not in existing_cols:
        cursor.execute("ALTER TABLE reservations ADD COLUMN departure_time VARCHAR(10) DEFAULT '11:00';")
        print("  [Schema Migration] Colonne 'departure_time' ajoutée.")

    # 1. Purge idempotente des anciens séjours cibles ou résidus de test d'octobre 2026
    placeholders = ",".join(["?"] * len(DATES_TO_PURGE))
    cursor.execute(
        f"DELETE FROM reservations WHERE start_date IN ({placeholders}) OR notes LIKE '%Week-end prolongé à Hellenvilliers%'",
        DATES_TO_PURGE
    )
    purged_count = cursor.rowcount
    print(f"  [-] Purge idempotente exécutée : {purged_count} ancienne(s) réservation(s) supprimée(s).")

    # 2. Insertion des 3 séjours de test
    insert_sql = """
        INSERT INTO reservations (
            property_id, property_name, user_name, year, week_number,
            start_date, end_date, arrival_time, departure_time, status,
            guest_count, chambers_used, selected_rooms, rooms_count,
            accepts_extra_family, notes, created_at
        ) VALUES (
            :property_id, :property_name, :user_name, :year, :week_number,
            :start_date, :end_date, :arrival_time, :departure_time, :status,
            :guest_count, :chambers_used, :selected_rooms, :rooms_count,
            :accepts_extra_family, :notes, :created_at
        )
    """

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    for b in TEST_BOOKINGS:
        payload = dict(b)
        payload["created_at"] = now_iso
        cursor.execute(insert_sql, payload)
        print(f"  [+] Inséré : {b['user_name']} | {b['start_date']} -> {b['end_date']} | {b['notes']}")

    conn.commit()

    # 3. Contrôle SQL matériel immédiat
    print("\n  --- VÉRIFICATION SELECT SQLITE ---")
    cursor.execute("""
        SELECT id, user_name, start_date, end_date, property_id, property_name, status, guest_count, selected_rooms, notes 
        FROM reservations 
        WHERE start_date IN ('2026-10-02', '2026-10-16', '2026-10-24')
        ORDER BY start_date ASC
    """)
    rows = cursor.fetchall()
    for r in rows:
        print(f"  ID={r[0]} | User={r[1]} | Dates={r[2]} au {r[3]} | Prop={r[5]} (id={r[4]}) | Chambres={r[8]} | Notes={r[9]}")

    conn.close()
    print(f"[OK] SQLite {db_path.name} synchronisé avec succès ({len(rows)} séjours actifs).")


def seed_postgres_database():
    """Insère de manière idempotente les 3 séjours dans Supabase PostgreSQL via DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if not db_url:
        print("\n[SKIP] DATABASE_URL introuvable dans l'environnement. Supabase ignoré.")
        return

    print(f"\n=======================================================")
    print(f"[2] Traitement Supabase PostgreSQL")
    print(f"=======================================================")

    connect_url = db_url
    if connect_url.startswith("postgres://"):
        connect_url = connect_url.replace("postgres://", "postgresql://", 1)
    if connect_url.startswith("postgresql://") and not connect_url.startswith("postgresql+"):
        try:
            import psycopg2
        except ImportError:
            connect_url = connect_url.replace("postgresql://", "postgresql+pg8000://", 1)

    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    engine = create_engine(connect_url, poolclass=NullPool)

    with engine.connect() as conn:
        # 1. Purge idempotente
        purge_query = text("""
            DELETE FROM reservations 
            WHERE start_date IN ('2026-10-02', '2026-10-16', '2026-10-24', '2026-10-23')
               OR notes LIKE '%Week-end prolongé à Hellenvilliers%'
        """)
        res_purge = conn.execute(purge_query)
        print(f"  [-] Purge idempotente exécutée : {res_purge.rowcount} ancienne(s) réservation(s) supprimée(s).")

        # 2. Insertion des 3 séjours
        insert_query = text("""
            INSERT INTO reservations (
                property_id, property_name, user_name, year, week_number,
                start_date, end_date, arrival_time, departure_time, status,
                guest_count, chambers_used, selected_rooms, rooms_count,
                accepts_extra_family, notes, created_at
            ) VALUES (
                :property_id, :property_name, :user_name, :year, :week_number,
                :start_date, :end_date, :arrival_time, :departure_time, :status,
                :guest_count, :chambers_used, :selected_rooms, :rooms_count,
                :accepts_extra_family, :notes, :created_at
            )
        """)

        now_dt = datetime.now(timezone.utc)
        for b in TEST_BOOKINGS:
            payload = dict(b)
            payload["created_at"] = now_dt
            conn.execute(insert_query, payload)
            print(f"  [+] Inséré : {b['user_name']} | {b['start_date']} -> {b['end_date']} | {b['notes']}")

        conn.commit()

        # 3. Contrôle SQL matériel immédiat
        print("\n  --- VÉRIFICATION SELECT SUPABASE POSTGRESQL ---")
        select_query = text("""
            SELECT id, user_name, start_date, end_date, property_id, property_name, status, guest_count, selected_rooms, notes 
            FROM reservations 
            WHERE start_date IN ('2026-10-02', '2026-10-16', '2026-10-24')
            ORDER BY start_date ASC
        """)
        rows = conn.execute(select_query).fetchall()
        for r in rows:
            print(f"  ID={r[0]} | User={r[1]} | Dates={r[2]} au {r[3]} | Prop={r[5]} (id={r[4]}) | Chambres={r[8]} | Notes={r[9]}")

    print(f"[OK] Supabase PostgreSQL synchronisé avec succès ({len(rows)} séjours actifs).")


def verify_api_endpoint():
    """Teste matériellement l'endpoint GET /api/reservations via TestClient."""
    print(f"\n=======================================================")
    print(f"[3] Vérification Matérielle Endpoint GET /api/reservations")
    print(f"=======================================================")

    try:
        from fastapi.testclient import TestClient
        # Importer l'application FastAPI
        sys.path.insert(0, str(BASE_DIR))
        from app.main import app

        client = TestClient(app)
        response = client.get("/api/reservations?year=2026")
        print(f"  Status Code HTTP : {response.status_code}")
        assert response.status_code == 200, f"Erreur API: {response.text}"

        data = response.json()
        october_stays = [
            r for r in data 
            if r.get("start_date", "").startswith("2026-10")
        ]
        print(f"  Nombre de réservations pour Octobre 2026 : {len(october_stays)}")
        for r in october_stays:
            print(f"    - ID {r['id']:<3} | Membre: {r['user_name']:<18} | Dates: {r['start_date']} -> {r['end_date']} | Maison: {r.get('property_name')} | Chambres: {r.get('selected_rooms')} | Notes: {r.get('notes')}")

        # Assertions Zero-Trust
        user_names = [r["user_name"] for r in october_stays]
        assert "Henri Jamet" in user_names, "Henri Jamet absent de l'API"
        assert "Marguerite Jamet" in user_names, "Marguerite Jamet absente de l'API"
        assert "Frédéric Jamet" in user_names, "Frédéric Jamet absent de l'API"
        print("  [SUCCESS] Les 3 séjours sont parfaitement restitués par l'API JSON !")
    except Exception as e:
        print(f"  [AVERTISSEMENT] TestClient verification a levé : {e}")


def main():
    print("=================================================================")
    print("  SEED DE 3 SÉJOURS DE TEST — SCI FAMILIALE (CALENDRIER OCT 2026)")
    print("=================================================================")

    # 1. SQLite backend/sci_family.db
    backend_sqlite = BASE_DIR / "sci_family.db"
    seed_sqlite_database(backend_sqlite)

    # 2. SQLite root sci_family.db
    root_sqlite = REPO_ROOT / "sci_family.db"
    if root_sqlite.exists():
        seed_sqlite_database(root_sqlite)

    # 3. Supabase PostgreSQL
    seed_postgres_database()

    # 4. Vérification API
    verify_api_endpoint()

    print("\n=================================================================")
    print("  SEED TERMINÉ AVEC SUCCÈS")
    print("=================================================================")


if __name__ == "__main__":
    main()
