import os
from sqlalchemy.orm import Session
from .database import engine, SessionLocal, Base
from .models import User, Property, Issue, Comment, Reservation, Project, ProjectVote, MemberAvailability, VademecumItem, MaintenanceTask, StayTaskAssignment
from datetime import datetime, timedelta

def seed_database(db: Session):
    print("Seeding database with updated SCI Familiale data (Exact 7 family members, real meeting tasks, vademecum)...")

    # Clear existing data and recreate tables for schema updates
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # Properties (Requirement 4)
    p1 = Property(
        name="Villa Rosing",
        address="8 rue Ancienne Mairie",
        description="Grande propriété familiale Villa Rosing (8 rue Ancienne Mairie).",
        photo_url="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"
    )
    p2 = Property(
        name="Le Presbytère",
        address="4 rue Ancienne Mairie",
        description="Demeure de charme Le Presbytère (4 rue Ancienne Mairie).",
        photo_url="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80"
    )
    db.add_all([p1, p2])
    db.commit()
    db.refresh(p1)
    db.refresh(p2)

    # Exact 7 Family Members (Henri, Hortense, Marguerite, Eugénie, Joséphine, Élisabeth, Frédéric)
    users = [
        User(prenom="Henri", name="Henri Jamet", email="henri@sci-familiale.fr", password="pass123", role="Coordinateur", avatar_color="cyan"),
        User(prenom="Hortense", name="Hortense Jamet", email="hortense@sci-familiale.fr", password="pass123", role="Associé", avatar_color="rose"),
        User(prenom="Marguerite", name="Marguerite Jamet", email="marguerite@sci-familiale.fr", password="pass123", role="Associé", avatar_color="purple"),
        User(prenom="Eugénie", name="Eugénie Jamet", email="eugenie@sci-familiale.fr", password="pass123", role="Associé", avatar_color="amber"),
        User(prenom="Joséphine", name="Joséphine Jamet", email="josephine@sci-familiale.fr", password="pass123", role="Associé", avatar_color="emerald"),
        User(prenom="Élisabeth", name="Élisabeth Jamet", email="elisabeth@sci-familiale.fr", password="pass123", role="Associé", avatar_color="teal"),
        User(prenom="Frédéric", name="Frédéric Jamet", email="frederic@sci-familiale.fr", password="pass123", role="Associé", avatar_color="blue"),
    ]
    db.add_all(users)
    db.commit()

    # Maintenance Tasks Template (Admin task management & Member Stay Tasks)
    m_tasks = [
        MaintenanceTask(
            property_id=p1.id,
            title="Vérification des clés & coffre-fort",
            category="Arrivée",
            frequency="Chaque séjour",
            description="Contrôler la présence des clés de secours et vérifier le code du boîtier sécurisé (code: 4829) du portail Sud. Voir Vademecum Accès."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Bascule chauffage / fioul & thermostat",
            category="Arrivée",
            frequency="Chaque séjour",
            description="Régler le thermostat du couloir central sur 19°C à l'arrivée et contrôler la jauge extérieure de la cuve fioul. Fournisseur JOSSE."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Relevé compteurs Eau & Linky Tempo",
            category="Arrivée",
            frequency="Chaque séjour",
            description="Noter l'index du compteur d'eau dans la cave (après ouverture vanne rouge) et l'index Linky Tempo (HP/HC)."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Filtre piscine & chlore hebdomadaire",
            category="Pendant le séjour",
            frequency="Hebdomadaire",
            description="Vider le panier du skimmer, vérifier la pression du filtre à sable et rajouter 1 galet de chlore dans le skimmer."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Gestion du frigo Schtroudel & tri cuisine",
            category="Pendant le séjour",
            frequency="Tous les 3 jours",
            description="Centraliser toutes les denrées fraîches dans le nouveau réfrigérateur Schtroudel unique et jeter les emballages inutiles."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Linge de maison & buanderie",
            category="Départ",
            frequency="Chaque séjour",
            description="Défaire les lits occupés, déposer les draps/serviettes dans le bac buanderie et lancer un cycle à 60°C."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Fermeture vanne d'eau générale & fioul",
            category="Départ",
            frequency="Chaque séjour",
            description="Fermer la vanne d'arrivée d'eau rouge générale dans la cave (impératif si départ > 48h) et basculer le chauffage sur 12°C Hors-Gel."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Vidage poubelles & bac compost bio",
            category="Départ",
            frequency="Chaque séjour",
            description="Vider les poubelles intérieures. Sortir le bac Jaune (mardi) ou Noir (jeudi) en bord de route. Vider le bioseau au compost."
        ),
        MaintenanceTask(
            property_id=p1.id,
            title="Verrouillage baies vitrées & remise clés",
            category="Départ",
            frequency="Chaque séjour",
            description="Fermer les volets roulants, verrouiller toutes les baies et remettre la clé principale dans le boîtier à digicode du portail."
        ),
    ]
    db.add_all(m_tasks)
    db.commit()

    # Real Meeting Tasks (7 exact tasks requested by Henri)
    proj1 = Project(
        property_id=p1.id,
        title="Effondrement placo bibliothèque",
        description="Mur à refermer d'urgence suite à une infiltration d'eau. Travaux de plâtrerie et remise en peinture.",
        estimated_cost=650.0,
        category="🛠️ Maintenance / Réparation",
        priority="URGENT",
        submitted_by="Henri",
        responsible="Riffael / Denis (Artisans)",
        photo_url="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
        status="EN_COURS",
        decision_mode="VALIDER_DIRECTEMENT",
        coordinator_notes="Devis Riffael & Denis validé directement par Henri. Infiltration stopppée, plaquiste mandaté."
    )
    proj2 = Project(
        property_id=p1.id,
        title="Peinture écaillée salles de bain du haut",
        description="Pellicules toxiques tombant au-dessus de la baignoire. Traitement fongicide, ponçage et sous-couche hydrofuge.",
        estimated_cost=350.0,
        category="🛠️ Maintenance / Réparation",
        priority="HAUTE",
        submitted_by="Élisabeth",
        responsible="Élisabeth & Eugénie",
        photo_url="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
        status="EN_COURS",
        decision_mode="VALIDER_DIRECTEMENT",
        coordinator_notes="Validation directe par le coordinateur. Achat de la peinture hydrofuge écologique effectué."
    )
    proj3 = Project(
        property_id=p1.id,
        title="Consolidation en 1 frigo Schtroudel unique",
        description="Suppression des 4 à 5 réfrigérateurs dispersés et obsolètes pour acquérir un unique grand frigo familial Schtroudel éco-énergétique.",
        estimated_cost=950.0,
        category="✨ Amélioration",
        priority="HAUTE",
        submitted_by="Marguerite",
        responsible="Marguerite & Hortense",
        photo_url="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
        status="EN_VOTE",
        decision_mode="SOUMETTRE_AU_VOTE",
        coordinator_notes="Projet soumis au vote des associés SCI. Modèle sélectionné Classe A+++."
    )
    proj4 = Project(
        property_id=p1.id,
        title="Tri et don des vêtements d'enfance dans les placards",
        description="Tri complet des anciennes armoires et penderies, ensachage des vêtements d'enfance et livraison à la Croix-Rouge.",
        estimated_cost=0.0,
        category="✨ Amélioration",
        priority="BASSE",
        submitted_by="Joséphine",
        responsible="Joséphine & Hortense",
        photo_url=None,
        status="EN_COURS",
        decision_mode="VALIDER_DIRECTEMENT",
        coordinator_notes="Action bénévole familiale pendant les séjours d'été."
    )
    proj5 = Project(
        property_id=p1.id,
        title="Contrôle de la cuve à fioul & jauge extérieure",
        description="Vérification mécanique de la jauge extérieure et remplissage de la cuve avant l'hiver avec la commande d'été JOSSE.",
        estimated_cost=1800.0,
        category="🛠️ Maintenance / Réparation",
        priority="HAUTE",
        submitted_by="Henri",
        responsible="Fournisseur JOSSE / Henri",
        photo_url="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
        status="EN_COURS",
        decision_mode="VALIDER_DIRECTEMENT",
        coordinator_notes="Commande d'été passée auprès du fournisseur JOSSE au tarif préférentiel."
    )
    proj6 = Project(
        property_id=p1.id,
        title="Normalisation du tableau électrique & bouton 0/HC/Allumé pour Linky Tempo",
        description="Pose d'un contacteur 0/HC/Marche forcée sur le tableau électrique pour optimiser la tarification EDF Linky Tempo.",
        estimated_cost=480.0,
        category="🛠️ Maintenance / Réparation",
        priority="HAUTE",
        submitted_by="Frédéric",
        responsible="SARL Elec Chambray & Frédéric",
        photo_url="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
        status="EN_COURS",
        decision_mode="VALIDER_DIRECTEMENT",
        coordinator_notes="Artisan SARL Elec Chambray mandaté pour l'intervention."
    )
    proj7 = Project(
        property_id=p1.id,
        title="Inspection toiture & devis Riffael/Denis gouttières",
        description="Vérification des tuiles, démoussage et demande de devis à Riffael & Denis pour la réfection des gouttières en zinc.",
        estimated_cost=2400.0,
        category="➕ Nouveau Projet",
        priority="URGENT",
        submitted_by="Henri",
        responsible="Riffael / Denis & Henri",
        photo_url="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
        status="EN_VOTE",
        decision_mode="SOUMETTRE_AU_VOTE",
        coordinator_notes="Soumis au vote des associés suite à l'inspection préventive de toiture."
    )

    db.add_all([proj1, proj2, proj3, proj4, proj5, proj6, proj7])
    db.commit()

    # Project Votes (1 person = 1 vote)
    votes = [
        # Proj 3 (Frigo Schtroudel)
        ProjectVote(project_id=proj3.id, user_name="Henri", vote="POUR", comment="Excellente idée pour économiser l'électricité."),
        ProjectVote(project_id=proj3.id, user_name="Frédéric", vote="POUR", comment="D'accord à 100%."),
        ProjectVote(project_id=proj3.id, user_name="Eugénie", vote="POUR", comment="Beaucoup plus pratique."),
        ProjectVote(project_id=proj3.id, user_name="Hortense", vote="POUR", comment="Parfait."),

        # Proj 7 (Gouttières Riffael/Denis)
        ProjectVote(project_id=proj7.id, user_name="Henri", vote="POUR", comment="Urgent avant les pluies d'automne."),
        ProjectVote(project_id=proj7.id, user_name="Eugénie", vote="POUR", comment="Très important."),
        ProjectVote(project_id=proj7.id, user_name="Joséphine", vote="POUR", comment="D'accord."),
    ]
    db.add_all(votes)
    db.commit()

    # Reservations / Stays at Hellenvilliers (Upcoming Linear Timeline for exact 7 members)
    res_list = [
        Reservation(
            property_id=p1.id,
            user_name="Eugénie",
            year=2026,
            week_number=32,
            start_date="2026-08-03",
            end_date="2026-08-09",
            status="Confirmée",
            notes="Vacances d'été en famille (4 personnes)."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Frédéric",
            year=2026,
            week_number=33,
            start_date="2026-08-10",
            end_date="2026-08-16",
            status="Confirmée",
            notes="Semaine du 15 août — Grand rassemblement familial."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Hortense",
            year=2026,
            week_number=35,
            start_date="2026-08-24",
            end_date="2026-08-30",
            status="Confirmée",
            notes="Fin d'été au calme & télétravail."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Marguerite",
            year=2026,
            week_number=38,
            start_date="2026-09-14",
            end_date="2026-09-20",
            status="Demande en attente",
            notes="Weekend rallongé vendanges & cueillette."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Henri",
            year=2026,
            week_number=42,
            start_date="2026-10-12",
            end_date="2026-10-18",
            status="Confirmée",
            notes="Séjour d'automne & entretien chaudière."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Joséphine",
            year=2026,
            week_number=44,
            start_date="2026-10-26",
            end_date="2026-11-01",
            status="Demande en attente",
            notes="Vacances de la Toussaint."
        ),
        Reservation(
            property_id=p1.id,
            user_name="Élisabeth",
            year=2026,
            week_number=52,
            start_date="2026-12-21",
            end_date="2026-12-28",
            status="Confirmée",
            notes="Fêtes de Noël en famille à Hellenvilliers."
        ),
    ]
    db.add_all(res_list)
    db.commit()

    # Automatically populate attributed tasks for these reservations
    for res in res_list:
        for t in m_tasks:
            assignment = StayTaskAssignment(
                reservation_id=res.id,
                task_id=t.id,
                title=t.title,
                category=t.category,
                frequency=t.frequency,
                completed=0
            )
            db.add(assignment)
    db.commit()

    # Vademecum Centralisé (Real House Guides)
    vade_list = [
        VademecumItem(
            property_id=p1.id,
            category="Wi-Fi & Réseau",
            title="Wi-Fi Starlink Maison & Dépendance",
            content="Accès Internet Starlink très haut débit. Routeur principal dans le bureau du rez-de-chaussée, répéteur dans la dépendance.",
            code_to_copy="Hellenvilliers2026!",
            importance="IMPORTANT"
        ),
        VademecumItem(
            property_id=p1.id,
            category="Accès & Clés",
            title="Boîtier à clé sécurisé (Portail Sud)",
            content="Boîtier à digicode fixé sur le pilier gauche du portail secondaire. Remettre le passe dans le boîtier dès l'ouverture.",
            code_to_copy="4829",
            importance="CRITIQUE"
        ),
        VademecumItem(
            property_id=p1.id,
            category="Eau & Électricité",
            title="Vanne d'arrivée d'eau générale (Coupure Eau)",
            content="La vanne rouge de coupure générale d'eau se trouve dans la cave sous la buanderie. À FERMER OBLIGATOIREMENT lors de tout départ supérieur à 48h en hiver pour éviter l'éclatement des tuyaux par le gel.",
            code_to_copy=None,
            importance="CRITIQUE"
        ),
        VademecumItem(
            property_id=p1.id,
            category="Chauffage & Fioul",
            title="Consignes Chaudière Fioul & Jauge",
            content="Thermostat d'ambiance dans le couloir central. Régler sur 19°C lors des séjours, et obligatoirement basculer sur 12°C Hors-Gel en partant. La jauge fioul de la cuve est dans le local technique extérieur.",
            code_to_copy=None,
            importance="IMPORTANT"
        ),
        VademecumItem(
            property_id=p1.id,
            category="Déchets & Recyclage",
            title="Ramassage des poubelles & Tri",
            content="Poubelle JAUNE (recyclage & emballages) : sortir le mardi soir. Poubelle NOIRE (ordures ménagères) : sortir le jeudi soir. Bac à compost bio au fond du potager.",
            code_to_copy=None,
            importance="INFO"
        ),
        VademecumItem(
            property_id=p1.id,
            category="Urgence & contacts",
            title="Numéros d'urgence & Artisans référents",
            content="Plomberie d'urgence : Jean Dupont (06 12 34 56 78). Électricien : SARL Elec Chambray (02 32 45 67 89). SAMU : 15. Pompiers : 18. Médecin de garde : 116 117.",
            code_to_copy="0612345678",
            importance="CRITIQUE"
        ),
    ]
    db.add_all(vade_list)
    db.commit()

    print("Complete database seeding executed successfully for exact 7 members!")

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()
