import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

# Ensure app is importable
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text
from app.models import (
    Base, Member, Property, Reservation, StayTaskAssignment,
    Task, TaskComment, Project, ProjectVote, ProjectComment,
    Issue, Comment, IssueComment, VademecumItem, BankAccount, BankAuthSession
)
from app.database import SQLALCHEMY_DATABASE_URL

# Authentic Vademecum data from father's documentation & Klereo note
AUTHENTIC_VADEMECUM = [
    {
        "category": "Wi-Fi & Réseau",
        "title": "Réseau Wi-Fi Domaine (Starlink & Répéteurs)",
        "content": "Accès Internet Starlink très haut débit. Le routeur principal se trouve dans le bureau au rez-de-chaussée de la Villa Rosing, avec couverture dans le salon, la cuisine et la terrasse Sud. Projet d'antenne relais vers le Presbytère.",
        "code_to_copy": "HellenvilliersManoir2026!",
        "importance": "INFO"
    },
    {
        "category": "Accès & Clés",
        "title": "Boîtier à clé sécurisé (Portail Sud) & Trousseau d'Eva",
        "content": "Boîtier à code fixé sur le pilier gauche du portail Sud (Code : 4829). Remettre impérativement le passe dans le boîtier dès l'ouverture.\nTrousseau maître 'Clés d'Eva' situé dans la Maison de Rosines (entrée/tableau des clés) regroupant : 2 clés du Swimming Pool House, 1 clé spéciale de la petite cabane en bois, 1 clé de verrouillage de l'abri télescopique, 2 clés de portail et 2 clés de la maison.",
        "code_to_copy": "4829",
        "importance": "CRITIQUE"
    },
    {
        "category": "Eau & Électricité",
        "title": "Vannes d'arrêt général & Tableau piscine",
        "content": "Robinet d'arrêt général d'eau situé dans le cellier sous l'escalier (et vanne rouge cave buanderie). À FERMER OBLIGATOIREMENT lors de tout départ supérieur à 48h en période hivernale pour éviter le gel.\nDisjoncteur principal au vestibule d'entrée (Linky option Tempo).\nTableau électrique piscine situé dans le Swimming Pool House, immédiatement à droite en entrant par la porte (dérivation 230V/400V depuis le compteur principal de Rosines).",
        "code_to_copy": None,
        "importance": "CRITIQUE"
    },
    {
        "category": "Chauffage & Fioul",
        "title": "Régulation Chauffage ViCare, Fioul & Consignes",
        "content": "PAC Vitocal & chaudière fioul (cuve 3000L, niveau estimé ~2200-2700L). Fournisseur fioul : Éts JOSSE.\nThermostat d'ambiance : régler sur 19.5°C lors des séjours (maximum 20.0°C autorisé par la charte des associés). Basculer obligatoirement sur 12.0°C (mode Hors-Gel) dès le départ. Fermer les radiateurs des chambres et de l'étage inoccupés pour limiter la consommation.",
        "code_to_copy": None,
        "importance": "IMPORTANT"
    },
    {
        "category": "Équipements & Notice",
        "title": "Piscine Klereo, Abri ABBA & Protocole Hivernage",
        "content": "Bassin de Rosines 10x4m (~60-80 m³), abri télescopique haut motorisé ABBA.\nTélécommande principale ABBA dans le pool house / maison. Double de secours posé à l'intérieur de la petite cabane en bois tout au fond du jardin.\nContrat d'entretien DECLERCQ PISCINES (100% pris en charge par Frédéric Jamet jusqu'au 31/12/2026).\nProtocole hiver : maintien de la pompe de filtration en heures creuses 2h/jour (03h00-06h00), PAC piscine coupée (chauffage déconseillé/proscrit en hiver). Trop-plein gravitaire situé sous la plaque enterrée dans le gazon à gauche du bassin.",
        "code_to_copy": None,
        "importance": "IMPORTANT"
    },
    {
        "category": "Déchets & Recyclage",
        "title": "Consignes de Départ, Poubelles & Tri sélectif",
        "content": "Au départ : baisser la consigne chauffage à 12°C, fermer les radiateurs d'étage, fermer la vanne d'eau si absence >48h en hiver, vider les réfrigérateurs.\nBacs de collecte à déposer au point de ramassage Mesnil-sur-Iton (poubelle jaune recyclage mardi soir, poubelle noire ordures ménagères jeudi soir).",
        "code_to_copy": None,
        "importance": "INFO"
    },
    {
        "category": "Équipements & Notice",
        "title": "Fosses Septiques & Entretien Tuyauterie",
        "content": "Deux fosses distinctes : fosse de la Maison de Rosines (plaque béton près de l'escalier extérieur) et fosse du Presbytère.\nVidange à planifier tous les 2 ans maximum (signaux : mauvaises odeurs ou difficulté à tirer la chasse d'eau).\nTraitement ponctuel des odeurs / tuyaux : verser environ 5L d'acide chlorhydrique, attendre 5 minutes maximum, puis tirer la chasse d'eau pour rincer abondamment. Proscrire absolument les déboucheurs agressifs type Vigor ou soude caustique.",
        "code_to_copy": None,
        "importance": "IMPORTANT"
    },
    {
        "category": "Urgence",
        "title": "Numéros d'Urgence & Artisans Référents",
        "content": "Chauffage & Plomberie : Éts JOSSE SAS (02 32 35 12 00).\nPisciniste & SAV : DECLERCQ PISCINES (Aurélie Beauvent).\nÉlectricien : SARL Elec Chambray.\nPompiers : 18 • SAMU : 15 • Urgences médicales : 112 / 116 117 • Pharmacie de garde Mesnil-sur-Iton.",
        "code_to_copy": "02 32 35 12 00",
        "importance": "CRITIQUE"
    }
]

