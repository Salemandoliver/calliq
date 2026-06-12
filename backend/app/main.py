import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
