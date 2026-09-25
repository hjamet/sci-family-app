# Spécifications Comptables et Architecture Bancaire - SCI Hellenvilliers

> [!IMPORTANT]
> **Décision Stratégique & Arbitrage Bancaire Validé (14/09/2026)** :
> - **Établissement Retenu** : **Indy Compte Pro** (Offre Compte Pro 100% sans frais à vie, 0,00 € / mois).
> - **Opérateur Bancaire Agréé** : **Swan** (Établissement de Monnaie Électronique agréé ACPR sous le CIB 17328, adossé à **BNP Paribas**, garantie FGDR 100 000 €).
> - **Clôture Définitive du Débat Qonto** : L'offre payante Qonto (9 € HT/mois) et les comptes agence traditionnels (Crédit Agricole) sont formellement écartés, dégageant une économie nette de **108,00 € HT / an**.
> - **Invariants Opérationnels Immuables** :
>   1. **100% Dématérialisé (Virements SEPA & Prélèvements B2B)** : 100% des flux financiers entrants et sortants s'exécutent par voie électronique.
>   2. **Interdiction Stricte des Chèques** : Zéro chéquier émis, zéro encaissement de chèques (acté par la Résolution 3 du PV d'AG n°1).
>   3. **Synchronisation Comptable Directe** : Catégorisation des écritures bancaires pour alimentation automatique du bilan et de la liasse fiscale 2072.

---

## 1. Cartographie des Flux Financiers et Modèle de Données

```mermaid
flowchart TD
    subgraph Associes["🏛️ 7 Associés (Capital : 390 000 €)"]
        Parents["Parents (Usufruitiers)\nFrédéric & Élisabeth JAMET"]
        Enfants["5 Enfants (Nus-propriétaires - 10% chacun)\nHenri, Joséphine, Eugénie, Hortense, Alexandre"]
        FJ["🏊 Frédéric Jamet (Piscine)\nAccord direct puis 1 000 €/mois (2027)"]
    end

    subgraph BanqueIndy["🏦 Indy Compte Pro (Swan / BNP Paribas - 0 €/mois)"]
        IBAN["IBAN Français FR76...\nTitulaire : SCI HELLENVILLIERS"]
        SyncAPI["Module Synchronisation Bancaire Native"]
    end

    subgraph AppDB["🗄️ Supabase Cloud PostgreSQL 15"]
        T_Transactions["transactions (id, amount, date, category, label)"]
        T_CCA["cca_contributions (user_id, amount, date, status)"]
        T_Budget["budget_categories (code, label, target_annual)"]
    end

    subgraph Sorties["📉 Règlements Prestataires & Fiscalité"]
        EDF["EDF Option Tempo (PAC 20 kW)"]
        JOSSE["Éts JOSSE SAS (Fioul Chauffage)"]
        DGFiP["DGFiP (Taxe Foncière Mesnil-sur-Iton)"]
        Piscine["DECLERCQ PISCINES (Entretien & Maintenance)"]
    end

    Enfants -->|Virement 50 €/m 'Apport CCA - [Prénom]'| IBAN
    FJ -->|Virement 1 000 €/m dès 01/01/2027| IBAN
    IBAN --> SyncAPI
    SyncAPI --> T_Transactions
    T_Transactions --> T_CCA
    IBAN -->|Prélèvements SEPA B2B| EDF & DGFiP
    IBAN -->|Virements SEPA| JOSSE & Piscine
```

---

## 2. Plan Comptable Général Adapté à la SCI Immobilière Familiale

L'application `sci-family-app` et le module Indy catégorisent les flux selon la nomenclature du Plan Comptable Général (PCG) :

| Numéro de Compte | Intitulé Comptable | Nature du Flux | Règles Métier Appliquées |
| :--- | :--- | :--- | :--- |
| **101000** | Capital Social | Passif / Fonds Propres | Fixe : 390 000,00 € (1 000 parts de 390 €). |
| **455100** | Associé - Henri JAMET (CCA) | Dettes Financières | Suivi des apports mensuels (50 €/mois) et remboursements. |
| **455200** | Associée - Joséphine JAMET (CCA) | Dettes Financières | Suivi des apports mensuels (50 €/mois) et remboursements. |
| **455300** | Associée - Eugénie JAMET (CCA) | Dettes Financières | Suivi des apports mensuels (50 €/mois) et remboursements. |
| **455400** | Associée - Hortense JAMET (CCA) | Dettes Financières | Suivi des apports mensuels (50 €/mois) et remboursements. |
| **455500** | Associé - Alexandre JAMET (CCA) | Dettes Financières | Suivi des apports mensuels (50 €/mois) et remboursements. |
| **455600** | Associé - Frédéric JAMET (Piscine) | Dettes Financières | Traçabilité des versements forfaitaires 1 000 €/mois (dès 2027). |
| **512100** | Banque Indy Compte Pro | Actif Circulant / Trésorerie | Solde bancaire Swan en temps réel. |
| **606100** | Électricité (EDF Rosing & Presbytère) | Charges d'Exploitation | Facturation PAC 20 kW (Option Tempo) et refacturation Presbytère. |
| **606200** | Combustible / Fioul (Éts JOSSE SAS) | Charges d'Exploitation | Commandes groupées estivales de fioul. |
| **615200** | Entretien & Réparations Bâtiment | Charges d'Exploitation | Artisans, toiture, gouttières, petites fournitures. |
| **615300** | Entretien Piscine (DECLERCQ PISCINES) | Charges d'Exploitation | Factures DECLERCQ (neutralisées par Frédéric Jamet). |
| **615400** | Entretien Espaces Verts (Jardinier) | Charges d'Exploitation | Règlements déclarés via CESU (crédit d'impôt 50%). |
| **616000** | Primes d'Assurances (PNO) | Charges d'Exploitation | Assurance Propriétaire Non Occupant. |
| **635120** | Taxes Foncières (DGFiP) | Charges Fiscales | Avis annuel commune de Mesnil-sur-Iton. |
| **708000** | Produits des activités annexes | Produits d'Exploitation | Refacturation éventuelle de charges locatives Presbytère. |

