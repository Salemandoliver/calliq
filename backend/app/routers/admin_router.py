"""Org settings: users, teams, topics, playbooks, vocabulary, settings, GDPR erasure."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_admin, get_current_user, hash_password
from ..db import get_db
from ..models import (User, Team, Topic, Playbook, VocabularyTerm, Setting, Call)
from ..schemas import (UserOut, UserCreate, UserUpdate, TeamOut, TeamCreate,
                       TopicIn, TopicOut, PlaybookIn, PlaybookOut, VocabularyIn)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---- users ----
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.name).all()]


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(409, "Email already exists")
    u = User(name=body.name, email=body.email.lower(), password_hash=hash_password(body.password),
             role=body.role, job_title=body.job_title, team_id=body.team_id)
    db.add(u)
    db.commit()
    db.refresh(u)
    return UserOut.model_validate(u)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    for field in ("name", "role", "job_title", "team_id", "active"):
        v = getattr(body, field)
        if v is not None:
            setattr(u, field, v)
    if body.password:
        u.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(u)
    return UserOut.model_validate(u)


# ---- teams ----
@router.get("/teams", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [TeamOut.model_validate(t) for t in db.query(Team).order_by(Team.name).all()]


@router.post("/teams", response_model=TeamOut)
def create_team(body: TeamCreate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    t = Team(name=body.name, owner_id=body.owner_id)
    db.add(t)
    db.commit()
    db.refresh(t)
    return TeamOut.model_validate(t)


@router.delete("/teams/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    t = db.get(Team, team_id)
    if t:
        for u in t.users:
            u.team_id = None
        db.delete(t)
        db.commit()
    return {"ok": True}


# ---- topics ----
@router.get("/topics", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [TopicOut.model_validate(t) for t in db.query(Topic).order_by(Topic.name).all()]


@router.post("/topics", response_model=TopicOut)
def create_topic(body: TopicIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    t = Topic(name=body.name, keywords=body.keywords, color=body.color, active=body.active)
    db.add(t)
    db.commit()
    db.refresh(t)
    return TopicOut.model_validate(t)


@router.patch("/topics/{topic_id}", response_model=TopicOut)
def update_topic(topic_id: int, body: TopicIn, db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)):
    t = db.get(Topic, topic_id)
    if not t:
        raise HTTPException(404, "Topic not found")
    t.name, t.keywords, t.color, t.active = body.name, body.keywords, body.color, body.active
    db.commit()
    db.refresh(t)
    return TopicOut.model_validate(t)


@router.delete("/topics/{topic_id}")
def delete_topic(topic_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    t = db.get(Topic, topic_id)
    if t:
        db.delete(t)
        db.commit()
    return {"ok": True}


# ---- playbooks ----
@router.get("/playbooks", response_model=list[PlaybookOut])
def list_playbooks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [PlaybookOut.model_validate(p) for p in db.query(Playbook).order_by(Playbook.name).all()]


@router.post("/playbooks", response_model=PlaybookOut)
def create_playbook(body: PlaybookIn, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    p = Playbook(**body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return PlaybookOut.model_validate(p)


@router.patch("/playbooks/{playbook_id}", response_model=PlaybookOut)
def update_playbook(playbook_id: int, body: PlaybookIn, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    p = db.get(Playbook, playbook_id)
    if not p:
        raise HTTPException(404, "Playbook not found")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return PlaybookOut.model_validate(p)


@router.delete("/playbooks/{playbook_id}")
def delete_playbook(playbook_id: int, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    p = db.get(Playbook, playbook_id)
    if p:
        p.active = False
        db.commit()
    return {"ok": True}


# ---- vocabulary ----
@router.get("/vocabulary")
def list_vocab(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [{"id": v.id, "term": v.term} for v in
            db.query(VocabularyTerm).order_by(VocabularyTerm.term).all()]


@router.post("/vocabulary")
def add_vocab(body: VocabularyIn, db: Session = Depends(get_db),
              admin: User = Depends(require_admin)):
    if not db.query(VocabularyTerm).filter(VocabularyTerm.term == body.term).first():
        db.add(VocabularyTerm(term=body.term))
        db.commit()
    return {"ok": True}


@router.delete("/vocabulary/{vocab_id}")
def delete_vocab(vocab_id: int, db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)):
    v = db.get(VocabularyTerm, vocab_id)
    if v:
        db.delete(v)
        db.commit()
    return {"ok": True}


# ---- org settings ----
@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {s.key: s.value for s in db.query(Setting).all()}


@router.put("/settings/{key}")
def put_setting(key: str, value: dict, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    s = db.get(Setting, key)
    if s:
        s.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()
    return {"ok": True}


# ---- RingCentral setup: register webhook + backfill from the running app ----
@router.post("/ringcentral/setup")
def ringcentral_setup(webhook_url: str = "", backfill_days: int = 0,
                      db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    from ..pipeline.ringcentral import RingCentralClient, queue_backfill
    out: dict = {}
    if webhook_url:
        sub = RingCentralClient().setup_subscription(webhook_url)
        out["subscription_id"] = sub.get("id")
        out["expires"] = sub.get("expirationTime")
    if backfill_days:
        out["queued_calls"] = queue_backfill(db, backfill_days)
    return out


@router.get("/ringcentral/status")
def ringcentral_status(admin: User = Depends(require_admin)):
    """Check connectivity + list active webhook subscriptions."""
    import httpx as _hx
    from ..pipeline.ringcentral import RingCentralClient
    rc = RingCentralClient()
    try:
        token = rc._auth()
        r = _hx.get(f"{rc.base}/restapi/v1.0/subscription",
                    headers={"Authorization": f"Bearer {token}"}, timeout=30)
        subs = [{"id": s.get("id"), "address": (s.get("deliveryMode") or {}).get("address"),
                 "status": s.get("status"), "expires": s.get("expirationTime")}
                for s in r.json().get("records", [])]
        return {"connected": True, "subscriptions": subs}
    except Exception as e:
        return {"connected": False, "error": str(e)[:300]}


# ---- GDPR: erase a customer by phone number ----
@router.delete("/gdpr/erase")
def gdpr_erase(phone: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    import os
    # '+' arrives as a space when the query string isn't encoded; normalise
    phone = phone.strip()
    if phone and not phone.startswith("+"):
        phone = "+" + phone
    calls = db.query(Call).filter((Call.from_number == phone) | (Call.to_number == phone)).all()
    n = 0
    from ..models import Comment as _C, ListenEvent as _L
    for c in calls:
        if c.audio_path and os.path.exists(c.audio_path):
            try:
                os.remove(c.audio_path)
            except OSError:
                pass
        db.query(_C).filter(_C.call_id == c.id).delete()
        db.query(_L).filter(_L.call_id == c.id).delete()
        db.delete(c)  # cascades to turns/analysis/scores/topics
        n += 1
    db.commit()
    return {"erased_calls": n}
