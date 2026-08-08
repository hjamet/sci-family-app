# 🏠 SCI Familiale — Portail & Gestion du Patrimoine (Hellenvilliers)

Une application web moderne, fluide et complète dédiée à la gestion de la **SCI Familiale** (Hellenvilliers et chalets). Elle permet aux associés de signaler des problèmes de maintenance avec photos, de réserver leurs semaines de vacances familiales sur un calendrier interactif, et offre à Henri un tableau de bord coordinateur complet pour valider les demandes et affecter les artisans.

---

## 🌟 Fonctionnalités Principales

### 1. ⚠️ Signaler un Problème / Suivi des Incidents (`/api/issues`)
- **Formulaire de signalement complet** : sélection de la propriété, catégorie (*Plomberie, Électricité, Équipement, Structure, Ménage*), niveau de priorité (*Basse, Moyenne, Haute, Urgent*).
- **Prise de photo & upload** : attachement instantané de constat visuel depuis mobile ou ordinateur avec aperçu direct.
- **Fil d'actualité en direct** : filtres dynamiques par statut (*Tous, Ouverts, En cours, Résolus*), badges de couleur selon l'urgence.
- **Modal de discussion & commentaires** : fil de commentaires par incident pour coordonner les passages et interventions.

### 2. 📅 Calendrier Familial & Réservation de Semaines (`/api/reservations`)
- **Grille des 52 semaines ISO** pour l'année 2026 et 2027.
- **Statuts d'occupation en temps réel** : *Libre (Vert)*, *Demande en attente (Ambre)*, *Confirmée (Cyan)*.
- **Détails de réservation** : nom de l'associé, dates d'arrivée/départ calculées, notes et nombre d'occupants.
- **Formulaire de réservation instantané** avec validation anti-chevauchement.

### 3. 🛡️ Tableau de Bord Coordinateur — Vue Henri (`/api/stats`)
- **Indicateurs KPI globaux** : incidents urgents non résolus, demandes de réservation en attente, séjours confirmés, propriétés actives.
- **Actions en 1 clic** :
  - ✅ **Valider** ou ❌ **Refuser** une réservation de semaine en 1 clic.
  - 🔄 **Changer le statut** d'un incident (*Ouvert -> En cours -> Résolu*).
  - 🛠️ **Affecter un artisan** ou entreprise spécialisée en 1 clic.

---

## 🏗️ Architecture Technique

```
sci-family-app/
├── backend/
│   ├── app/
│   │   ├── database.py   # SQLAlchemy + SQLite en mode WAL (Write-Ahead Logging)
│   │   ├── models.py     # User, Property, Issue, Comment, Reservation
│   │   ├── schemas.py    # Validation Pydantic v2
│   │   ├── seed.py       # Données d'exemple pré-chargées
│   │   ├── main.py       # API REST FastAPI + Uploads statiques
│   │   └── uploads/      # Stockage des photos d'incidents
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/  # Navbar, IssuesPage, ReservationsPage, DashboardPage, Modals
│   │   ├── api.js       # Client d'API REST
│   │   ├── App.jsx
│   │   └── index.css    # Tailwind CSS + Glassmorphic design
│   ├── index.html
│   └── vite.config.js
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml
├── Caddyfile
└── README.md
```

---

## 🚀 Démarrage en Développement Local

### Préréquis
- Python 3.10+
- Node.js 18+

### 1. Démarrer le Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Sur Windows:
venv\Scripts\activate
# Sur Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt

# Initialiser la base de données et les données de démonstration
python -m app.seed

# Démarrer le serveur API
uvicorn app.main:app --reload --port 8000
```
L'API FastAPI sera accessible sur `http://localhost:8000/docs`.

### 2. Démarrer le Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
Ouvrez l'application web dans votre navigateur sur `http://localhost:5173`.

---

## 🌐 Déploiement en Production sur le serveur Hetzner (138.199.227.48)

L'application est entièrement conteneurisée avec **Docker Compose** et configurée pour le domaine **`sci.henri-jamet.com`**.

### Step 1 : Cloner le projet sur le serveur Hetzner
```bash
ssh root@138.199.227.48
git clone <url-du-repo> /opt/sci-family-app
cd /opt/sci-family-app
```

### Step 2 : Lancer Docker Compose
```bash
docker-compose up -d --build
```
Les conteneurs `sci_family_backend` (Port 8000) et `sci_family_frontend` (Port 3000) démarreront automatiquement avec volumes persistant pour SQLite WAL et les images uploadées.

### Step 3 : Configuration Reverse Proxy (Caddy)
Ajouter le bloc suivant dans le fichier `/etc/caddy/Caddyfile` du serveur Hetzner :

```caddy
sci.henri-jamet.com {
    tls henri@henri-jamet.com
    reverse_proxy localhost:3000
    encode zstd gzip
}
```

Recharger la configuration Caddy :
```bash
caddy reload
```

L'application sera en ligne et sécurisée HTTPS sur **`https://sci.henri-jamet.com`** ! 🎉