---

## 3. Gestion Spécifique du Compte Courant d'Associé (Compte 455)

> [!TIP]
> **Mécanisme Juridique & Fiscal du Compte 455** :
> 1. **Nature de Créance** : Chaque virement mensuel d'un associé crédite son sous-compte 455 personnel. Ce montant constitue un prêt sans intérêt consenti à la société.
> 2. **Remboursement Non Imposable** : Lorsque la trésorerie de la SCI le permet, le remboursement partiel ou total du solde créditeur du compte 455 s'opère en franchise totale d'impôt sur le revenu et de cotisations sociales.
> 3. **Libellé Strict Exigé** : Pour l'automatisation du parsing dans `sci-family-app`, les virements doivent comporter le format :
>    `Apport CCA - [Prénom]` (ex: `Apport CCA - Henri`, `Apport CCA - Eugenie`).

---

## 4. Accord Financement Spécifique Piscine (Frédéric Jamet)

L'intégration comptable respecte scrupuleusement les deux phases actées en AG du 8 août 2026 :
- **Phase 1 (Jusqu'au 31 décembre 2026)** :
  - Frédéric Jamet assure le règlement direct des factures **DECLERCQ PISCINES** (notamment la facture **FA0069094 acquittée**).
  - Aucune charge d'entretien piscine n'est imputée sur le budget courant de la SCI.
- **Phase 2 (À compter du 1er janvier 2027)** :
  - Mise en place d'un virement permanent mensuel de **1 000,00 € / mois** par Frédéric Jamet sur le compte Indy de la SCI.
  - Ces fonds sont fléchés sur la catégorie analytique `BUDGET_PISCINE` pour couvrir l'eau, la maintenance Declercq et la part énergétique de la pompe à chaleur piscine.

---

## 5. Déclaration Fiscale Annuelle (Liasse 2072)

La SCI Hellenvilliers étant soumise au régime de la transparence fiscale des sociétés de personnes (Impôt sur le Revenu - IR, Art. 8 du CGI), elle ne paie pas d'impôt sur les sociétés directement :
1. **Liasse Fiscale Obligatoire (Cerfa 2072-S / 2072-SD)** :
   - Dépôt annuel dématérialisé sur `impots.gouv.fr` via le compte institutionnel `hellenvillierssci@gmail.com` avant le deuxième jour ouvré suivant le 1er mai.
2. **Déductibilité Fiscale Conditionnée (Art. 31 du CGI)** :
   - Les dépenses d'entretien, de réparation, d'assurance et la taxe foncière ne sont déductibles du résultat foncier que si elles sont **exclusivement réglées à partir du compte bancaire propre de la SCI**.
   - Tout paiement effectué depuis le compte personnel d'un associé sans transit préalable par la SCI encourt un rejet fiscal systématique.
3. **Module Indy 2072** :
   - Le module de synchronisation bancaire Indy agrège les écritures de l'exercice et pré-remplit les rubriques de la déclaration 2072 sans surcoût comptable externe.
