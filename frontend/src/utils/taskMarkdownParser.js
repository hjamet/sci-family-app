/**
 * Utilitaire ultra-robuste de parsing des artefacts Markdown de tâches
 * générés selon la structure canonique de sci-task-creator (ou formats équivalents).
 */

const CANONICAL_SUBJECTS = [
  'Presbytère',
  'Rosings',
  'Piscine',
  'Jardin & Espaces Verts',
  'Petites cabanes',
  'Hangar à meuble',
  'SCI & Administratif',
];

/**
 * Déduit le sujet / emplacement à partir du texte complet.
 * Priorise les détections matérielles précises (Petites cabanes pour chaufferie, etc.)
 */
export function deduceSubject(text = '') {
  const t = text.toLowerCase();

  // Piscine
  if (t.includes('piscine') || t.includes('bassin') || t.includes('liner') || t.includes('pompe à chaleur') || t.includes('chlore')) {
    return 'Piscine';
  }

  // Petites cabanes (chaufferie, fioul, outillage extérieur)
  if (
    t.includes('petite cabane') ||
    t.includes('petites cabanes') ||
    t.includes('chaufferie') ||
    t.includes('chaudière') ||
    t.includes('chaudiere') ||
    t.includes('fioul') ||
    t.includes('cuve fioul') ||
    t.includes('bompais') ||
    t.includes('ramonage')
  ) {
    return 'Petites cabanes';
  }

  // Hangar à meuble
  if (t.includes('hangar à meuble') || t.includes('hangar a meuble') || t.includes('hangar')) {
    return 'Hangar à meuble';
  }

  // Jardin & Espaces Verts
  if (
    t.includes('jardin') ||
    t.includes('espace vert') ||
    t.includes('espaces verts') ||
    t.includes('haie') ||
    t.includes('tonte') ||
    t.includes('tondeuse') ||
    t.includes('élagage') ||
    t.includes('elagage') ||
    t.includes('arbre') ||
    t.includes('tronçonneuse') ||
    t.includes('tronconneuse') ||
    t.includes('parc')
  ) {
    return 'Jardin & Espaces Verts';
  }

  // SCI & Administratif
  if (
    t.includes('administratif') ||
    t.includes('notaire') ||
    t.includes('banque') ||
    t.includes('assurance') ||
    t.includes('impôt') ||
    t.includes('impot') ||
    t.includes('chorus') ||
    t.includes('factur-x') ||
    t.includes('assemblée générale') ||
    t.includes('statuts') ||
    t.includes('comptab')
  ) {
    return 'SCI & Administratif';
  }

  // Rosings
  if (t.includes('rosings')) {
    return 'Rosings';
  }

  // Presbytère par défaut
  if (t.includes('presbytère') || t.includes('presbytere')) {
    return 'Presbytère';
  }

  return 'Presbytère';
}

/**
 * Déduit la récurrence si mentionnée dans le texte (ex: "2 ans et demi" -> 30 mois).
 */
export function deduceRecurrence(text = '') {
  const t = text.toLowerCase();

  // 2 ans et demi / 2,5 ans -> 30 mois
  if (t.includes('2 ans et demi') || t.includes('2 ans 1/2') || t.includes('2,5 ans') || t.includes('2.5 ans')) {
    return { isRecurring: true, interval: 30, unit: 'mois' };
  }

  // 1 an et demi / 1,5 an -> 18 mois
  if (t.includes('1 an et demi') || t.includes('1 an 1/2') || t.includes('1,5 an') || t.includes('1.5 an')) {
    return { isRecurring: true, interval: 18, unit: 'mois' };
  }

  // X ans
  const yearsMatch = t.match(/tous les (\d+)\s*ans/i) || t.match(/chaque (\d+)\s*ans/i) || t.match(/(\d+)\s*ans/i);
  if (yearsMatch) {
    const val = parseInt(yearsMatch[1], 10);
    if (!isNaN(val) && val > 0 && val <= 30) {
      return { isRecurring: true, interval: val * 12, unit: 'mois' };
    }
  }

  // Annuel / tous les ans / chaque année
  if (t.includes('tous les ans') || t.includes('chaque année') || t.includes('chaque annee') || t.includes('annuel') || t.includes('annuelle')) {
    return { isRecurring: true, interval: 12, unit: 'mois' };
  }

  // Semestriel / 6 mois
  if (t.includes('semestriel') || t.includes('tous les 6 mois') || t.includes('chaque semestre')) {
    return { isRecurring: true, interval: 6, unit: 'mois' };
  }

  // Trimestriel / 3 mois
  if (t.includes('trimestriel') || t.includes('tous les 3 mois') || t.includes('chaque trimestre')) {
    return { isRecurring: true, interval: 3, unit: 'mois' };
  }

  // X mois
  const monthsMatch = t.match(/tous les (\d+)\s*mois/i) || t.match(/chaque (\d+)\s*mois/i);
  if (monthsMatch) {
    const val = parseInt(monthsMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      return { isRecurring: true, interval: val, unit: 'mois' };
    }
  }

  // X semaines
  const weeksMatch = t.match(/toutes les (\d+)\s*semaines/i) || t.match(/tous les (\d+)\s*semaines/i);
  if (weeksMatch) {
    const val = parseInt(weeksMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      return { isRecurring: true, interval: val, unit: 'semaines' };
    }
  }

  if (t.includes('chaque semaine') || t.includes('hebdomadaire')) {
    return { isRecurring: true, interval: 1, unit: 'semaines' };
  }

  // Séjour
  if (t.includes('chaque séjour') || t.includes('chaque sejour') || t.includes('tous les séjours')) {
    return { isRecurring: true, interval: 1, unit: 'sejours' };
  }

  return { isRecurring: false, interval: 1, unit: 'semaines' };
}

