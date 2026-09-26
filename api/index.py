import os
import sys

# Ensure backend directory is in Python module path for relative and absolute imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Import the configured FastAPI application from backend/app/main.py
try:
    from app.main import app
    handler = app
except Exception as err:
    import traceback
    err_tb = traceback.format_exc()
    print(f"CRITICAL VERCEL SERVERLESS IMPORT ERROR: {err_tb}", file=sys.stderr)
    try:
        from fastapi import FastAPI
        from fastapi.responses import JSONResponse
        fallback_app = FastAPI()
        @fallback_app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
        async def fallback_catchall(full_path: str):
            return JSONResponse(
                status_code=500,
                content={
                    "error": "FastAPI initialization failed on Vercel Serverless",
                    "details": str(err),
                    "traceback": err_tb.splitlines()[-5:]
                }
            )
        handler = fallback_app
    except Exception:
        raise err
