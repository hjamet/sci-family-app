import os
from sqlalchemy.orm import Session
from .database import engine, SessionLocal, Base
from .models import Member, Property, BankAccount
from .security import hash_password

def seed_database(db: Session = None, force: bool = False):
    """
    Initialisation sanctuarisée de la base de données :
    - S'assure que les tables existent.
    - S'assure que les 2 propriétés fondamentales (Villa Rosing & Le Presbytère) existent.
    - S'assure que les 7 associés statutaires de la SCI existent.
    - S'assure que le compte Swan officiel existe (solde 0.0).
    - ZÉRO DONNÉE FICTIVE : Aucune tâche, aucun projet, aucun vote, aucune réservation,
      aucune note de vademecum n'est ré-ensemencée.
    """
    should_force = force or os.getenv("FORCE_DB_RESET", "false").lower() == "true"

    if should_force:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    session = db if db is not None else SessionLocal()
    should_close = db is None

    try:
        # 1. Vérification des propriétés
        prop_count = session.query(Property).count()
        if prop_count == 0:
            p1 = Property(
                id=1,
                name="Villa Rosing",
                address="8 rue Ancienne Mairie",
                description="Grande propriété familiale Villa Rosing (8 rue Ancienne Mairie).",
                total_chambers=2
            )
            p2 = Property(
                id=2,
                name="Le Presbytère",
                address="4 rue Ancienne Mairie",
                description="Demeure de charme Le Presbytère (4 rue Ancienne Mairie).",
                total_chambers=5
            )
            session.add_all([p1, p2])
            session.commit()
            print("Propriétés Domaine d'Hellenvilliers initialisées (Villa Rosing, Le Presbytère).")

        # 2. Vérification des 7 associés
        member_count = session.query(Member).count()
        if member_count == 0:
            members = [
                Member(
                    prenom="Henri",
                    name="Henri Jamet",
                    email="hellenvillierssci@gmail.com",
                    password=hash_password(os.getenv("USER_HENRI_PASS") or os.getenv("MEMBER_PASSWORD_HENRI", "N8xK9mP2vQ5rT7wY")),
                    role="Coordinateur Général (Fioul, Chauffage ViCare, CCA)",
                    is_coordinator=True,
                    avatar_color="cyan"
                ),
                Member(
                    prenom="Hortense",
                    name="Hortense Jamet",
                    email="hortense_jamet@yahoo.fr",
                    password=hash_password(os.getenv("USER_HORTENSE_PASS") or os.getenv("MEMBER_PASSWORD_HORTENSE", "Q2mK9vL5nR1wT7pY")),
                    role="Responsable Espaces Verts (Jardinier Perrot, Starlink)",
                    is_coordinator=False,
                    avatar_color="rose"
                ),
                Member(
                    prenom="Marguerite",
                    name="Marguerite Jamet",
                    email="marguerite_jamet@yahoo.fr",
                    password=hash_password(os.getenv("USER_MARGUERITE_PASS") or os.getenv("MEMBER_PASSWORD_MARGUERITE", "B4vL7nP1wR9tY2mK")),
                    role="Responsable Équipements (Frigo Schtroudel, Buanderie)",
                    is_coordinator=False,
                    avatar_color="purple"
                ),
                Member(
                    prenom="Eugénie",
                    name="Eugénie Jamet",
                    email="eugenie_jamet@yahoo.fr",
                    password=hash_password(os.getenv("USER_EUGENIE_PASS") or os.getenv("MEMBER_PASSWORD_EUGENIE", "R9tY2mK9vL5nR1wP")),
                    role="Responsable Peintures SdB & Tri Sélectif",
                    is_coordinator=False,
                    avatar_color="amber"
                ),
                Member(
                    prenom="Joséphine",
                    name="Joséphine Jamet",
                    email="josephine_jamet@yahoo.fr",
                    password=hash_password(os.getenv("USER_JOSEPHINE_PASS") or os.getenv("MEMBER_PASSWORD_JOSEPHINE", "T7pY2mK9vL5nR1wQ")),
                    role="Coordinatrice Adjointe (Clés, Boîtier Sud, Vêtements)",
                    is_coordinator=True,
                    avatar_color="emerald"
                ),
                Member(
                    prenom="Maman",
                    name="Maman (Élisabeth) Jamet",
                    email="elizabeth_jamet@yahoo.fr",
                    password=hash_password(os.getenv("USER_MAMAN_PASS") or os.getenv("MEMBER_PASSWORD_MAMAN", "W1tY2mK9vL5nR1pT")),
                    role="Membre Associé",
                    is_coordinator=False,
                    avatar_color="teal"
                ),
                Member(
                    prenom="Frédéric",
                    name="Frédéric Jamet",
                    email="frdjamet@gmail.com",
                    password=hash_password(os.getenv("USER_FREDERIC_PASS") or os.getenv("MEMBER_PASSWORD_FREDERIC", "L5nR1wT7pY2mK9vQ")),
                    role="Responsable Électricité & Linky Tempo (Contacteur 0/HC)",
                    is_coordinator=False,
                    avatar_color="blue"
                ),
            ]
            session.add_all(members)
            session.commit()
            print("7 Associés statutaires initialisés.")

        # 3. Compte bancaire Swan France officiel
        swan_acc = session.query(BankAccount).filter(BankAccount.account_id == "f7af9598-108e-4c33-846d-b829a015c149").first()
        if not swan_acc:
            new_acc = BankAccount(
                account_id="f7af9598-108e-4c33-846d-b829a015c149",
                name="Compte Courant SCI Hellenvilliers (Swan France)",
                currency="EUR",
                balance=0.0,
                balance_type="interimAvailable",
                aspsp_name="Swan"
            )
            session.add(new_acc)
            session.commit()
            print("Compte bancaire Swan France initialisé à solde 0,00 €.")

        print("Vérification d'initialisation achevée : 100% données réelles, zéro faux élément ré-ensemencé.")
    finally:
        if should_close:
            session.close()

if __name__ == "__main__":
    seed_database()
