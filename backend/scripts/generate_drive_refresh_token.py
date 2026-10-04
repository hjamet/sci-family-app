#!/usr/bin/env python3
"""
Génération du Google Drive OAuth Refresh Token pour la SCI Hellenvilliers.

Usage :
    python backend/scripts/generate_drive_refresh_token.py [--port 8089]

Description :
    1. Charge les identifiants client GCP Desktop depuis les variables d'environnement
       ou depuis backend/.env (GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET).
    2. Démarre un flux OAuth2 Desktop (InstalledAppFlow) sur une boucle locale (localhost).
    3. Affiche l'URL d'autorisation Google dans la console pour permettre la connexion
       avec le compte propriétaire (lopilopilo24@gmail.com).
    4. Récupère le refresh_token lors du callback local avec access_type='offline' et prompt='consent'.
    5. Écrit le refresh_token obtenu de manière sécurisée dans le fichier local non versionné
       `backend/.drive_refresh_token` (sans jamais l'afficher en clair dans la console ni dans les logs).
    6. Ce jeton doit ensuite être renseigné dans la variable d'environnement
       GOOGLE_DRIVE_REFRESH_TOKEN sur Vercel (Production) et dans backend/.env.
"""

import os
import sys
import argparse
import logging
from pathlib import Path

# Configuration du logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("generate_drive_refresh_token")

# Tentative de chargement du fichier backend/.env si non déjà chargé
try:
    from dotenv import load_dotenv
    scripts_dir = Path(__file__).resolve().parent
    backend_dir = scripts_dir.parent
    for env_candidate in [backend_dir / ".env", backend_dir.parent / ".env"]:
        if env_candidate.exists():
            load_dotenv(env_candidate)
            break
except ImportError:
    pass

SCOPES = ["https://www.googleapis.com/auth/drive"]


def main():
    parser = argparse.ArgumentParser(description="Génère un refresh token Google Drive Desktop.")
    parser.add_argument("--port", type=int, default=8089, help="Port local pour le callback OAuth (défaut: 8089)")
    args = parser.parse_args()

    client_id = os.getenv("GOOGLE_DRIVE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_DRIVE_CLIENT_SECRET")

    if not client_id or not client_secret:
        logger.error("GOOGLE_DRIVE_CLIENT_ID ou GOOGLE_DRIVE_CLIENT_SECRET manquant dans l'environnement ou .env.")
        sys.exit(1)

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as e:
        logger.error(f"Bibliothèque google-auth-oauthlib manquante : {e}")
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [f"http://localhost:{args.port}/", "urn:ietf:wg:oauth:2.0:oob"]
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)

    auth_prompt = (
        "\n"
        "=" * 80 + "\n"
        "OUVREZ CETTE URL DANS VOTRE NAVIGATEUR POUR AUTORISER L'APPLICATION GOOGLE DRIVE :\n"
        "{url}\n"
        "=" * 80 + "\n\n"
        f"En attente du callback OAuth sur http://localhost:{args.port}/ ...\n"
    )

    logger.info(f"Démarrage du serveur local d'autorisation OAuth sur le port {args.port}...")
    sys.stdout.flush()

    try:
        creds = flow.run_local_server(
            host="localhost",
            port=args.port,
            authorization_prompt_message=auth_prompt,
            success_message="Authentification réussie ! Le jeton a été transmis au script. Vous pouvez fermer cette fenêtre.",
            open_browser=False,
            access_type="offline",
            prompt="consent"
        )
    except Exception as e:
        logger.error(f"Erreur lors de l'exécution du serveur OAuth local : {e}")
        sys.exit(1)

    if not creds or not creds.refresh_token:
        logger.error("Aucun refresh_token n'a été retourné par Google. Vérifiez que prompt='consent' est bien actif.")
        sys.exit(1)

    # Sauvegarde sécurisée dans backend/.drive_refresh_token
    scripts_dir = Path(__file__).resolve().parent
    backend_dir = scripts_dir.parent
    token_file = backend_dir / ".drive_refresh_token"

    try:
        with open(token_file, "w", encoding="utf-8") as f:
            f.write(creds.refresh_token.strip())
        os.chmod(token_file, 0o600)
    except Exception as e:
        logger.error(f"Erreur lors de l'écriture du refresh token dans {token_file} : {e}")
        sys.exit(1)

    logger.info(f"[SUCCESS] Refresh token obtenu et sauvegardé avec succès dans {token_file}")
    logger.info("Le jeton est prêt à être configuré sur Vercel (GOOGLE_DRIVE_REFRESH_TOKEN) et dans backend/.env.")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
