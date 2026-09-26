#!/usr/bin/env python3
"""
Migration script: Mise à jour des adresses email réelles des 7 associés
dans SQLite (backend/sci_family.db et root sci_family.db) ET Supabase PostgreSQL.
"""
import os
import sys
import sqlite3
import unicodedata
from dotenv import load_dotenv

# Charger l'environnement
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(env_path)

MEMBER_EMAILS_MAPPING = [
    {
        "prenom_key": "henri",
        "name_key": "henri",
        "id_target": 1,
        "email": "hellenvillierssci@gmail.com",
        "label": "Henri Jamet"
    },
    {
        "prenom_key": "hortense",
        "name_key": "hortense",
        "id_target": 2,
        "email": "hortense_jamet@yahoo.fr",
        "label": "Hortense Jamet"
    },
    {
        "prenom_key": "marguerite",
        "name_key": "marguerite",
        "id_target": 3,
        "email": "marguerite_jamet@yahoo.fr",
        "label": "Marguerite Jamet"
    },
    {
        "prenom_key": "josephine",
        "name_key": "josephine",
        "id_target": 4,
        "email": "josephine_jamet@yahoo.fr",
        "label": "Joséphine Jamet"
    },
    {
        "prenom_key": "eugenie",
        "name_key": "eugenie",
        "id_target": 5,
        "email": "eugenie_jamet@yahoo.fr",
        "label": "Eugénie Jamet"
    },
    {
        "prenom_key": "frederic",
        "name_key": "frederic",
        "id_target": 6,
        "email": "frdjamet@gmail.com",
        "label": "Frédéric Jamet"
    },
    {
        "prenom_key": "maman",
        "name_key": "elisabeth",
        "id_target": 7,
        "email": "elizabeth_jamet@yahoo.fr",
        "label": "Élisabeth / Maman Jamet"
    },
]

def normalize_str(s: str) -> str:
    if not s:
        return ""
    norm = unicodedata.normalize('NFD', s)
    return "".join(c for c in norm if unicodedata.category(c) != 'Mn').lower().strip()

def find_email_for_member(member_id: int, prenom: str, name: str) -> str:
    p_norm = normalize_str(prenom)
    n_norm = normalize_str(name)

    for item in MEMBER_EMAILS_MAPPING:
        # Match by prenom or name
        if item["prenom_key"] in p_norm or item["name_key"] in n_norm or item["prenom_key"] in n_norm:
            return item["email"]
        if "maman" in p_norm or "elisabeth" in n_norm or "elizabeth" in n_norm or "maman" in n_norm:
            if item["prenom_key"] == "maman":
                return item["email"]
    
    # Fallback to id matching
    for item in MEMBER_EMAILS_MAPPING:
        if item["id_target"] == member_id:
            return item["email"]
    
    return None

def migrate_sqlite(db_file: str):
    print(f"\n=======================================================")
    print(f"MIGRATION SQLITE : {db_file}")
    print(f"=======================================================")
    if not os.path.exists(db_file):
        print(f"[SKIP] Fichier introuvable : {db_file}")
        return

    conn = sqlite3.connect(db_file)
    cur = conn.cursor()

    # Vérifier les tables existantes
    cur.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view');")
    tables = {r[0]: r[1] for r in cur.fetchall()}
    print(f"Objets trouvés : {list(tables.keys())}")

    # Mise à jour de la table members
    if "members" in tables:
        cur.execute("SELECT id, prenom, name, email FROM members ORDER BY id;")
        rows = cur.fetchall()
        for mid, prenom, name, old_email in rows:
            new_email = find_email_for_member(mid, prenom, name)
            if new_email:
                cur.execute("UPDATE members SET email = ? WHERE id = ?;", (new_email, mid))
                print(f"  [members] ID {mid} ({prenom} - {name}) : {old_email} -> {new_email}")
        conn.commit()

    # Mise à jour de la table users si c'est une table physique
    if "users" in tables and tables["users"] == "table":
        cur.execute("SELECT id, prenom, name, email FROM users ORDER BY id;")
        rows = cur.fetchall()
        for mid, prenom, name, old_email in rows:
            new_email = find_email_for_member(mid, prenom, name)
            if new_email:
                cur.execute("UPDATE users SET email = ? WHERE id = ?;", (new_email, mid))
                print(f"  [users]   ID {mid} ({prenom} - {name}) : {old_email} -> {new_email}")
        conn.commit()

    # Vérification et affichage certifié
    print("\n--- EXTRAIT BRUT CERTIFIÉ DE LA TABLE 'members' (SQLITE) ---")
    cur.execute("SELECT id, prenom, name, email FROM members ORDER BY id;")
    for r in cur.fetchall():
        print(f"  ID {r[0]} | Prénom: {r[1]:<12} | Nom: {r[2]:<25} | Email: {r[3]}")

    if "users" in tables:
        print("\n--- EXTRAIT BRUT CERTIFIÉ DE LA TABLE/VUE 'users' (SQLITE) ---")
        cur.execute("SELECT id, prenom, name, email FROM users ORDER BY id;")
        for r in cur.fetchall():
            print(f"  ID {r[0]} | Prénom: {r[1]:<12} | Nom: {r[2]:<25} | Email: {r[3]}")

    conn.close()
    print(f"[OK] SQLite {db_file} migré avec succès.")

