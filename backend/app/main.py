import logging
import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .db import Base, engine, SessionLocal
from .routers import (auth_router, calls_router, insights_router,
                      admin_router, reports_router, webhooks_router)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CallIQ API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

for r in (auth_router, calls_router, insights_router, admin_router,
          reports_router, webhooks_router):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.app_name, "demo_mode": settings.demo_mode}


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        from .seed.bootstrap import ensure_bootstrap
        ensure_bootstrap(db)
        if settings.demo_mode:
            from .seed.demo import seed_demo_if_empty
            seed_demo_if_empty(db)
    finally:
        db.close()
    # Single-service deployments (e.g. Railway): run the pipeline worker in-process
    if os.environ.get("RUN_WORKER_IN_APP", "").lower() in ("1", "true", "yes"):
        from .pipeline.worker import run_forever
        threading.Thread(target=run_forever, daemon=True, name="calliq-worker").start()
        logging.getLogger("calliq").info("In-process worker thread started")


# ---- Static frontend (present when built into the image; see root Dockerfile) ----
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = os.path.normpath(os.path.join(_static_dir, full_path))
        if (full_path and candidate.startswith(_static_dir)
                and os.path.isfile(candidate)):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_static_dir, "index.html"))
