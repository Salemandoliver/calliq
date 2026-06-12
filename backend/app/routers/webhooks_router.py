"""RingCentral webhook receiver.

Subscription flow:
1. We create a webhook subscription on RingCentral for telephony/recording events
   (see pipeline/ringcentral.py setup_subscription()).
2. RingCentral validates the endpoint with a Validation-Token header — we must echo it back.
3. On each completed recorded call, RingCentral POSTs an event; we enqueue a Call row
   with status='queued'; the worker picks it up, downloads audio, transcribes and analyses.
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Call, User

log = logging.getLogger("calliq.webhooks")
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/ringcentral")
async def ringcentral_webhook(request: Request, db: Session = Depends(get_db)):
    # Endpoint validation handshake
    vt = request.headers.get("Validation-Token")
    if vt:
        return Response(headers={"Validation-Token": vt})

    payload = await request.json()
    body = payload.get("body", {})
    log.info("RingCentral event: %s", payload.get("event", ""))

    # Telephony session event with a recording
    recordings = body.get("recordings") or []
    session_id = body.get("sessionId") or body.get("telephonySessionId")
    if not recordings or not session_id:
        return {"ok": True, "ignored": True}

    if db.query(Call).filter(Call.rc_session_id == str(session_id)).first():
        return {"ok": True, "duplicate": True}

    parties = body.get("parties", [])
    direction, from_num, to_num, ext_id = "outbound", "", "", None
    for p in parties:
        if p.get("extensionId"):
            ext_id = str(p["extensionId"])
            direction = (p.get("direction") or "outbound").lower()
            from_num = (p.get("from") or {}).get("phoneNumber", "")
            to_num = (p.get("to") or {}).get("phoneNumber", "")

    host = db.query(User).filter(User.rc_extension_id == ext_id).first() if ext_id else None
    activity = "Outbound - Acquisition" if direction == "outbound" else "Inbound - Call From Customer"

    call = Call(
        host_id=host.id if host else None,
        direction="outbound" if direction.startswith("out") else "inbound",
        activity_type=activity,
        from_number=from_num, to_number=to_num,
        started_at=datetime.utcnow(),
        status="queued",
        rc_session_id=str(session_id),
        rc_recording_id=str(recordings[0].get("id", "")),
    )
    db.add(call)
    db.commit()
    return {"ok": True, "call_id": call.id}