def migrate_supabase():
    print(f"\n=======================================================")
    print(f"MIGRATION SUPABASE POSTGRESQL VIA DATABASE_URL")
    print(f"=======================================================")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("[ERROR] DATABASE_URL introuvable dans l'environnement / .env")
        return

    from sqlalchemy import create_engine, text
    connect_url = db_url
    if connect_url.startswith("postgres://"):
        connect_url = connect_url.replace("postgres://", "postgresql://", 1)
    if connect_url.startswith("postgresql://") and not connect_url.startswith("postgresql+"):
        try:
            import psycopg2
        except ImportError:
            connect_url = connect_url.replace("postgresql://", "postgresql+pg8000://", 1)

    engine = create_engine(connect_url)

    with engine.connect() as conn:
        # Récupérer les membres existants
        res = conn.execute(text("SELECT id, prenom, name, email FROM members ORDER BY id;"))
        rows = res.fetchall()

        for mid, prenom, name, old_email in rows:
            new_email = find_email_for_member(mid, prenom, name)
            if new_email:
                conn.execute(
                    text("UPDATE members SET email = :email WHERE id = :id;"),
                    {"email": new_email, "id": mid}
                )
                print(f"  [Supabase members] ID {mid} ({prenom} - {name}) : {old_email} -> {new_email}")
        conn.commit()

        # Vérifier si users est une table ou une vue
        v_res = conn.execute(text("SELECT table_name, table_type FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public';"))
        users_info = v_res.fetchone()
        if users_info and users_info[1] == 'BASE TABLE':
            u_res = conn.execute(text("SELECT id, prenom, name, email FROM users ORDER BY id;"))
            for mid, prenom, name, old_email in u_res.fetchall():
                new_email = find_email_for_member(mid, prenom, name)
                if new_email:
                    conn.execute(
                        text("UPDATE users SET email = :email WHERE id = :id;"),
                        {"email": new_email, "id": mid}
                    )
            conn.commit()

        # Vérification et affichage certifié
        print("\n--- EXTRAIT BRUT CERTIFIÉ DE LA TABLE 'members' (SUPABASE POSTGRES) ---")
        res = conn.execute(text("SELECT id, prenom, name, email FROM members ORDER BY id;"))
        for r in res.fetchall():
            print(f"  ID {r[0]} | Prénom: {r[1]:<12} | Nom: {r[2]:<25} | Email: {r[3]}")

        print("\n--- EXTRAIT BRUT CERTIFIÉ DE LA VUE/TABLE 'users' (SUPABASE POSTGRES) ---")
        res = conn.execute(text("SELECT id, prenom, name, email FROM users ORDER BY id;"))
        for r in res.fetchall():
            print(f"  ID {r[0]} | Prénom: {r[1]:<12} | Nom: {r[2]:<25} | Email: {r[3]}")

    print(f"[OK] Supabase PostgreSQL migré avec succès.")

if __name__ == "__main__":
    sqlite_backend = os.path.join(BASE_DIR, "sci_family.db")
    sqlite_root = os.path.abspath(os.path.join(BASE_DIR, "..", "sci_family.db"))
    
    migrate_sqlite(sqlite_backend)
    if os.path.exists(sqlite_root):
        migrate_sqlite(sqlite_root)
    migrate_supabase()
    print("\n[SUCCÈS] Toutes les migrations d'adresses emails ont été exécutées avec succès.")