/**
 * Nettoie une chaîne de caractères en retirant les délimiteurs Markdown superflus.
 */
function cleanMarkdownText(str = '') {
  return str.replace(/^`+|`+$/g, '').trim();
}

/**
 * Parse l'intégralité d'un document Markdown de tâche SCI.
 * 
 * @param {string} markdownText - Contenu Markdown brut de l'artefact
 * @returns {object} Données structurées prêtes pour le formulaire d'édition
 */
export function parseTaskMarkdown(markdownText = '') {
  if (!markdownText || typeof markdownText !== 'string') {
    return {
      title: '',
      description: '',
      subject: 'Presbytère',
      checklist: [],
      keyValues: [],
      documents: [],
      externalLinks: [],
      isRecurring: false,
      recurrenceInterval: 1,
      recurrenceUnit: 'semaines',
    };
  }

  const rawText = markdownText.trim();

  // Découpage des sections par regex insensible à la casse
  const sec1Index = rawText.search(/###?\s*1[.)]\s*Titre|^#\s+Titre|Titre\s*de\s*la\s*t[âa]che/i);
  const sec2Index = rawText.search(/###?\s*2[.)]\s*Description|Description\s*compl[èe]te/i);
  const sec3Index = rawText.search(/###?\s*3[.)]\s*(?:To-Do|Étapes|Etapes)|To-Do\s*List/i);
  const sec4Index = rawText.search(/###?\s*4[.)]\s*(?:Tableau|Informations)|Informations\s*Importantes/i);
  const sec5Index = rawText.search(/###?\s*5[.)]\s*(?:Tableau|Documents)|Documents\s*(?:&|et)\s*Photos/i);

  // 1. Titre de la tâche
  let title = '';
  if (sec1Index !== -1) {
    const end = sec2Index !== -1 ? sec2Index : (sec3Index !== -1 ? sec3Index : rawText.length);
    const sec1Text = rawText.slice(sec1Index, end);

    // Bloc de code copiable ```text ... ```
    const codeMatch = sec1Text.match(/```(?:text)?\s*\n?([\s\S]*?)\n?```/i);
    if (codeMatch && codeMatch[1].trim()) {
      title = codeMatch[1].trim();
    } else {
      // Sinon ligne après l'en-tête ### 1.
      const lines = sec1Text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('#') && !line.startsWith('`')) {
          title = line;
          break;
        }
      }
    }
  }

  // Fallback titre : premier H1 `# ...` au début du texte
  if (!title) {
    const h1Match = rawText.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1].trim() && !h1Match[1].toLowerCase().includes('sources') && !h1Match[1].toLowerCase().includes('rapport')) {
      title = h1Match[1].trim();
    }
  }

  // 2. Description complète
  let description = '';
  if (sec2Index !== -1) {
    const end = sec3Index !== -1 ? sec3Index : (sec4Index !== -1 ? sec4Index : rawText.length);
    const sec2Text = rawText.slice(sec2Index, end);

    const codeMatch = sec2Text.match(/```(?:text)?\s*\n?([\s\S]*?)\n?```/i);
    if (codeMatch && codeMatch[1].trim()) {
      description = codeMatch[1].trim();
    } else {
      // Si pas de bloc de code fermé, prendre les lignes sous le titre de section
      const lines = sec2Text.split('\n');
      const filtered = lines.filter((l) => !l.startsWith('#') && !l.trim().startsWith('```'));
      description = filtered.join('\n').trim();
    }
  }

  // 3. To-Do List des étapes
  const checklist = [];
  if (sec3Index !== -1) {
    const end = sec4Index !== -1 ? sec4Index : (sec5Index !== -1 ? sec5Index : rawText.length);
    const sec3Text = rawText.slice(sec3Index, end);
    const lines = sec3Text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const taskBoxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/);
      if (taskBoxMatch) {
        checklist.push({
          text: taskBoxMatch[2].trim(),
          done: taskBoxMatch[1].toLowerCase() === 'x',
        });
      } else {
        const bulletMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
        if (bulletMatch && !line.startsWith('---') && !bulletMatch[1].startsWith('[')) {
          checklist.push({
            text: bulletMatch[1].trim(),
            done: false,
          });
        }
      }
    }
  }

  // 4. Informations importantes (Tableau Clé / Valeur)
  const keyValues = [];
  const externalLinks = [];
  if (sec4Index !== -1) {
    const end = sec5Index !== -1 ? sec5Index : rawText.length;
    const sec4Text = rawText.slice(sec4Index, end);
    const lines = sec4Text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.includes('|')) continue;
      // Ignorer séparateurs |---|---|
      if (/^\|[\s\-:|]+\|$/.test(line)) continue;

      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((c, idx, arr) => (idx > 0 && idx < arr.length - 1) || (idx === 0 && c) || (idx === arr.length - 1 && c));

      if (cells.length >= 2) {
        const k = cells[0];
        const v = cells.slice(1).join(' - ');
        if (k.toLowerCase() === 'clé' || k.toLowerCase() === 'cle' || k.toLowerCase() === 'information') continue;

        if (k && v) {
          keyValues.push({ key: k, value: v });

          // Si la valeur contient une URL, l'ajouter également à externalLinks
          if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('www.')) {
            const url = v.startsWith('www.') ? `https://${v}` : v;
            externalLinks.push({ label: k, url });
          }
        }
      }
    }
  }

  // 5. Tableau des Documents & Photos Importants
  const documents = [];
  if (sec5Index !== -1) {
    const sec5Text = rawText.slice(sec5Index);
    const lines = sec5Text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.includes('|')) continue;
      if (/^\|[\s\-:|]+\|$/.test(line)) continue;

      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((c, idx, arr) => (idx > 0 && idx < arr.length - 1) || (idx === 0 && c) || (idx === arr.length - 1 && c));

      if (cells.length >= 2) {
        const docName = cells[0];
        const docType = cells[1] || 'Document';
        const rawLink = cells[2] || '';
        const docStatus = cells[3] || 'À uploader';

        if (docName.toLowerCase().includes('document') && docType.toLowerCase().includes('type')) {
          continue;
        }

        // Extraction de l'URL si encapsulée dans un wikilink ou markdown link
        let extractedUrl = rawLink;
        const mdLinkMatch = rawLink.match(/\[.*?\]\((.*?)\)/);
        if (mdLinkMatch) {
          extractedUrl = mdLinkMatch[1].trim();
        } else {
          const wikiMatch = rawLink.match(/\[\[(.*?)\]\]/);
          if (wikiMatch) {
            extractedUrl = wikiMatch[1].trim();
          }
        }

        if (docName) {
          documents.push({
            name: docName,
            filename: docName,
            type: docType,
            url: extractedUrl,
            status: docStatus,
            file_url: extractedUrl,
          });

          // Si le lien est une URL web, ajouter aussi dans externalLinks
          if (extractedUrl.startsWith('http://') || extractedUrl.startsWith('https://') || extractedUrl.startsWith('www.')) {
            const url = extractedUrl.startsWith('www.') ? `https://${extractedUrl}` : extractedUrl;
            externalLinks.push({ label: docName, url });
          }
        }
      }
    }
  }

  // Déductions sémantiques (Sujet et Récurrence)
  const subject = deduceSubject(rawText);
  const recurrence = deduceRecurrence(rawText);

  return {
    title: cleanMarkdownText(title),
    description,
    subject,
    checklist,
    keyValues,
    documents,
    externalLinks,
    isRecurring: recurrence.isRecurring,
    recurrenceInterval: recurrence.interval,
    recurrenceUnit: recurrence.unit,
  };
}
