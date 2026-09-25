# Cahier des Charges & Spécifications Fonctionnelles Exhaustives — Application Web SCI Hellenvilliers

> [!IMPORTANT]
> **Cadre & Objectif du Document**  
> Ce document constitue la spécification fonctionnelle complète et canonique de l'application web de la **SCI Hellenvilliers (Mesnil-sur-Iton / Rosins)**, transmise au conteneur Google Stitch MCP (`projectId: "4484682917577566744"`).  
> **Directive Fondamentale de Conception** : Ce document ne contient **aucun extrait de code source** (ni balisage HTML, ni code React/TypeScript, ni classes CSS/Tailwind), afin de préserver une totale liberté créative pour la génération et l'arbitrage visuel dans le studio Google Stitch par Henri Jamet.

---

## 🏛️ 1. Identité Juridique, Patrimoine & Gouvernance Familiale

### A. Renseignements Officiels & Immatriculation
* **Dénomination Sociale** : SCI HELLENVILLIERS (communément désignée SCI de Mesnil-sur-Iton ou Domaine d'Hellenvilliers).
* **Immatriculation Légale** : SIREN 977 529 312 — RCS Évreux.
* **Siège Social** : 4 rue de l'Ancienne Mairie, Hellenvilliers, 27240 Mesnil-sur-Iton (Eure, Normandie).
* **Capital Social** : 390 000,00 €, composé de 1 000 parts sociales d'une valeur nominale unitaire de 390,00 €.
* **Acte Notarié Fondateur** : Donation-Partage passée le 7 août 2023 devant Maître Goumard-Geffré, Notaire.
* **Coordinateur Général & Gérant Opérationnel** : Henri Jamet (mandat ratifié lors de l'Assemblée du 8-9 août 2026), avec Joséphine Jamet en qualité de coordinatrice adjointe.

### B. Composition des 7 Associés & Démembrement de Propriété
La société réunit 7 membres d'une même famille selon une convention de démembrement de propriété équilibrée :
1. **Les 2 Parents (Usufruitiers)** : Frédéric Jamet et Élisabeth Jamet. Détiennent l'usufruit complet des 1 000 parts sociales. Ils conservent le droit d'usage, de jouissance viagère des demeures familiales et le pouvoir d'arbitrage locatif.
2. **Les 5 Enfants (Nus-propriétaires)** : Henri Jamet, Joséphine Jamet, Eugénie Jamet, Hortense Jamet, Alexandre Jamet. Chaque enfant détient 200 parts sociales en nue-propriété, soit exactement 10 % du capital social (50 % pour la fratrie au total).
3. **Pérennité Fiscale** : À l'extinction naturelle de l'usufruit, la pleine propriété sera automatiquement consolidée au profit des 5 enfants, sans droits de mutation successoraux supplémentaires sur la part démembrée.

### C. Périmètre Immobilier & Exclusion Formelle
* **Propriété de Rosing (8 rue de l'Ancienne Mairie)** : Demeure principale de villégiature, dépendances, parc paysager clos, piscine extérieure et installation de chauffage central par Pompe À Chaleur (PAC 20 kW).
* **Le Presbytère (4 rue de l'Ancienne Mairie)** : Bâtisse de village avec jardin, occupée/louée, chauffée par chaudière centrale au fioul régulée à distance.
* **Parcelles et Terrains Attenants** situés sur la commune de Mesnil-sur-Iton.
* **Exclusion Formelle et Sanctuarisée** : L'appartement parisien familial situé au 39 rue Gracieuse (75005 Paris) ne fait **en aucun cas** partie du patrimoine ou des comptes de la SCI Hellenvilliers. Il est formellement exclu de toutes les fonctionnalités et consolidations de l'application.

### D. Cadre Bancaire & Règles Financières Impératives
* **Séparation des Patrimoines** : Conformément à la jurisprudence de la Cour de cassation (Cass. Com., 12 mai 2010), un compte bancaire dédié et exclusif à la SCI est ouvert (Crédit Agricole Normandie-Seine ou Qonto) afin d'écarter formellement tout risque de fictivité juridique et de sécuriser la déductibilité fiscale des charges réelles (Article 31 du CGI).
* **Cotisation Obligatoire en Compte Courant d'Associé (CCA — Compte 455)** : Chaque branche familiale verse une cotisation de **50,00 € par mois** sur le compte de la SCI. Tout virement entrant doit comporter le libellé normalisé obligatoire : `Apport CCA - [Prénom]`.
* **Budget de Fonctionnement Annuel Réel** : Les charges consolidées réelles oscillent entre **14 057 € / an** (base lissée d'audit) et **17 157 € / an** (avec prestation complète de jardinage et maintenance préventive).
* **Accord Spécifique pour la Piscine de Rosing (Frédéric Jamet)** :
  * *Phase 1 (Jusqu'au 31 décembre 2026)* : Frédéric Jamet prend en charge directement et à 100 % l'intégralité des factures de DECLERCQ PISCINES (notamment la facture acquittée FA0069094). Aucun prélèvement n'est imputé sur la trésorerie courante de la SCI.
  * *Phase 2 (À compter du 1er janvier 2027)* : Frédéric Jamet effectuera un virement permanent mensuel sanctuarisé de **1 000,00 € par mois** dédié au budget d'entretien, de mise en route, d'hivernage, d'électricité PAC et de traitement chimique du bassin.

---

## 📱 2. Spécifications Détaillées des Pages du Produit

---

### Page 1 : Tableau de Bord / Dashboard Général

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Tableau de Bord / Dashboard Général.
* **Rôle** : Tour de contrôle d'accueil et portail d'aiguillage quotidien de la SCI Hellenvilliers. Il offre une vision synthétique immédiate sur la vie de la propriété, les alertes prioritaires, la météo financière, les prochains séjours et les arbitrages familiaux en attente.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Parents Usufruitiers** : Consultation des indicateurs clés, repérage rapide des prochains enfants présents, accès au vadémécum et validation des décisions stratégiques.
* **5 Enfants Nus-propriétaires** : Prise de connaissance des séjours à venir, vote rapide sur les projets soumis, vérification de leurs tâches personnelles et accès aux raccourcis d'action.
* **Gérant / Coordinateur (Henri Jamet)** : Vue d'ensemble sur les alertes techniques, état de la trésorerie, suivi des votes et supervision globale des plannings.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Solde Estimé de Trésorerie Bancaire** : Affichage en devise (ex: solde disponible sur le compte dédié de la SCI).
* **Total des Cotisations CCA Collectées** : Montant annuel cumulé des apports de 50 €/mois par les 7 membres (objectif annuel : 4 200 € à 7 x 50 € x 12 mois).
* **Taux de Couverture Budgétaire** : Pourcentage d'avancement des cotisations par rapport au budget de fonctionnement annuel (14 057 € à 17 157 €).
* **Prochain Séjour au Domaine** : Nom du membre occupant, dates du séjour (du JJ/MM au JJ/MM), numéro de semaine ISO et nombre de personnes présentes.
* **Compteur des Décisions en Vote** : Nombre de projets et devis actuellement ouverts au scrutin familial (règle 1 personne = 1 vote).
* **Alertes Énergétiques ou Techniques Actives** : Statut de la chaudière, alerte Linky jour rouge Tempo, ou incident signalé non résolu.

#### 4. Composants d'Information Souhaités
* **Bannière d'Accueil Familiale Personnalisée** : Message d'accueil chaleureux (« Viva Hellenvilliers !! »), rappel de l'identité du membre connecté, badge de son rôle au sein de la SCI (Coordinateur, Garante du Patrimoine, Responsable Espaces Verts, etc.).
* **Grille des 6 Grandes Tuiles Thématiques d'Accès Rapide** :
  1. *Vadémécum* (guide d'arrivée, codes Wi-Fi, clés, compteurs d'eau).
  2. *Signaler un Problème / Nouveau Projet* (formulaire d'incident ou de proposition de travaux).
  3. *Réservations & Planning* (calendrier des 7 chambres et projection de l'occupation).
  4. *Informations Administratives & RIB* (coordonnées bancaires officielles, budget et statuts).
  5. *Mes Tâches de Séjour* (checklists d'arrivée/départ et intendance attribuée).
  6. *Voter sur les Projets* (espace de démocratie participative familiale).
* **Carte des Prochains Séjours Confirmés** : Liste ordonnée des 3 prochains séjours avec pastille de couleur du membre, dates précises, semaine ISO et badge de confirmation.
* **Carte de Synthèse des Repères Financiers de la SCI** : Rappel du budget annuel consolidé (17 157 € / an), de la cotisation de base recommandée (50 € / mois / membre), du poste jardinier EI PERROT (3 900 € TTC / an) et de la parité des 7 membres.

#### 5. Actions & Fonctionnalités Interactives
* **Bouton d'Action Immédiate « Réserver un séjour »** : Ouvre directement la modale de planification d'un séjour sur l'ensemble du domaine.
* **Bouton d'Action Immédiate « Signaler un incident »** : Ouvre le formulaire de signalement rapide d'une panne ou d'un problème matériel.
* **Navigation Fluide vers les Sous-Modules** : Clic direct sur n'importe quelle tuile thématique pour basculer sur l'écran complet associé sans friction.
* **Bouton de Rechargement des Données en Temps Réel** : Permet de synchroniser les métriques avec la base centrale.

#### 6. Règles Métier Critiques Associées
* Les informations affichées concernent exclusivement Rosing et Le Presbytère (Paris Gracieuse est formellement exclue).
* Le bandeau d'alerte rouge doit s'activer immédiatement en cas de panne de capteur thermique, de niveau critique de cuve à fioul (< 20 %) ou d'échéance administrative urgente.

---

### Page 2 : Gestion Financière, Trésorerie & Comptes Courants d'Associés (CCA 455)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Gestion Financière, Trésorerie & Comptes Courants d'Associés (CCA 455).
* **Rôle** : Piloter la trésorerie de la société, assurer la réconciliation comptable des cotisations mensuelles des associés, simuler l'équilibre budgétaire et fournir en un clic les éléments de paiement bancaire officiel.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les 7 Associés** : Consultation du RIB officiel, suivi de l'état de leur propre compte courant d'associé, simulation des scénarios de cotisation solidaire.
* **Gérant / Coordinateur (Henri Jamet)** : Gestion des réconciliations bancaires, saisie des relevés, pointage des flux 50 €/mois, validation des écritures du Compte comptable 455.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Trésorerie Actuelle Disponible** : Montant réel sur le compte bancaire de la SCI (Crédit Agricole ou Qonto).
* **Cotisation Fixe d'Équilibre** : 50,00 € / mois par branche familiale (décision unanime du 8 août 2026).
* **Total Annuel Mobilisé par les Cotisations** :
  * À 50 €/mois/membre x 7 associés = 4 200,00 € / an (fonds de roulement initial).
  * En couverture intégrale (17 157 € / an) = 204,25 € / mois / membre à parts égales.
  * En scénario solidaire = Parents à 1 000 €/mois + 5 enfants à 85,95 € / mois.
* **Reste à Financer / Gap Annuel** : Écart entre le budget voté et le volume des cotisations perçues.
* **Taux d'Assiduité des Virements** : Pourcentage de versements reçus à bonne date sur les 12 derniers mois.

#### 4. Composants d'Information Souhaités
* **Carte Dédiée « RIB Officiel de la SCI »** :
  * Affichage bien visible du Titulaire (SCI HELLENVILLIERS), de l'IBAN complet formaté par blocs de 4 caractères, du code BIC/SWIFT, du nom de la banque (Crédit Agricole Normandie-Seine / Qonto).
  * Mention impérative du libellé obligatoire pour les virements : `Apport CCA - [Prénom]`.
  * Bouton de copie en un clic de l'intégralité des coordonnées bancaires.
* **Tableau de Réconciliation des 7 Comptes Courants d'Associés (Compte 455)** :
  * 7 lignes correspondant aux 7 associés (Frédéric, Élisabeth, Henri, Joséphine, Eugénie, Hortense, Alexandre).
  * Colonnes : Associé, Statut du mois en cours (À jour / En attente / Retard), Montant versé ce mois (50 €), Cumul historique des apports CCA, Date du dernier virement reçu, Référence du virement.
* **Ventilation Consolidée du Budget Annuel (17 157 € / an)** :
  * *Espaces Verts (EI PERROT LAURENT)* : 3 900 € TTC / an (devis Devis-2025-000002 du 06/02/2025, 325 €/mois).
  * *Fluides Consolidés (Eau + Électricité)* : 4 835 € / an (soit 57,57 €/mois par membre : 48,81 € électricité + 8,76 € eau).
  * *Assurances PNO & Taxe Foncière* : 5 422 € / an (Assurance AXA des 2 demeures + Taxe foncière de Mesnil-sur-Iton).
  * *Entretien Courant & Travaux de Base* : 3 000 € / an (ramonage, révision chaudière, petites fournitures).
* **Simulateur Interactif de Cotisation Mensuelle (CCA)** :
  * Trois cartes de scénarios prédéfinis sélectionnables en un clic :
    1. *Scénario Recommandé (50 € / mois)* : Constitution du fonds de roulement d'urgence.
    2. *Scénario Égalitaire (204,25 € / mois)* : Couverture de 100 % des 17 157 € par les 7 membres.
    3. *Scénario Solidaire (85,95 € / mois)* : Parents 1 000 €/mois + solde réparti entre les 5 enfants.
  * Curseur interactif continu de cotisation individuelle allant de 0 € à 250 € / mois par pas de 5 €.
  * Jauge dynamique de couverture budgétaire (avec transition de couleur de l'indigo vers le vert émeraude au-delà de 100 %).
  * Calcul en direct du total collecté par an, du montant mensuel global et du surplus ou reste à financer.

#### 5. Actions & Fonctionnalités Interactives
* **Copie Rapide du RIB** : Notification visuelle immédiate (« Coordonnées bancaires copiées ! »).
* **Simulation Dynamique** : Manipulation du curseur avec recalcul instantané des métriques sans rechargement.
* **Pointage des Versements (Réservé Henri)** : Bouton permettant au coordinateur de valider la bonne réception d'un virement mensuel d'un membre.
* **Export PDF / Relevé CCA Individuel** : Génération d'un récapitulatif annuel de l'état du compte courant d'un associé pour sa déclaration fiscale personnelle.

#### 6. Règles Métier Critiques Associées
* Respect rigoureux de la séparation des patrimoines (compte bancaire commercial étanche, interdiction formelle de régler des dépenses de la SCI depuis un compte personnel sans écriture miroir de CCA).
* Tout virement reçu sans le libellé normalisé `Apport CCA - [Prénom]` doit être signalé pour clarification.
* Les fonds versés en CCA constituent des créances des associés sur la société, remboursables selon les disponibilités de trésorerie validées en Assemblée Générale.

---

### Page 3 : Charges Réelles & Factures Énergétiques (PAC Rosing, Fioul JOSSE, Presbytère)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Charges Réelles & Factures Énergétiques (PAC Rosing, Fioul JOSSE, Presbytère).
* **Rôle** : Suivi rigoureux des consommations énergétiques, archivage des factures fournisseurs réelles, pilotage à distance de la thermique des bâtiments et mise en œuvre du plan d'optimisation (-2 500 € à -3 500 € / an).

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Membres de la Famille** : Consultation des températures en direct, surveillance du niveau de fioul, consultation des consignes d'économies d'énergie.
* **Gérant / Coordinateur (Henri Jamet)** : Habilitation exclusive pour envoyer les consignes de température et changer le mode de fonctionnement de la chaudière, saisie des factures d'énergie, paramétrage de l'option EDF Tempo.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Électricité Rosing (PAC 20 kW)** :
  * Facture de référence 2024 : 3 588 € / an (sommet historique à 0,2516 €/kWh TTC).
  * Projection post-baisse TRV 2025 (-15 %) : ~2 880 € / an.
  * Gain potentiel visé avec l'option EDF Tempo : -800 € à -1 200 € / an.
* **Électricité Presbytère** :
  * Dépense constatée 2024 : 1 519 € / an.
  * Économie cible par refacturation à l'occupant / locataire : -1 519 € / an.
* **Fioul Domestique (Éts JOSSE SAS)** :
  * Volume des 3 factures réelles historiques : 6 207,67 € TTC sur 18 mois (Mars 2024 : 2 510,95 € ; Novembre 2024 : 1 365,72 € ; Mars 2025 : 2 331,00 €).
  * Moyenne annuelle retenue : 3 700 € / an.
  * Niveau de la cuve en direct : Volume restant en litres (ex: 1 850 L sur 2 500 L de capacité totale) et pourcentage de remplissage.
  * Consommation moyenne estimée : ~1 800 L par saison hivernale.
* **Télémesure Thermique en Direct (Presbytère / Viessmann ViCare)** :
  * Température ambiante intérieure (°C, au dixième de degré).
  * Température de consigne actuelle (°C).
  * Température extérieure sous abri (°C).
  * Température de départ de l'eau de chauffage (°C).
  * Température du ballon d'Eau Chaude Sanitaire (ECS) (°C).
* **Option EDF Tempo — Calendrier & Couleur du Jour** :
  * Indication de la couleur du jour Linky (Jour Bleu / Jour Blanc / Jour Rouge).
  * Compteur des jours consommés : 300 Jours Bleus (très économiques), 43 Jours Blancs (tarif moyen), 22 Jours Rouges (tarif de pointe du 1er nov au 31 mars en semaine).

#### 4. Composants d'Information Souhaités
* **Bannière d'Alerte Incident Réseau / Capteur** : En cas de perte de connexion avec les sondes thermiques ou l'API de chauffage, affichage immédiat d'une carte d'alerte rouge avec le détail de l'erreur brute et un bouton de relance (zéro donnée fictive).
* **Grille des 5 Métriques de Télémesure en Direct** : 5 blocs d'affichage pour Ambiance, Consigne, Extérieur, Eau Chaudière, Stockage ECS.
* **Sélecteur des 3 Modes Explicites de Fonctionnement de la Chaudière** :
  1. *Mode Été (Eau Chaude Seule)* : Seule l'eau chaude sanitaire est produite, radiateurs coupés.
  2. *Mode Hiver / Confort (Chauffage & Eau Chaude)* : Chauffage actif des pièces et maintien de l'eau chaude.
  3. *Mode Hors Gel / Veille* : Protection antigel du bâtiment (maintien à 12°C lors des périodes d'inoccupation hivernale).
* **Module d'Ajustement de la Consigne de Température** :
  * Plage autorisée de 12.0°C à 24.0°C par pas de 0.5°C.
  * Boutons de décrémentation et d'incrémentation pas-à-pas.
  * Curseur de réglage direct.
  * Badge de sécurité précisant l'accès réservé à Henri Jamet (verrouillé pour les autres membres).
* **Jauge Graphique Pleine Largeur de la Cuve à Fioul** :
  * Barre visuelle horizontale de remplissage avec changement de couleur dynamique (vert au-dessus de 45 %, ambre entre 25 % et 45 %, rouge d'urgence sous 25 %).
  * Date du dernier plein enregistré (15/11/2025).
  * Rappel de la règle de réapprovisionnement programmé en saison estivale (juin-août) pour économiser 300 € à 500 € par livraison.
* **Historique et Liste des Factures d'Énergie** :
  * Tableau chronologique des factures EDF et Éts JOSSE avec date, période, fournisseur, volume (kWh ou litres), montant TTC, lien vers le justificatif PDF archivé.
* **Encadré Stratégique d'Optimisation des Coûts (-2 500 € à -3 500 € / an)** :
  * Détail des 5 leviers : Tempo (-800 à -1 200 €), refacturation Presbytère (-1 519 €), achats estivaux de fioul (-300 à -500 €), hivernage précoce piscine (-600 €), jardinier en CESU (-400 €).

#### 5. Actions & Fonctionnalités Interactives
* **Modification de la Consigne / du Mode de Chauffage (Henri)** :
  * L'action déclenche obligatoirement une **modale de confirmation** récapitulant la modification avant transmission.
* **Téléversement d'une Nouvelle Facture d'Énergie** : Formulaire permettant de joindre un fichier PDF de facture, de renseigner la date, le fournisseur et le montant.
* **Actualisation Forcée de la Télémesure** : Bouton pour interroger instantanément les sondes de la maison.

#### 6. Règles Métier Critiques Associées
* En période hivernale inoccupée, consigne stricte de bascule de la bâtisse en mode Hors-Gel (12°C) et fermeture manuelle obligatoire des robinets de radiateurs dans les chambres privatives lors du départ.
* Pendant les 22 Jours Rouges Tempo, interdiction de déclencher les gros appareils et le chauffage d'appoint en heures pleines (de 6h00 à 22h00).

---

### Page 4 : Financement Spécifique & Espace Piscine Rosing (Accord Frédéric Jamet)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Financement Spécifique & Espace Piscine Rosing (Accord Frédéric Jamet).
* **Rôle** : Assurer la traçabilité intégrale de l'accord familial conclu le 9 août 2026 concernant la prise en charge et le financement pérenne de la piscine du parc de Rosing, isoler ces flux de la trésorerie générale et suivre les opérations techniques du bassin.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Frédéric Jamet** : Consultation de ses engagements, suivi des factures DECLERCQ PISCINES acquittées, programmation du virement mensuel 2027.
* **Henri Jamet (Coordinateur)** : Pointage des règlements, archivage des bordereaux d'intervention, planification de l'hivernage et du réveil printanier.
* **Ensemble des Associés** : Consultation des consignes de sécurité, carnet d'entretien de l'eau et suivi budgétaire neutralisé.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Statut de l'Accord — Phase 1 (Jusqu'au 31/12/2026)** :
  * *Prise en charge intégrale* : 100 % des factures acquittées directement par Frédéric Jamet.
  * *Impact sur la trésorerie SCI* : 0,00 € (charges totalement neutralisées pour les 5 enfants).
  * *Facture pivot acquittée* : Facture DECLERCQ PISCINES n° FA0069094 entièrement réglée par Frédéric Jamet.
* **Statut de l'Accord — Phase 2 (Dès le 01/01/2027)** :
  * *Contribution forfaitaire mensuelle* : **1 000,00 € / mois** versés par virement permanent automatique par Frédéric Jamet sur le compte de la SCI.
  * *Budget annuel piscine mobilisé* : 12 000,00 € / an dédiés exclusivement à l'exploitation du bassin.
* **Paramètres Techniques du Bassin** :
  * État de la PAC Piscine (En service / En veille / En hivernage).
  * Période d'ouverture recommandée : Mi-mai à fin septembre.
  * Température de consigne d'eau recommandée : 26°C - 28°C en haute saison.
  * Économie liée à l'hivernage précoce (dès fin septembre) : ~600 € / an d'électricité évitée.

#### 4. Composants d'Information Souhaités
* **Bannière Institutionnelle de l'Accord Familial du 9 Août 2026** :
  * Synthèse des clauses ratifiées à l'unanimité : confirmation de la neutralisation des coûts pour la fratrie jusqu'à fin 2026, puis relais par le forfait de 1 000 €/mois dès le 1er janvier 2027.
* **Frise Chronologique des Deux Phases de Financement** :
  * Phase actuelle active : Prise en charge directe DECLERCQ (2024-2026).
  * Phase future programmée : Virement permanent 1 000 €/mois (2027+).
* **Registre des Factures et Interventions DECLERCQ PISCINES** :
  * Tableau listant chaque intervention : Référence facture (ex: FA0069094), date, nature des travaux (mise en service estivale, entretien filtration, remplacement pompe à chaleur, produits d'hivernage), montant TTC, mention « Prise en charge directe Frédéric Jamet », lien vers le justificatif PDF archivé.
* **Carnet de Bord Technique & Traitement de l'Eau** :
  * Relevés des paramètres de qualité de l'eau : pH (cible 7,2 - 7,4), taux de chlore / brome, niveau d'encrassement du filtre à sable, fréquence de lavage du filtre.
* **Protocole d'Hivernage & de Sécurité du Bassin** :
  * Procédure pas-à-pas pour la pose de la bâche de sécurité, la purge des canalisations et de la PAC piscine, le traitement choc et la coupure de l'alimentation électrique.

#### 5. Actions & Fonctionnalités Interactives
* **Enregistrement d'une Facture DECLERCQ PISCINES** : Formulaire permettant de rattacher une nouvelle facture avec mention de son acquittement direct.
* **Saisie d'un Relevé d'Analyse d'Eau** : Enregistrement rapide du pH et du désinfectant par l'occupant d'un séjour.
* **Bouton de Rappel / Programmation Bancaire 2027** : Génération d'une fiche récapitulative pour la mise en place du virement permanent de 1 000 €/mois au 01/01/2027.
* **Téléchargement du Guide d'Utilisation de la PAC Piscine** : Accès direct à la notice technique.

#### 6. Règles Métier Critiques Associées
* Sanctuarisation absolue : Les dépenses de piscine ne doivent en aucun cas être prélevées sur les cotisations ordinaires de 50 €/mois des 5 enfants jusqu'au 31/12/2026.
* À compter de 2027, les versements mensuels de 1 000 € de Frédéric Jamet devront faire l'objet d'un sous-compte ou d'un code analytique distinct pour garantir leur affectation exclusive au complexe piscine.

---

### Page 5 : Calendrier d'Occupation, Réservations & Smart Matching (52 Semaines)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Calendrier d'Occupation, Réservations & Smart Matching (52 Semaines).
* **Rôle** : Organiser la cohabitation conviviale, planifier les séjours familiaux sur l'ensemble de l'année, prévenir les conflits de dates, équilibrer l'usage des 7 chambres et détecter automatiquement les périodes optimales de retrouvailles familiales.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les Associés & Conjoints** : Consultation du planning global, déclaration de leurs disponibilités par semaine, soumission de demandes de séjours.
* **Gérant / Coordinateur (Henri Jamet)** : Arbitrage des demandes simultanées, validation formelle des réservations, supervision de l'équilibrage annuel.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Capacité d'Accueil Totale du Domaine** : **7 Chambres** (réparties entre la demeure principale de Rosing et Le Presbytère).
* **Grille Temporelle de Référence** : **52 Semaines ISO** pour l'année 2026 et l'année 2027.
* **Plafond Estival de Séjour Exclusif** : **2 semaines consécutives maximum** par branche familiale durant la haute saison (juillet-août) en cas de privatisation complète de la demeure.
* **Compteur Annuel des Jours d'Occupation par Membre** : Nombre cumulé de nuitées réservées par chacun des 7 membres sur l'exercice civil (ex: Henri : 18 jours, Hortense : 14 jours, Marguerite : 7 jours, etc.).
* **Indicateur de Taux d'Occupation Mensuel** : Pourcentage moyen de chambres occupées chaque mois.
* **Semaines « Smart Match » Détectées** : Numéros des semaines estivales et festives réunissant le maximum de membres disponibles (ex: Semaine 30, Semaine 33, Semaine 52).

#### 4. Composants d'Information Souhaités
* **Graphique en Barres de Projection de l'Occupation sur 12 Mois** :
  * Visualisation mois par mois (de Janvier à Décembre) du volume de nuitées occupées sur la capacité totale des 7 chambres.
* **Sélecteur d'Année et Commutateur Tri-Vues d'Agenda** :
  * Sélecteur d'année (2026 / 2027).
  * Commutateur à 3 modes d'affichage :
    1. *Vue Calendrier Tri-Vues (Mois / Semaine / Jour)* : Navigation visuelle avec pastilles de couleur individuelles des 7 membres.
    2. *Vue Agenda Linéaire Chronologique* : Liste ordonnée de tous les séjours programmés, mentionnant le nom, les dates précises, la semaine ISO et le nombre de chambres mobilisées.
    3. *Vue Grille Croisée 52 Semaines & Smart Matching* : Grand tableau croisé avec les 52 semaines en colonnes et les 7 membres en lignes, affichant les statuts déclarés (Présent, Incertain, Impossible, Non renseigné).
* **Section « Smart Match — Semaines Optimales de Retrouvailles »** :
  * Mise en avant des semaines phares où le score de présence familiale est maximal, avec liste des membres confirmés et chambres restantes pour les invités.
* **Widget d'Équilibrage Annuel des Séjours (Stay Balance)** :
  * Grille de 7 cartes individuelles présentant pour chaque associé sa pastille couleur, son nombre de jours réservés et une jauge de progression comparée à la moyenne familiale, garantissant l'équité de la jouissance du patrimoine.
* **Modale Complète de Réservation de Séjour** :
  * Formulaire guidé : Choix de la semaine ou des dates de début/fin, sélection du membre requérant, nombre de chambres nécessaires (de 1 à 7), option « Accepte de cohabiter avec d'autres branches familiales » (Oui/Non), champ de notes et précisions (présence d'enfants, animaux, invités).

#### 5. Actions & Fonctionnalités Interactives
* **Bouton d'Action Primaire « Réserver un séjour »** : Ouvre la modale de saisie de réservation.
* **Basculement en Un Clic du Statut de Disponibilité dans la Grille Croisée** : Clic sur une cellule pour faire défiler les statuts : Présent -> Incertain -> Impossible -> Présent.
* **Filtre par Membre ou par Période** : Permet d'isoler les séjours d'un membre ou d'une saison particulière.
* **Export Synchronisé iCal / Google Calendar** : Flux permettant d'intégrer les séjours de la SCI dans son agenda smartphone personnel.

#### 6. Règles Métier Critiques Associées
* Tout séjour privatisant l'intégralité de la demeure (7 chambres) est comptabilisé à 100 % de la capacité pour le calcul de l'équilibrage annuel.
* Les réservations estivales exclusives sont limitées à 2 semaines par branche pour éviter toute préemption prolongée.
* En cas de demande concurrente sur une même semaine, l'arbitrage est réalisé par le coordinateur selon la règle de priorité à la branche ayant le moins occupé la maison sur les 12 mois précédents.

---

### Page 6 : Assemblées Générales, PV & Gouvernance Familiale

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Assemblées Générales, PV & Gouvernance Familiale.
* **Rôle** : Sanctuariser l'historique juridique de la société, consigner les procès-verbaux d'assemblées ordinaires et extraordinaires, archiver les consensus familiaux votés et formaliser les mandats de gérance.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les Membres Associés** : Consultation des comptes-rendus complets, lecture des résolutions adoptées, téléchargement des PV signés.
* **Gérant / Coordinateur (Henri Jamet)** : Rédaction et publication des procès-verbaux, ajout de nouvelles réunions, rattachement de documents scannés ou fichiers Markdown de transcription, modification des résolutions.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Nombre de Réunions & Assemblées Consignées** : Compteur officiel des sessions enregistrées dans l'application (ex: 3 réunions cadres répertoriées).
* **Dernière Assemblée Générale Tenue** : Date (8 août 2026), titre et quorum atteint (7/7 membres présents ou représentés).
* **Taux d'Unanimité des Décisions Historiques** : 100 % des décisions majeures adoptées à l'unanimité (maintien de la SCI, mandat de coordination, budget 50 €/mois).
* **Prochaine Échéance Statutaire d'AG** : Date prévisionnelle de la revoyure semestrielle ou de l'AG annuelle d'approbation des comptes.

#### 4. Composants d'Information Souhaités
* **Liste Chronologique des Assemblées Générales & Réunions Cadreuses** :
  * Présentation des 3 assemblées historiques documentées :
    1. *Réunion du 8 Août 2026 (Matin)* : « Maintien du Patrimoine, Budget 50 €/mois & Rôle de Coordinateur » (Vote unanime 7/7 pour conserver l'ensemble immobilier Rosing + Presbytère, fixation de la cotisation CCA à 50 €/mois/associé pour une année test, désignation d'Henri Jamet comme coordinateur opérationnel assisté de Joséphine, fixation des 2 journées de ménage par an et limitation des séjours d'été à 2 semaines).
    2. *Réunion du 8 Août 2026 (Après-midi)* : « Organisation Technique Rosing — Économies Chauffage, Jardinier Perrot & Arbitrage Poutres » (Consigne de chauffage max à 20°C en séjour et coupure obligatoire des radiateurs en partant, mise en hors-gel intégrale et débranchement du frigo Rosing l'hiver, installation de répéteurs Wi-Fi inter-maisons par Henri pour résilier le deuxième abonnement internet, renégociation du contrat jardinier Perrot de 3 900 € avec fauche tardive par Hortense et Alex, mise en place d'un pack de survie alimentaire, priorité au diagnostic expert des poutres qui s'effritent avant la plâtrerie de la bibliothèque).
    3. *Session Préparatoire du 7 Août 2026* : « Audit Financier, Fiscal & Ouverture du Compte Bancaire » (Séparation stricte des patrimoines selon l'obligation comptable, analyse du démembrement 2 parents usufruitiers / 5 enfants nus-propriétaires, confirmation de l'exclusion de Paris Gracieuse, chiffrage des charges réelles à 14 057 €/an, sélection du Crédit Agricole Normandie-Seine ou Qonto).
* **Structure Détaillée d'une Carte d'Assemblée** :
  * En-tête : Date formalisée, titre principal, sous-titre de l'ordre du jour, badge de quorum (7/7 Présents).
  * Bloc des 4 Points Clés de Consensus avec icônes distinctes.
  * Synthèse exécutive rédigée.
  * Accordéon dépliable des chapitres intégraux de la réunion.
  * Liste des pièces jointes associées (fichiers Markdown, procès-verbaux scannés, bilans financiers PDF).
* **Visionneuse Intégrée de Procès-Verbaux (Markdown & PDF)** :
  * Modale dédiée permettant de lire confortablement le texte intégral du procès-verbal avec mise en forme typographique soignée ou affichage brut.
  * Bouton de copie du texte intégral dans le presse-papier.
  * Bouton de téléchargement du fichier source.
* **Modale d'Ajout d'une Nouvelle Réunion (Réservée à Henri)** :
  * Formulaire avec titre de l'assemblée, date de tenue, sous-titre thématique, résumé des résolutions votées.
  * Zone de glisser-déposer multi-fichiers pour joindre instantanément transcriptions, feuilles de présence et annexes chiffrées.

#### 5. Actions & Fonctionnalités Interactives
* **Consultation & Dépliage des Chapitres de PV** : Lecture in-situ sans quitter l'écran.
* **Recherche Textuelle dans les Procès-Verbaux** : Possibilité de rechercher un mot-clé (ex: « poutres », « jardinier », « Tempo », « piscine ») dans toutes les résolutions votées.
* **Téléchargement des PV Signés** : Téléchargement direct des documents officiels.

#### 6. Règles Métier Critiques Associées
* Respect formel du formalisme des assemblées de SCI (convocation, quorum, rédaction du procès-verbal signé par le gérant et archivé pour le greffe et la banque).
* Toute décision entraînant un engagement financier supérieur à 300 € doit impérativement faire l'objet d'une mention expresse au procès-verbal ou d'un vote formel.

---

### Page 7 : Dossier Juridique, Actes & Documents KYC (Statuts, Kbis, RBE, CNI)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Dossier Juridique, Actes & Documents KYC (Statuts, Kbis, RBE, CNI).
* **Rôle** : Centraliser l'ensemble des pièces juridiques officielles, administratives et réglementaires (Know Your Customer / Lutte contre le blanchiment LCB-FT) requises par les établissements bancaires, le greffe et les notaires.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les Membres Associés** : Consultation et téléchargement des statuts de la société, de l'extrait Kbis et des actes notariés. Téléversement de leur propre pièce d'identité sécurisée.
* **Gérant / Coordinateur (Henri Jamet)** : Gestion complète du coffre-fort documentaire, vérification de la validité des pièces d'identité, suivi de la checklist KYC bancaire, suppression et mise à jour des documents officiels.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Taux de Complétude du Dossier KYC Bancaire** : Pourcentage d'avancement des pièces requises pour l'ouverture du compte (ex: 5 / 6 pièces maîtresses validées).
* **Statut de la Collecte des Pièces d'Identité des 7 Associés** :
  * *Pièces prêtes et certifiées (4 / 7)* : Frédéric Jamet (Passeport), Élisabeth Jamet (Passeport), Henri Jamet (Passeport), Annabelle Jamet (Passeport).
  * *Pièces en attente de collecte (3 / 7)* : Eugénie Jamet, Hortense Jamet, Alexandre Jamet.
* **Validité de l'Extrait Kbis** : Date de la dernière version extraite (< 3 mois exigés par la banque) et rappel du numéro SIREN : 977 529 312 RCS Évreux.
* **Total des Documents Répertoriés** : Nombre global de pièces archivées dans la bibliothèque unique.

#### 4. Composants d'Information Souhaités
* **Checklist Interactive de Conformité Bancaire KYC / LCB-FT** :
  * Tableau dynamique des 6 pièces fondamentales :
    1. *Statuts constitutifs signés & certifiés* (Donation-partage Me Goumard-Geffré, 7 août 2023) — Statut : Prêt.
    2. *Extrait Kbis du Greffe d'Évreux* (< 3 mois, SIREN 977 529 312) — Statut : Prêt / À actualiser sur MonIdenum.
    3. *Justificatif de domicile du siège* (< 3 mois, attestation de résidence des parents) — Statut : Prêt.
    4. *Récépissé du Registre des Bénéficiaires Effectifs (RBE)* (Portail INPI) — Statut : Prêt / À télécharger.
    5. *CNI / Passeports des 7 associés* — Statut : 4 / 7 prêts (alerte sur les 3 pièces manquantes).
    6. *PV d'AG d'autorisation d'ouverture de compte & mandat Henri Jamet* — Statut : En cours de formalisation.
* **Bibliothèque Documentaire Unique & Centralisée de la SCI** :
  * Barre d'outils complète :
    * Champ de recherche textuelle en temps réel (filtre par titre, nom de fichier, catégorie ou auteur).
    * Filtre par catégories métiers : Toutes, Actes & Statuts Notariés, Procès-Verbaux d'AG, Devis & Contrats Prestataires, Justificatifs de Fin de Tâche & Réparations.
    * Menu de tri : Plus récents, Plus anciens, Nom alphabétique (A-Z), Par catégorie.
    * Bouton d'actualisation manuelle et compteur de résultats filtrés.
  * Grille de cartes documentaires soignées :
    * Icône de badge distinctive selon le format (.pdf, .md, image, document bureautique).
    * Titre usuel lisible et nom de fichier d'origine.
    * Date de versement, taille du fichier et auteur du dépôt.
    * Source / rattachement (ex: Acte Notarié, Devis Prestataire, Assemblée du 8 août).
    * Boutons d'action : Visualiser en ligne, Télécharger, Supprimer (réservé à Henri avec dialogue de sécurité).
* **Espace Sécurisé de Dépôt de Pièce d'Identité pour les Associés** :
  * Zone de téléversement intuitive permettant à chaque enfant de déposer sa CNI recto-verso ou son passeport en cours de validité.

#### 5. Actions & Fonctionnalités Interactives
* **Recherche et Filtrage Instantanés** : Actualisation dynamique de la grille documentaire sans latence.
* **Téléchargement Direct en Un Clic** : Récupération des PDF officiels pour les démarches administratives.
* **Suppression Sécurisée (Henri)** : Protection par avertissement explicite pour éviter toute perte de document officiel.
* **Bouton d'Extraction des Justificatifs Manquants** : Génération d'une notification de rappel aux 3 associés dont la pièce d'identité est attendue.

#### 6. Règles Métier Critiques Associées
* Tous les documents déposés sont indexés et stockés de manière sécurisée (compatible avec le stockage Google Drive de 30 To de la SCI).
* Les pièces d'identité sont strictement confidentielles et réservées aux formalités légales et bancaires de la SCI.

---

### Page 8 : Carnet d'Entretien, Travaux & Gestion des Incidents (PAC, CESU jardinier, prestataires)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Carnet d'Entretien, Travaux & Gestion des Incidents (PAC, CESU jardinier, prestataires).
* **Rôle** : Centraliser l'historique technique du domaine, déclarer et suivre les pannes et dysfonctionnements, gérer les devis d'artisans, coordonner les interventions des prestataires et archiver les justificatifs de réparation.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les Associés** : Signalement d'un problème constaté lors d'un séjour (avec photos), consultation de l'avancement des réparations.
* **Responsables Thématiques Familiaux** : Hortense et Alex (Espaces Verts), Marguerite (Équipements), Frédéric (Électricité), Eugénie (Peintures & Tri).
* **Gérant / Coordinateur (Henri Jamet)** : Qualification des signalements, arbitrage budgétaire (< 300 € direct, > 300 € mis au vote), validation des devis, suivi des factures et clôture des tâches.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Nombre d'Incidents / Signalements Ouverts** : Compteur d'anomalies en attente de prise en charge ou en cours de réparation.
* **Budget Annuel d'Entretien Courant** : Enveloppe de **1 500 € à 3 000 € / an** dédiée aux réparations et à la maintenance préventive.
* **Poste Espaces Verts / Jardinier (EI PERROT LAURENT)** :
  * Coût historique contractuel : 3 900,00 € TTC / an (325 €/mois).
  * Optimisation ciblée via adhésion CESU : 50 % de crédit d'impôt, soit un coût net de ~1 950 € / an (économie directe de 400 € à 800 € / an).
* **Chantier Prioritaire Arbitré en AG** :
  * Diagnostic d'expertise sur l'effritement des **poutres maîtresses structurelles** priorisé avant tout engagement des travaux de plâtrerie de la bibliothèque.

#### 4. Composants d'Information Souhaités
* **Tableau de Bord des Interventions Techniques & Contrats Référencés** :
  * *Pompe À Chaleur Rosing (PAC 20 kW)* : Contrat d'entretien annuel, contrôle du fluide frigorigène, vérification des filtres.
  * *Chaudière Fioul Presbytère (Viessmann)* : Entretien annuel obligatoire du brûleur, ramonage du conduit de cheminée, jaugeage de cuve.
  * *Espaces Verts & Parc* : Prestations de tonte, taille de haies, fauche tardive des zones protégées, contrat Perrot.
  * *Réseau Eau & Assainissement* : Contrôle SPANC, vidange fosse toutes eaux, inspection des regards.
* **Mur des Incidents & Signalements Récents** :
  * Cartes de signalement comportant :
    * Titre de l'anomalie, localisation (Rosing / Presbytère / Parc).
    * Niveau de gravité / priorité : Critique (urgence sécurité/chauffage), Élevée, Moyenne, Faible.
    * Auteur du signalement et date de constatation.
    * Description du problème et prévisualisation des photos jointes.
    * Statut du traitement : Signalé -> En cours d'évaluation -> Devis reçu -> Réparation planifiée -> Résolu / Clôturé.
* **Formulaire d'Attribution & Validation des Travaux** :
  * Attribution d'un responsable familial ou d'un artisan externe référencé.
  * Saisie de l'estimation de coût et rattachement d'un devis au format PDF.
  * Zone de clôture avec dépôt obligatoire d'une note de fin de tâche et de photos du résultat réparé.
* **Annuaire des Artisans & Prestataires Locaux Référencés** :
  * Fiches contacts avec nom, corps de métier, numéro de téléphone, adresse e-mail et historique des interventions passées (Chauffagiste Viessmann, Électricien, Plombier, Jardinier Perrot, Ramoneur).

#### 5. Actions & Fonctionnalités Interactives
* **Bouton d'Action « Déclarer un incident »** : Ouvre une modale guidée permettant de photographier la panne depuis un smartphone, de décrire le problème et de définir le niveau d'urgence.
* **Filtrage des Incidents** : Filtre par lieu (Rosing vs Presbytère), par statut ou par priorité.
* **Téléversement de Devis & Factures d'Artisans** : Rattachement automatique de la facture acquittée dans la bibliothèque documentaire de la SCI.

#### 6. Règles Métier Critiques Associées
* Règle de compétence financière : Toute réparation urgente de moins de 300 € peut être engagée immédiatement par le coordinateur Henri Jamet. Au-delà de 300 €, la dépense doit être soumise au vote préalable des associés.
* Priorité absolue à la sécurité structurelle du bâti (poutres, toitures, circuit électrique) sur les travaux de simple confort ou d'embellissement.

---

### Page 9 : Vadémécum Centralisé & Guide Pratique du Domaine

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Vadémécum Centralisé & Guide Pratique du Domaine.
* **Rôle** : Manuel de maison interactif regroupant toutes les consignes de vie pratique, les codes d'accès, les modes d'emploi des équipements complexes et les démarches d'urgence pour assurer l'autonomie complète des associés et de leurs invités.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Tous les Membres & Invités de Passage** : Consultation libre de l'ensemble des fiches pratiques, copie en un clic des codes secrets (Wi-Fi, alarme, portail).
* **Gérant / Coordinateur (Henri Jamet)** : Rédaction, modification et ajout de nouvelles fiches pratiques, mise à jour des mots de passe.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Nombre de Fiches Pratiques Actives** : 7 à 10 fiches maîtresses couvrant l'ensemble des thématiques.
* **Consigne Chauffage de Référence** : Température maximale de confort fixée à **20°C** en séjour, consigne Hors-Gel obligatoire à **12°C** en inoccupation.
* **Option Tempo Linky — Seuil d'Alerte** : Heures pleines des 22 Jours Rouges (tarif prohibitif de 0,7295 €/kWh de 6h00 à 22h00).
* **Numéros d'Urgence Immédiate** : Numéros d'urgence médicale, pompiers, dépannage Enedis et coordonnées du coordinateur Henri Jamet.

#### 4. Composants d'Information Souhaités
* **Barre de Recherche Rapide & Filtrage par Catégories** :
  * Champ de recherche instantanée sur les titres et contenus.
  * Boutons de filtres thématiques : Wi-Fi & Réseau, Accès & Clés, Eau & Électricité, Chauffage & Fioul, Déchets & Recyclage, Équipements & Notice, Urgences & Sécurité.
* **Grille des Fiches Pratiques Essentielles** :
  * *Fiche Wi-Fi & Réseau Inter-Maisons* : Explication du réseau unifié mis en place par Henri (répéteurs haute portée depuis la maison principale vers Rosing permettant de supprimer l'abonnement internet doublon), nom du réseau (SSID) et bouton de copie du mot de passe en 1 clic.
  * *Fiche Accès, Portail & Boîtes à Clés* : Emplacement des clés, code du digicode du portail d'entrée, consigne de remise en place des doubles.
  * *Fiche Eau & Coupure Générale* : Localisation précise du robinet d'arrêt général d'eau (nécessaire en cas de gel prolongé ou d'absence longue), purge des robinets extérieurs.
  * *Fiche Tableau Électrique & Disjoncteurs* : Emplacement du compteur Linky, réarmement des différentiels, consigne d'extinction des chauffe-eau en départ prolongé.
  * *Fiche Chauffage, Radiateurs & Consignes ViCare* : Consigne de 20°C max en séjour, fermeture impérative des robinets manuels des chambres privatives en partant, débranchement du réfrigérateur de Rosing non utilisé en hiver.
  * *Fiche Tri Sélectif, Poubelles & Ramassage* : Jours de collecte à Mesnil-sur-Iton (bacs ordures ménagères et tri sélectif), localisation des containers du village, consigne stricte de vider tous les bacs avant le départ.
  * *Fiche Pack de Survie Alimentaire* : Règle du stock de réserve convenu le 8 août (pâtes, riz, pestos, conserves, café/thé) et obligation pour chaque occupant ayant consommé de réapprovisionner avant de quitter les lieux.
  * *Fiche Rangement de l'Étage & Chambres* : Consigne d'occupation collective (au moins 50 % des étagères et penderies laissées libres pour les autres membres).
* **Widget Intégré de Surveillance Thermique ViCare** : Rappel compact de la température ambiante et extérieure pour vérifier que la maison est à température avant d'arriver.

#### 5. Actions & Fonctionnalités Interactives
* **Bouton de Copie en 1 Clic des Codes** : Permet de copier instantanément le mot de passe Wi-Fi ou un digicode sur smartphone avec confirmation visuelle immédiate.
* **Ajout d'une Fiche Vadémécum** : Formulaire permettant d'ajouter une consigne avec titre, catégorie, importance (Info, Attention, Critique) et extrait de code à copier.
* **Impression / Fiche d'Arrivée Téléchargeable** : Version condensée imprimable à laisser sur la table de la cuisine pour les invités.

#### 6. Règles Métier Critiques Associées
* Le vadémécum constitue le règlement d'usage intérieur de la « Charte de l'envie de vivre ensemble » adoptée lors de l'assemblée du 8-9 août 2026.

---

### Page 10 : Espace Personnel d'Intendance & Checklists de Séjour

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Espace Personnel d'Intendance & Checklists de Séjour.
* **Rôle** : Responsabiliser chaque occupant, guider les protocoles d'arrivée et de départ, assurer le roulement des tâches ménagères et consigner les preuves d'entretien réalisé pour préserver l'état irréprochable des maisons.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Membre Occupant Actuel ou à Venir** : Visualisation de sa checklist personnalisée pour son séjour, pointage des actions accomplies, envoi de photos et de notes de fin de tâche.
* **Gérant / Coordinateur (Henri Jamet)** : Supervision de l'exécution des checklists de départ, validation des tâches nécessitant un contrôle, suivi des deux journées annuelles de grand nettoyage collectif.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Séjour Actif Rattaché** : Nom de la réservation en cours (dates du séjour, semaine ISO, propriété occupée).
* **Taux de Complétude de la Checklist de Départ** : Pourcentage d'actions validées (ex: 8 / 10 tâches accomplies).
* **Jauge d'Équité d'Intendance Familiale (Workload Dashboard)** : Mesure des contributions de chaque membre aux tâches d'entretien collectif au prorata de ses jours d'occupation.
* **Grandes Journées Annuelles de Nettoyage** : Échéances des 2 journées de grand nettoyage votées en AG (session de printemps et session de rentrée de septembre).

#### 4. Composants d'Information Souhaités
* **Checklist Interactive d'Arrivée au Domaine** :
  * Mise en route de l'eau si coupée, vérification du compteur.
  * Ajustement de la consigne de chauffage en mode Confort (20°C max).
  * Rebranchement du réfrigérateur si nécessaire.
  * Relevé visuel de l'état des lieux et signalement immédiat d'une anomalie éventuelle.
* **Checklist Impérative de Départ & Fermeture du Domaine** :
  * *Chauffage* : Fermeture obligatoire des robinets thermostatiques manuels dans toutes les chambres privées occupées ; bascule de la maison en consigne Hors-Gel (12°C).
  * *Cuisine & Électroménager* : Vidage intégral et nettoyage du réfrigérateur de Rosing, débranchement et porte laissée entrouverte pour éviter les moisissures ; vidage et arrêt du lave-vaisselle.
  * *Linge & Couchage* : Déhoussage des lits occupés, rassemblement du linge sale ou lavage selon consigne.
  * *Déchets* : Évacuation totale des poubelles et du tri sélectif vers les containers extérieurs du village.
  * *Sécurité & Bâti* : Extinction de tous les éclairages, fermeture des volets et verrouillage de l'ensemble des portes et dépendances.
  * *Stock & Pack de Survie* : Vérification de la présence des produits de première nécessité (pâtes, riz, sauces, café).
* **Modale de Validation de Tâche avec Dépôt de Justificatifs** :
  * Formulaire permettant à l'occupant de cocher une tâche lourde ou d'entretien, de saisir un commentaire explicatif et de joindre des photos prouvant la bonne exécution (ex: photo du jardin tondu, photo du tableau électrique éteint).
* **Suivi des Tâches Spéciales des Référents Thématiques** :
  * Espaces verts (Hortense / Alex) : Suivi de la fauche tardive et du compost.
  * Équipements (Marguerite) : Suivi des révisions d'électroménager.
  * Électricité (Frédéric) : Vérification des éclairages extérieurs et disjoncteurs.
  * Peintures & Tri (Eugénie) : Tri sélectif et retouches d'entretien.

#### 5. Actions & Fonctionnalités Interactives
* **Cochage Interactif des Actions** : Mise à jour en temps réel de l'état d'avancement de la checklist.
* **Téléversement Multi-Photos de Fin de Séjour** : Envoi de photographies attestant de la propreté de la maison lors du départ.
* **Bouton de Clôture Définitive du Séjour** : Envoi d'une notification de confirmation de départ propre au coordinateur Henri Jamet.

#### 6. Règles Métier Critiques Associées
* L'occupation du domaine implique l'acceptation formelle d'exécuter l'intégralité de la checklist de départ sans exception.
* Tout dysfonctionnement constaté à l'arrivée doit être signalé immédiatement pour ne pas être imputé au dernier occupant.

---

### Page 11 : Espace de Vote & Démocratie Participative (Projets & Initiatives)

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Espace de Vote & Démocratie Participative (Projets & Initiatives).
* **Rôle** : Organiser la gouvernance démocratique de la famille, permettre à chacun de proposer des idées d'aménagement ou de travaux et soumettre les dépenses majeures au scrutin des 7 associés selon la règle d'or d'égalité stricte.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Les 7 Membres Associés** : Droit de vote égalitaire (« 1 personne = 1 vote »), soumission de projets et d'initiatives, ajout de commentaires et d'arguments de débat.
* **Gérant / Coordinateur (Henri Jamet)** : Examen préalable des projets soumis, qualification budgétaire, ouverture officielle du scrutin, clôture des votes et enregistrement des arbitrages.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Règle Électorale Fondamentale** : **1 Associé = 1 Voix Égale** (7 votants au total : Frédéric, Élisabeth, Henri, Joséphine, Eugénie, Hortense, Alexandre).
* **Seuil d'Arbitrage Financier** :
  * Dépenses **inférieures à 300 €** : Décision directe possible par le coordinateur Henri Jamet pour l'entretien courant.
  * Dépenses **supérieures à 300 €** : Mise au vote familial obligatoire des 7 associés.
* **Nombre de Projets en Cours de Scrutin** : Compteur de dossiers ouverts au vote actif.
* **Quorum & Progression du Vote** : Nombre de suffrages exprimés sur les 7 attendus (ex: 5 / 7 voix enregistrées).
* **Règle du Veto Familial** : Tout projet touchant à l'intégrité ou à la structure du patrimoine requiert l'unanimité absolue (droit de veto individuel).

#### 4. Composants d'Information Souhaités
* **Bannière Institutionnelle de la Démocratie Participative** :
  * Rappel solennel du principe d'égalité : chaque voix a le même poids, qu'elle émane d'un parent usufruitier ou d'un enfant nu-propriétaire.
* **Filtres de Tri des Projets** :
  * Par statut : Tous, Soumis à examen, Vote en cours, Approuvé, Refusé, Reporté à l'Assemblée Générale.
  * Par localisation : Tous, Villa Rosing, Le Presbytère, Parc & Extérieurs.
* **Grille des Dossiers & Projets Soumis au Vote** :
  * Présentation claire de chaque fiche projet :
    * Titre du projet, catégorie (Travaux, Rénovation, Embellissement, Équipement, Énergie).
    * Auteur de la proposition et date de dépôt.
    * Montant estimé ou devis joint en euros.
    * Description détaillée des bénéfices pour la maison familiale.
    * Badge de statut électoral (Vote en cours, Validé, etc.).
    * Baromètre des résultats en direct : Jauges de répartition des suffrages exprimés (POUR, CONTRE, ABSTENTION, REPORT À L'AG).
    * Espace de commentaires et de débat familial rattaché au dossier.
* **Zone de Saisie du Vote Individuel** :
  * Les 4 options de vote clairement identifiées :
    1. *POUR* (approbation du projet et de son financement).
    2. *CONTRE* (rejet de l'initiative).
    3. *ABSTENTION* (neutralité).
    4. *REPORT À L'AG* (demande d'un débat approfondi lors de la prochaine réunion plénière).
  * Champ de saisie pour motiver son vote par un commentaire explicatif.
* **Modale de Proposition d'une Nouvelle Initiative** :
  * Formulaire guidé : Titre de l'idée, propriété concernée, catégorie, estimation budgétaire, justification, zone de téléversement de devis ou de photos d'inspiration.

#### 5. Actions & Fonctionnalités Interactives
* **Bouton d'Action « Proposer une initiative »** : Ouvre le formulaire de soumission.
* **Enregistrement Instantané du Vote** : Clic sur une des 4 options, avec confirmation immédiate et mise à jour dynamique des jauges de vote.
* **Modale d'Examen Coordinateur (Henri)** : Permet à Henri de qualifier le projet, d'ajouter ses observations d'arbitrage et d'ouvrir officiellement la période de scrutin.

#### 6. Règles Métier Critiques Associées
* Un associé peut modifier son vote tant que le scrutin n'est pas formellement clôturé par le coordinateur.
* Si un projet reçoit un avis « Report à l'AG », il est automatiquement inscrit à l'ordre du jour de la prochaine Assemblée Générale.

---

### Page 12 : Portail de Connexion Sécurisée & Profils des 7 Associés

#### 1. Nom de la Page & Rôle Fonctionnel
* **Nom** : Portail de Connexion Sécurisée & Profils des 7 Associés.
* **Rôle** : Identifier formellement le membre de la famille accédant à l'application, sécuriser l'accès aux données patrimoniales et bancaires confidentielles, personnaliser l'interface et gérer les rôles et attributions au sein de la SCI.

#### 2. Utilisateurs Cibles & Niveaux d'Habilitation
* **Ensemble des 7 Associés de la Famille** : Connexion simplifiée et sécurisée, personnalisation de leur profil (adresse e-mail, téléphone, mot de passe).
* **Visiteurs & Conjoints (le cas échéant)** : Profil invité restreint aux fiches vadémécum et à la consultation du planning.

#### 3. Indicateurs Clés / Chiffres & KPIs à Afficher
* **Liste Exhaustive des 7 Profils Familiaux Reconnus** :
  1. *Henri Jamet* : Coordinateur Général & Gérant opérationnel (Couleur : Cyan).
  2. *Joséphine Jamet* : Coordinatrice Adjointe (Couleur : Émeraude).
  3. *Hortense Jamet* : Responsable Espaces Verts & Jardinier (Couleur : Rose).
  4. *Marguerite Jamet* : Responsable Équipements & Maison (Couleur : Violet).
  5. *Eugénie Jamet* : Responsable Peintures, Tri & Décoration (Couleur : Ambre).
  6. *Frédéric Jamet* : Usufruitier, Référent Électricité & Accord Piscine (Couleur : Bleu).
  7. *Élisabeth Jamet (Maman)* : Usufruitière, Garante du Patrimoine Familial (Couleur : Sarcelle/Teal).
* **Statut de Session** : Indication de la connexion active, jeton de session sécurisé, date de dernière visite.

#### 4. Composants d'Information Souhaités
* **Écran de Connexion Familial Élégant & Chaleureux** :
  * Arrière-plan épuré et rassurant, rappelant l'atmosphère du domaine normand.
  * Formulaire de saisie des identifiants (identifiant ou sélection rapide du prénom / mot de passe ou code d'accès familial).
  * Sélecteur visuel rapide des 7 profils avec leurs avatars de couleur respectifs pour une connexion conviviale sur tablette familiale.
* **Menu Profil Déroulant dans la Barre Supérieure de Navigation** :
  * Pastille avatar colorée avec initiale du prénom.
  * Prénom du membre affiché avec son titre officiel au sein de la SCI.
  * Menu popover comprenant :
    * Rappel de l'adresse e-mail enregistrée.
    * Raccourci vers « Mon Espace Tâches & Séjours ».
    * Raccourci vers « Coordonnées & RIB de la SCI ».
    * Bouton proéminent de déconnexion sécurisée.
* **Fiche Profil Personnelle** :
  * Coordonnées personnelles, coordonnées bancaires de remboursement, préférences de notification (alertes e-mail pour les nouveaux votes ou les séjours confirmés).

#### 5. Actions & Fonctionnalités Interactives
* **Sélection Directe du Profil sur Tablette Commune** : Permet à un membre présent sur place à Rosing de se connecter rapidement en sélectionnant son profil.
* **Bascule Thème Clair / Thème Sombre** : Option de confort visuel mémorisée dans les préférences locales.
* **Déconnexion en Un Clic** : Clôture immédiate de la session et purge des identifiants locaux.

#### 6. Règles Métier Critiques Associées
* L'accès à l'application est strictement réservé aux 7 associés de la SCI Hellenvilliers et à leurs proches autorisés.
* La modification des paramètres financiers et la validation des réunions nécessitent l'authentification formelle sous le profil d'Henri Jamet (Coordinateur).

#### 7. Spécifications Graphiques & Tokens de la Version Émeraude (Stitch Studio)
* **Référence Studio Google Stitch** : Écran *« Connexion & Profils des Associés — Version Émeraude »* (`screenId: ab5d20a52e50417fa9cf63110aa71ff8`, projet `4484682917577566744`).
* **Palette Chromatique Canonique** :
  * *Vert Émeraude Primaire* : `#059669` (Tailwind `emerald-600`) et `#047857` (`emerald-700`) — utilisé pour les bordures de 2px, les anneaux d'état actif et les icônes d'authentification.
  * *Vert Émeraude Sombre* : `#065f46` (`emerald-800`) et *Vert Forêt Bâtiment* : `#064e3b` (`emerald-900`) / `#022c22` (`emerald-950`) — typographies d'action et contrastes textuels.
  * *Vert Sauge Pastel & Brume Normande* : `#ecfdf5` (`emerald-50`), `emerald-100/60`, `teal-50` — orbes d'ambiance floutés, conteneurs secondaires et badges discrets.
  * *Ardoise Sombre Structurelle* : `#0f172a` (`slate-900`), `#1e293b` (`slate-800`), `#334155` (`slate-700`), `#cbd5e1` (`slate-300`) — socle neutre contrasté.
* **Architecture Visuelle des Boutons (Règle d'Or)** :
  * **Fond Blanc Pur Sans Remplissage Opaque** : Tous les boutons de commande ont la classe de fond `bg-white`, bannissant tout aplat opaque saturé.
  * **Bordure Nette de 2px** : Contour affirmé de 2 pixels (`border-2 border-emerald-600` pour le bouton principal ; `border-2 border-slate-300` pour les boutons secondaires).
  * **Typographie Contrastée & Graisse Structurée** : Texte foncé à fort contraste (`text-emerald-900 font-semibold` ou `text-slate-700 font-semibold`).
  * **Icônes SVG Lucide Systématiques** : Chaque bouton intègre une icône vectorielle explicite (`Lock`, `Key`, `ArrowRight`, `HelpCircle`, `Mail`, `Phone`, `Check`, `Copy`).
* **Tuiles Tactiles des 7 Associés** :
  * Cartes individuelles à fond blanc pur (`bg-white`) avec bordure de 2px et **liseré latéral gauche distinctif de 4px (`border-l-4`)** aux couleurs d'attribution familiale :
    1. *Henri Jamet* : `border-l-cyan-500` (Coordinateur Général & Gérant)
    2. *Joséphine Jamet* : `border-l-emerald-500` (Coordinatrice Adjointe)
    3. *Hortense Jamet* : `border-l-rose-500` (Espaces Verts & Jardinier)
    4. *Marguerite Jamet* : `border-l-purple-500` (Équipements & Maison)
    5. *Eugénie Jamet* : `border-l-amber-500` (Peintures & Tri)
    6. *Frédéric Jamet* : `border-l-blue-500` (Usufruitier • Piscine & Électricité)
    7. *Élisabeth Jamet (Maman)* : `border-l-teal-500` (Usufruitière • Garante Patrimoine)
  * État sélectionné : double anneau `ring-2 ring-emerald-600 border-emerald-600 shadow-md scale-[1.03]`.
* **Ergonomie Tablette Familiale & Accessibilité** :
  * **Hauteur Minimale des Cibles Tactiles** : `>= 52px` (`min-h-[52px]`) sur tous les boutons, champs de saisie, case à cocher et tuiles de profils (`min-h-[92px]`), garantissant une manipulation sans friction sur écran tactile partagé.
  * **Case à Cocher « Mémoriser sur cette tablette »** : Maintien persistant du jeton JWT et pré-sélection automatique du dernier membre actif sur la tablette du domaine.
  * **Bouton & Espace Dédié « Vadémécum & Clés »** : Accès d'urgence immédiat pour les prestataires et artisans (digicode portail `2724#`, boîtes à clés Rosing `4812` et Presbytère `1984`, vannes de coupure générale).
  * **Bandeau d'Assistance Gérance au Bas de Page** : Point de contact direct avec Henri Jamet (e-mail, téléphone, rappel de la réinitialisation de mot de passe Bcrypt).

---


## 🔒 3. Synthèse des Règles Métier Transversales & Invariants

1. **Exclusion Géographique Absolue** : L'appartement du 39 rue Gracieuse (75005 Paris) est **strictement exclu** de tous les périmètres, calculs, charges et affichages de l'application.
2. **Étanchéité Bancaire CO 957 & Déductibilité CGI 31** : Compte bancaire dédié obligatoire pour la SCI, aucune confusion des patrimoines, traçabilité exhaustive de tous les apports de 50 €/mois en compte 455.
3. **Accord Piscine Frédéric Jamet Invariable** : Prise en charge intégrale des factures DECLERCQ PISCINES (dont FA0069094 acquittée) par Frédéric Jamet jusqu'au 31/12/2026 sans impact pour la SCI, puis relais par virement mensuel de 1 000,00 €/mois dès le 01/01/2027.
4. **Démocratie Familiale Égalitaire** : Règle « 1 personne = 1 voix » sur tous les projets supérieurs à 300 € et les délibérations collectives.
5. **Priorité Sécuritaire du Bâti** : Traitement prioritaire des désordres structurels (poutres, toitures, chaufferie) sur les aménagements d'embellissement.
6. **Équité d'Occupation des 7 Chambres** : Plafond estival de 2 semaines en occupation exclusive et comptabilisation transparente du nombre de jours de séjour par branche familiale.
