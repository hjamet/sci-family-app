import os
import sys
import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = "http://localhost:8088/"
SCOPE = "https://www.googleapis.com/auth/drive"

auth_code = None

class OAuthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>Authentification reussie ! Vous pouvez fermer cet onglet.</h1>")
        else:
            self.send_response(400)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>Erreur : aucun code recu.</h1>")

def get_auth_url():
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent"
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

def exchange_code_for_tokens(code):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    resp = requests.post(token_url, data=data)
    if resp.status_code != 200:
        raise Exception(f"Echec de l'echange de token ({resp.status_code}): {resp.text}")
    return resp.json()

def main():
    global auth_code
    auth_url = get_auth_url()
    print("AUTH_URL_START:" + auth_url + ":AUTH_URL_END")
    sys.stdout.flush()

    server = HTTPServer(("localhost", 8088), OAuthHandler)
    server.timeout = 120
    print("En attente de la reponse d'autorisation sur http://localhost:8088/ ...")
    sys.stdout.flush()

    while auth_code is None:
        server.handle_request()

    print("Code d'autorisation recu ! Echange contre les tokens...")
    tokens = exchange_code_for_tokens(auth_code)
    
    output = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": tokens.get("refresh_token"),
        "access_token": tokens.get("access_token"),
        "expires_in": tokens.get("expires_in"),
        "scope": tokens.get("scope")
    }

    output_path = os.path.join(os.path.dirname(__file__), "oauth_tokens.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"TOKENS_SAVED_SUCCESSFULLY: {output_path}")
    print("Refresh token present: " + str(bool(tokens.get("refresh_token"))))

if __name__ == "__main__":
    main()
