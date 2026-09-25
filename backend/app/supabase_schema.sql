-- ==============================================================================
-- SCHEMA DDL COMPLET SUPABASE POSTGRESQL (eu-central-1)
-- APPLICATION WEB SCI FAMILIALE (HELLENVILLIERS & KER DAVID)
-- ==============================================================================
-- Compatible PostgreSQL 15 / Supabase Cloud
-- Région : eu-central-1 (Frankfurt)
-- Pooler : Port 6543 (PgBouncer Transaction Mode)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TRIGGER AUTOMATIQUE POUR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. TABLES DE BASE
-- ------------------------------------------------------------------------------

-- TABLE: users (Membres de la famille & Artisans)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    prenom VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL DEFAULT 'pass123',
    role VARCHAR(100) DEFAULT 'Membre Associé',
    avatar_color VARCHAR(50) DEFAULT 'cyan'
);

-- TABLE: properties (Villa Rosing & Le Presbytère)
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    total_chambers INTEGER NOT NULL DEFAULT 5
);

-- TABLE: admin_documents (Devis, Factures, PV d'AG, Contrats)
CREATE TABLE IF NOT EXISTS admin_documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(100),
    file_size INTEGER,
    source_type VARCHAR(50),
    source_id INTEGER,
    uploaded_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: issues (Signalements de pannes, dysfonctionnements, réparations)
CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    priority VARCHAR(50) DEFAULT 'Moyenne',
    status VARCHAR(50) DEFAULT 'Ouvert',
    classification VARCHAR(50) DEFAULT 'SIGNALEMENT',
    charge INTEGER DEFAULT 1,
    add_to_ag_agenda BOOLEAN DEFAULT FALSE,
    linked_documents TEXT,
    supplier_info TEXT,
    created_by VARCHAR(100) NOT NULL,
    assigned_to VARCHAR(100),
    estimated_cost DOUBLE PRECISION DEFAULT 0.0,
    photo_url TEXT,
    photo_urls TEXT,
    completion_notes TEXT,
    completion_docs TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: comments (Commentaires legacy sur signalements)
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: issue_comments (Discussions et avis sur signalements)
CREATE TABLE IF NOT EXISTS issue_comments (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id INTEGER,
    author_name VARCHAR(100) NOT NULL,
    comment_text TEXT NOT NULL,
    is_vote_comment BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: reservations (Séjours et réservations de chambres)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    property_name VARCHAR(255),
    user_name VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    start_date VARCHAR(20) NOT NULL,
    end_date VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'Demande en attente',
    guest_count INTEGER DEFAULT 1,
    chambers_used INTEGER DEFAULT 1,
    selected_rooms TEXT,
    rooms_count INTEGER DEFAULT 1,
    accepts_extra_family BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: maintenance_tasks (Tâches modèles d'intendance par séjour)
CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL DEFAULT 'Chaque séjour',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: stay_task_assignments (Tâches concrètes assignées à un séjour)
CREATE TABLE IF NOT EXISTS stay_task_assignments (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    frequency VARCHAR(100),
    description TEXT,
    completed INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'A_FAIRE',
    completion_notes TEXT,
    completion_docs TEXT
);

-- TABLE: projects (Projets, chantiers majeurs et votes d'associés)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    category VARCHAR(100) NOT NULL DEFAULT '🛠️ Maintenance / Réparation',
    priority VARCHAR(50) NOT NULL DEFAULT 'MOYENNE',
    classification VARCHAR(50) DEFAULT 'SIGNALEMENT',
    task_weight VARCHAR(50) DEFAULT 'MOYEN',
    charge INTEGER DEFAULT 1,
    add_to_ag_agenda BOOLEAN DEFAULT FALSE,
    linked_documents TEXT,
    document_urls TEXT,
    supplier_info TEXT,
    submitted_by VARCHAR(100) NOT NULL,
    responsible VARCHAR(100),
    photo_url TEXT,
    photo_urls TEXT,
    status VARCHAR(50) DEFAULT 'SOUMIS',
    decision_mode VARCHAR(50),
    coordinator_notes TEXT,
    completion_notes TEXT,
    completion_docs TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: project_comments (Discussions et avis sur projets)
CREATE TABLE IF NOT EXISTS project_comments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: project_votes (Votes formels des associés sur les projets)
CREATE TABLE IF NOT EXISTS project_votes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    vote VARCHAR(50) NOT NULL,
    comment TEXT,
    voted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT _project_user_uc UNIQUE (project_id, user_name)
);

-- TABLE: member_availabilities (Disponibilités calendrier croisé)
CREATE TABLE IF NOT EXISTS member_availabilities (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPTIONNEL',
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT _avail_uc UNIQUE (property_id, year, week_number, user_name)
);

-- TABLE: vademecum_items (Carnet de bord & consignes techniques de maison)
CREATE TABLE IF NOT EXISTS vademecum_items (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    code_to_copy VARCHAR(255),
    importance VARCHAR(50) DEFAULT 'INFO',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. INDEXES DE PERFORMANCE & INTÉGRITÉ
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_prenom ON users(prenom);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_issues_property_id ON issues(property_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_created_by ON issues(created_by);

CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);

CREATE INDEX IF NOT EXISTS idx_reservations_property_id ON reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_name ON reservations(user_name);
CREATE INDEX IF NOT EXISTS idx_reservations_year_week ON reservations(year, week_number);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_property_id ON maintenance_tasks(property_id);

CREATE INDEX IF NOT EXISTS idx_stay_task_assignments_reservation ON stay_task_assignments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stay_task_assignments_task ON stay_task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_stay_task_assignments_status ON stay_task_assignments(status);

CREATE INDEX IF NOT EXISTS idx_projects_property_id ON projects(property_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_submitted_by ON projects(submitted_by);

CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_votes_project_id ON project_votes(project_id);

CREATE INDEX IF NOT EXISTS idx_member_avail_lookup ON member_availabilities(property_id, year, week_number, user_name);

CREATE INDEX IF NOT EXISTS idx_vademecum_items_property_id ON vademecum_items(property_id);
CREATE INDEX IF NOT EXISTS idx_vademecum_items_category ON vademecum_items(category);

CREATE INDEX IF NOT EXISTS idx_admin_documents_category ON admin_documents(category);
CREATE INDEX IF NOT EXISTS idx_admin_documents_source ON admin_documents(source_type, source_id);

-- ------------------------------------------------------------------------------
-- 5. TRIGGERS UPDATED_AT
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_issues_updated_at ON issues;
CREATE TRIGGER trg_issues_updated_at
BEFORE UPDATE ON issues
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_member_availabilities_updated_at ON member_availabilities;
CREATE TRIGGER trg_member_availabilities_updated_at
BEFORE UPDATE ON member_availabilities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_vademecum_items_updated_at ON vademecum_items;
CREATE TRIGGER trg_vademecum_items_updated_at
BEFORE UPDATE ON vademecum_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vademecum_items ENABLE ROW LEVEL SECURITY;

-- Politiques RLS permissives pour les connexions de l'application
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated and service access" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated and service access" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. INITIALISATION DES PROPRIÉTÉS SCI
-- ------------------------------------------------------------------------------
INSERT INTO properties (id, name, address, description, photo_url, total_chambers)
VALUES
    (1, 'Villa Rosing', '8 rue Ancienne Mairie', 'Grande propriété familiale Villa Rosing (8 rue Ancienne Mairie).', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80', 2),
    (2, 'Le Presbytère', '4 rue Ancienne Mairie', 'Demeure de charme Le Presbytère (4 rue Ancienne Mairie).', 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80', 5)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    description = EXCLUDED.description,
    photo_url = EXCLUDED.photo_url,
    total_chambers = EXCLUDED.total_chambers;

SELECT setval('properties_id_seq', (SELECT MAX(id) FROM properties));
