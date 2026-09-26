import os
import sys
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Add candidate backend directories to sys.path
candidate_backend_dirs = [
    os.path.join(os.getcwd(), "backend"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"),
    os.getcwd(),
    os.path.dirname(os.path.abspath(__file__)),
]

for d in candidate_backend_dirs:
    if os.path.isdir(d) and d not in sys.path:
        sys.path.insert(0, d)

app = None
handler = None

try:
    from app.main import app as main_app
    app = main_app
    handler = main_app
except Exception as import_err:
    err_tb = traceback.format_exc()
    print(f"CRITICAL VERCEL SERVERLESS IMPORT ERROR: {err_tb}", file=sys.stderr)
    
    fallback_app = FastAPI(title="Fallback SCI Error Handler")
    
    @fallback_app.api_route("/api/debug-import", methods=["GET"])
    async def debug_import():
        return {
            "cwd": os.getcwd(),
            "file": __file__,
            "sys_path": sys.path[:5],
            "error": str(import_err),
            "traceback": err_tb.splitlines()
        }

    @fallback_app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    async def catchall(full_path: str, request: Request):
        return JSONResponse(
            status_code=500,
            content={
                "error": "FastAPI initialization failed on Vercel Serverless",
                "details": str(import_err),
                "traceback": err_tb.splitlines()[-10:]
            }
        )
    
    app = fallback_app
    handler = fallback_app
