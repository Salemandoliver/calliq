import logging, os, uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..config import settings
from ..db import SessionLocal
from ..models import Call, User

log = logging.getLogger("calliq.teams")
router = APIRouter(prefix="/api/recordings", tags=["teams-recordings"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_api_key(x_api_key: str = Header(...)):
    if not settings.recordings_api_key:
        raise HTTPException(503, "Recordings endpoint not configured")
    if x_api_key != settings.recordings_api_key:
        raise HTTPException(401, "Unauthorised")

@router.post("/upload", status_code=202)
async def upload_teams_recording(
    file: UploadFile = File(...),
    repId: str = Form(...),
    recordedAt: str | None = Form(None),
    db: Session = Depends(get_db),
    _: None = Depends(verify_api_key),
):
    user = db.query(User).filter(User.email == repId).first()
    if not user:
        log.warning("No user found for repId=%s", repId)
    started_at = datetime.utcnow()
    if recordedAt:
        try:
            started_at = datetime.fromisoformat(recordedAt.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    os.makedirs(settings.audio_dir, exist_ok=True)
    audio_path = os.path.join(settings.audio_dir, f"teams_{uuid.uuid4().hex}.wav")
    with open(audio_path, "wb") as f:
        f.write(await file.read())
    call = Call(
        host_id=user.id if user else None,
        direction="outbound", activity_type="Teams Call",
        from_number="", to_number="",
        customer_name="Unknown", customer_company="",
        started_at=started_at, duration_sec=0,
        audio_path=audio_path, status="queued",
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    log.info("Queued Teams call id=%s for rep=%s", call.id, repId)
    return {"id": call.id, "status": "queued"}
