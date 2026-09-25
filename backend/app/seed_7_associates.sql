-- ==============================================================================
-- SEED SCRIPT SQL : 7 ASSOCIÉS SCI HELLENVILLIERS (Bcrypt Hashed Passcodes)
-- ==============================================================================
-- Compatible Supabase PostgreSQL (eu-central-1)
-- Les mots de passe sont hachés avec Passlib Bcrypt à partir des variables d'environnement .env
-- ==============================================================================

INSERT INTO members (id, prenom, name, email, password, role, avatar_color)
VALUES
    (1, 'Henri', 'Henri Jamet', 'henri@sci-familiale.fr', '$2b$12$bXm8aA.5n3C.jzc4WAkcwegwJ.KYwT34MChttVsWWWiDKjCYX26xS', 'Coordinateur Général (Fioul, Chauffage ViCare, CCA)', 'cyan'),
    (2, 'Marguerite', 'Marguerite Jamet', 'marguerite@sci-familiale.fr', '$2b$12$uLdofrFqSehB1TcAwi4lSeIMglSbFwBN8VkvByEN4MI3gNDSuh5Se', 'Responsable Équipements (Frigo Schtroudel, Buanderie)', 'purple'),
    (3, 'Hortense', 'Hortense Jamet', 'hortense@sci-familiale.fr', '$2b$12$Ief8ixQF6zyeYNzB19t5kOs7DtmYDz/0i36KU6UTlcTls2ZGMoDsq', 'Responsable Espaces Verts (Jardinier Perrot, Starlink)', 'rose'),
    (4, 'Joséphine', 'Joséphine Jamet', 'josephine@sci-familiale.fr', '$2b$12$2sED5uWmten8WZhlcmdPO.2LZWrm7F3jVybdh7kjBMJWAmBfiGPiW', 'Coordinatrice Adjointe (Clés, Boîtier Sud, Vêtements)', 'emerald'),
    (5, 'Eugénie', 'Eugénie Jamet', 'eugenie@sci-familiale.fr', '$2b$12$UOpss6kz2r68z/BwarZ1euRHeLQorjdDLj8R5S0Sg2TDov/IZ.ose', 'Responsable Peintures SdB & Tri Sélectif', 'amber'),
    (6, 'Frédéric', 'Frédéric Jamet', 'frederic@sci-familiale.fr', '$2b$12$WrOgOAUsF4.HJKv8vr2VFumxO59dVAnaVFpYx7Mde0S6WToc1wJBm', 'Responsable Électricité & Linky Tempo (Contacteur 0/HC)', 'blue'),
    (7, 'Maman', 'Maman (Élisabeth) Jamet', 'maman@sci-familiale.fr', '$2b$12$UzYp.OYp4RpskCVMQTGG1OjC5BZYOs2r4DYXLfGUgdLSwhQKQpzYW', 'Membre Associé', 'teal')
ON CONFLICT (prenom) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    avatar_color = EXCLUDED.avatar_color;

SELECT setval('members_id_seq', (SELECT COALESCE(MAX(id), 1) FROM members));
