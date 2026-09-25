# ⚠️ AVERTISSEMENT : SANCTUAIRE DE DESIGN STITCH BRUT

⚠️ AVERTISSEMENT : CE DOSSIER EST UN SANCTUAIRE DE DESIGN STITCH BRUT. INTERDICTION FORMELLE ET ABSOLUE POUR TOUT AGENT OU DÉVELOPPEUR DE LE MODIFIER MANUELLEMENT OU DE L'UTILISER DIRECTEMENT EN PRODUCTION (RUNTIME). IL EST EXCLUSIVEMENT ALIMENTÉ PAR STITCH_SYNC.PY ET SERT DE BASE DE DIFF VERSIONNÉE PAR GIT POUR LES MISES À JOUR.

- **Source de Vérité Design** : Google Stitch (`https://stitch.withgoogle.com`)
- **Script Alimentateur** : `_agents/scripts-for-skills/stitch_sync.py`
- **Règle d'Intégration** : L'agent ou le développeur consulte `git diff` sur ce dossier et reporte chirurgicalement les modifications nécessaires dans le code applicatif (`src/`, etc.) sans jamais altérer ce dossier.