def clean_database(engine_url: str, label: str):
    print(f"\n==========================================")
    print(f" Nettoyage Table Rase : {label}")
    print(f" URL: {engine_url[:45]}...")
    print(f"==========================================")
    
    engine = create_engine(engine_url)
    
    # 1. Create missing tables
    Base.metadata.create_all(bind=engine)
    
    with engine.begin() as conn:
        # 2. Vider réservations
        conn.execute(text("DELETE FROM stay_task_assignments"))
        conn.execute(text("DELETE FROM reservations"))
        print("  [x] Réservations et affectations vidées.")
        
        # 3. Vider tâches et commentaires
        conn.execute(text("DELETE FROM task_comments"))
        conn.execute(text("DELETE FROM tasks"))
        print("  [x] Tâches et commentaires de tâches vidés.")
        
        # 4. Vider votes, projets et commentaires
        conn.execute(text("DELETE FROM project_votes"))
        conn.execute(text("DELETE FROM project_comments"))
        conn.execute(text("DELETE FROM projects"))
        print("  [x] Votes et projets vidés.")
        
        # 5. Vider issues
        conn.execute(text("DELETE FROM issue_comments"))
        conn.execute(text("DELETE FROM comments"))
        conn.execute(text("DELETE FROM issues"))
        print("  [x] Signalements/issues vidés.")
        
        # 6. S'assurer que Property 1 existe
        prop = conn.execute(text("SELECT id FROM properties LIMIT 1")).fetchone()
        prop_id = 1
        if not prop:
            conn.execute(text(
                "INSERT INTO properties (id, name, address, description, total_chambers) "
                "VALUES (1, 'Domaine d''Hellenvilliers', 'Mesnil-sur-Iton, Normandie', 'Propriété familiale de la SCI Hellenvilliers', 5)"
            ))
            print("  [x] Propriété Domaine d'Hellenvilliers initialisée (id=1).")
        else:
            prop_id = prop[0]
            
        # 7. Vademecum original
        conn.execute(text("DELETE FROM vademecum_items"))
        from datetime import datetime
        now = datetime.utcnow()
        for item in AUTHENTIC_VADEMECUM:
            conn.execute(
                text(
                    "INSERT INTO vademecum_items (property_id, category, title, content, code_to_copy, importance, updated_at) "
                    "VALUES (:prop_id, :category, :title, :content, :code_to_copy, :importance, :now)"
                ),
                {
                    "prop_id": prop_id,
                    "category": item["category"],
                    "title": item["title"],
                    "content": item["content"],
                    "code_to_copy": item["code_to_copy"],
                    "importance": item["importance"],
                    "now": now
                }
            )
        print(f"  [x] Vadémécum original synchronisé ({len(AUTHENTIC_VADEMECUM)} fiches authentiques).")
        
        # 8. S'assurer de l'initialisation du compte bancaire Swan France via Enable Banking
        bank_acc = conn.execute(text("SELECT id FROM bank_accounts WHERE account_id = 'f7af9598-108e-4c33-846d-b829a015c149'")).fetchone()
        if not bank_acc:
            conn.execute(
                text(
                    "INSERT INTO bank_accounts (account_id, name, iban, currency, balance, balance_type, aspsp_name, session_id, created_at, updated_at) "
                    "VALUES ('f7af9598-108e-4c33-846d-b829a015c149', 'Compte Courant SCI Hellenvilliers (Indy / Swan)', 'FR76 1732 8000 0100 0000 0000 00', 'EUR', 0.0, 'interimAvailable', 'Swan', '4b6c7aaa-8404-4979-9648-f0bfcf019fdc', :now, :now)"
                ),
                {"now": now}
            )
            print("  [x] Compte bancaire Swan France (f7af9598-...) initialisé.")
        else:
            print("  [x] Compte bancaire Swan France déjà présent.")

            
        # 9. Vérifier les 7 membres
        members_count = conn.execute(text("SELECT count(*) FROM members")).fetchone()[0]
        print(f"  [x] Associés conservés dans 'members' : {members_count}/7.")


if __name__ == "__main__":
    # 1. Supabase Postgres
    clean_database(SQLALCHEMY_DATABASE_URL, "Supabase PostgreSQL Production")
    
    # 2. SQLite backend/sci_family.db
    backend_sqlite = f"sqlite:///{backend_dir / 'sci_family.db'}"
    clean_database(backend_sqlite, "SQLite backend/sci_family.db")
    
    # 3. SQLite root sci_family.db
    root_sqlite = f"sqlite:///{backend_dir.parent / 'sci_family.db'}"
    if (backend_dir.parent / 'sci_family.db').exists():
        clean_database(root_sqlite, "SQLite root sci_family.db")
        
    print("\n[SUCCESS] Table rase achevee avec succes sur toutes les bases de donnees !")
