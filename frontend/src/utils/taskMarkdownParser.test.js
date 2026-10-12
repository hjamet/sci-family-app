import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskMarkdown, deduceSubject, deduceRecurrence } from './taskMarkdownParser.js';

describe('taskMarkdownParser', () => {
  const sampleMarkdown = `# Entretien annuel de la chaudière fioul (EURL Bompais)

### 1. Titre de la Tâche (prêt à copier)
\`\`\`text
Entretenir la chaudière fioul (EURL Bompais)
\`\`\`

### 2. Description Complète (Bloc de Code UNIQUE Copiable)
\`\`\`text
But & En quoi consiste la tâche :
Entretien annuel obligatoire de la chaudière fioul assurant le chauffage du Presbytère. Nettoyage du brûleur, remplacement du gicleur, vérification de la pompe et ramonage du conduit de fumée.

Contexte & Historique :
Papa avait l'habitude de faire intervenir l'EURL Bompais chaque année en octobre... Dernière facture 2024 de 185 € TTC.

Emplacement Physique Réel :
Petite cabane extérieure chaufferie attenante au Presbytère.

Options de Règlement SCI :
Carte bancaire SCI, facturation Chorus 0225:977529312 ou avance remboursée.
\`\`\`

### 3. To-Do List des Étapes à Réaliser
- [ ] Prise de contact et convenance du rendez-vous d'intervention.
- [ ] Accueil de l'artisan et ouverture des accès.
- [x] Vérifier la cuve fioul avant l'arrivée.
- [ ] Demande de la facture officielle au nom de la SCI HELLENVILLIERS.

### 4. Tableau des Informations Importantes (Format STRICT Clé / Valeur)
| Clé | Valeur |
|---|---|
| Entreprise | EURL Bompais |
| Téléphone | 02 32 34 47 55 |
| Email | contact@bompais.fr |
| Site Internet | https://www.bompais-chauffage.fr |
| Identifiant Chorus | 0225:977529312 |
| Coût habituel | 185 € TTC |

### 5. Tableau des Documents & Photos Importants (avec liens locaux cliquables)
| Document / Photo | Type | Lien | Statut |
|---|---|---|---|
| Facture 2024 Chaudiere.pdf | Facture | [Facture](file:///C:/Users/Jamet/Documents/VoiceNotes/administratif/Bompais%20102024%20Facture.pdf) | À uploader |
| Photo Chaufferie Cabane.jpg | Photo | [Photo](file:///C:/Users/Jamet/Documents/VoiceNotes/_attachments/Chaufferie.jpg) | Déjà lié |
`;

  it('extrait fidèlement le titre de la tâche', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.title, 'Entretenir la chaudière fioul (EURL Bompais)');
  });

  it('extrait la description complète du bloc de code copiable', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.match(res.description, /Entretien annuel obligatoire de la chaudière/);
    assert.match(res.description, /Petite cabane extérieure/);
  });

  it('extrait correctement la checklist avec le statut des cases', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.checklist.length, 4);
    assert.equal(res.checklist[0].text, "Prise de contact et convenance du rendez-vous d'intervention.");
    assert.equal(res.checklist[0].done, false);
    assert.equal(res.checklist[2].text, "Vérifier la cuve fioul avant l'arrivée.");
    assert.equal(res.checklist[2].done, true);
  });

  it('extrait les clés-valeurs et détecte les URLs associées', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.keyValues.length, 6);
    assert.deepEqual(res.keyValues[0], { key: 'Entreprise', value: 'EURL Bompais' });
    assert.deepEqual(res.keyValues[1], { key: 'Téléphone', value: '02 32 34 47 55' });
    assert.deepEqual(res.keyValues[3], { key: 'Site Internet', value: 'https://www.bompais-chauffage.fr' });

    // Liens externes déduits
    assert.ok(res.externalLinks.some((l) => l.url === 'https://www.bompais-chauffage.fr'));
  });

  it('extrait les documents et photos avec URLs et statuts', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.documents.length, 2);
    assert.equal(res.documents[0].name, 'Facture 2024 Chaudiere.pdf');
    assert.equal(res.documents[0].type, 'Facture');
    assert.equal(res.documents[0].url, 'file:///C:/Users/Jamet/Documents/VoiceNotes/administratif/Bompais%20102024%20Facture.pdf');
    assert.equal(res.documents[0].status, 'À uploader');
  });

  it('déduit le sujet / emplacement exact', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.subject, 'Petites cabanes');

    assert.equal(deduceSubject('Entretien annuel de la piscine'), 'Piscine');
    assert.equal(deduceSubject('Tonte des pelouses et taille des haies'), 'Jardin & Espaces Verts');
    assert.equal(deduceSubject('Rangement du hangar à meuble'), 'Hangar à meuble');
    assert.equal(deduceSubject('Déclaration impôts et banque SCI'), 'SCI & Administratif');
    assert.equal(deduceSubject('Réparation toiture Rosings'), 'Rosings');
  });

  it('déduit la récurrence temporelle selon les consignes', () => {
    const res = parseTaskMarkdown(sampleMarkdown);
    assert.equal(res.isRecurring, true);
    assert.equal(res.recurrenceInterval, 12);
    assert.equal(res.recurrenceUnit, 'mois');

    const rec2ansDemi = deduceRecurrence('À renouveler tous les 2 ans et demi');
    assert.equal(rec2ansDemi.isRecurring, true);
    assert.equal(rec2ansDemi.interval, 30);
    assert.equal(rec2ansDemi.unit, 'mois');

    const recSemaine = deduceRecurrence('Passage chaque semaine');
    assert.equal(recSemaine.isRecurring, true);
    assert.equal(recSemaine.interval, 1);
    assert.equal(recSemaine.unit, 'semaines');
  });

  it('gère gracieusement le texte vide ou invalide sans lever d\'exception', () => {
    const res = parseTaskMarkdown('');
    assert.equal(res.title, '');
    assert.equal(res.description, '');
    assert.deepEqual(res.checklist, []);
    assert.deepEqual(res.keyValues, []);
    assert.deepEqual(res.documents, []);
  });
});
