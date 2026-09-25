import os
import sys

# Ensure backend directory is in Python module path for relative and absolute imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Import the configured FastAPI application from backend/app/main.py
from app.main import app

# Vercel Serverless ASGI entrypoint handler
handler = app
