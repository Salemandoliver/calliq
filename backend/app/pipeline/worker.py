"""Background worker: processes queued calls through the full pipeline and runs
scheduled jobs (weekly reports, retention purge).

Run with:  python -m app.pipeline.worker
"""
import logging
import time
from datetime import datetime, timedelta

from ..config import settings
from ..db import Base, engine, SessionLocal
from ..models import (Call, TranscriptTurn, CallAnalysis, CallScore, CallTopic,
                      Playbook, Topic, VocabularyTerm, Setting, Report)
from .metrics import compute_metrics
from .transcriber import get_transcriber, assign_roles
from .analyzer import analyze_call
from .ringcentral import RingCentralClient

log = logging.getLogger("calliq.worker")
POLL_SECONDS = 5


def process_call(db, call: Call) -> None:
    rc = RingCentralClient()

    # 1. Download audio
    if not call.audio_path and call.rc_recording_id:
        call.status = "downloading"
        db.commit()
        call.audio_path = rc.download_recording(call.rc_recording_id, settings.audio_dir)
        db.commit()

    # 2. Transcribe with diarization + custom vocabulary
    call.status = "transcribing"
    db.commit()
    keyterms = [v.term for v in db.query(VocabularyTerm).all()]
    raw_turns = get_transcriber().transcribe(call.audio_path, keyterms)
    turns = assign_roles(raw_turns)
    if not turns:
        call.status = "completed"  # silence/voicemail with no speech
        db.commit()
        return

    db.query(TranscriptTurn).filter(TranscriptTurn.call_id == call.id).delete()
    rep_name = call.host.name if call.host else "Rep"
    for t in turns:
        db.add(TranscriptTurn(call_id=call.id, speaker=t["speaker"],
                              speaker_name=rep_name if t["speaker"] == "rep" else "Customer",
                              start_sec=t["start_sec"], end_sec=t["end_sec"], text=t["text"]))
    if not call.duration_sec:
        call.duration_sec = int(turns[-1]["end_sec"])
    db.commit()

    # 3. Analyse with Claude
    call.status = "analyzing"
    db.commit()
    playbooks = [{"id": p.id, "name": p.name, "description": p.description,
                  "criteria": p.criteria}
                 for p in db.query(Playbook).filter(Playbook.active == True).all()  # noqa: E712
                 if not p.activity_types or call.activity_type in p.activity_types]
    topics = [{"id": t.id, "name": t.name, "keywords": t.keywords}
              for t in db.query(Topic).filter(Topic.active == True).all()]  # noqa: E712
    ai_ctx = (db.get(Setting, "ai_context") or Setting(value={})).value.get("text", "")

    result = analyze_call(turns, rep_name, call.activity_type, playbooks, topics, ai_ctx)

    # 4. Persist analysis + computed engagement metrics
    m = compute_metrics(turns)
    db.query(CallAnalysis).filter(CallAnalysis.call_id == call.id).delete()
    db.add(CallAnalysis(
        call_id=call.id,
        summary_intro=result.get("summary_intro", ""),
        summary_points=result.get("summary_points", []),
        action_items=result.get("action_items", []),
        key_points=result.get("key_points", []),
        themes=result.get("themes", []),
        sentiment=result.get("sentiment", "neutral"),
        **{k: m.get(k, 0) for k in ("talk_ratio", "longest_monologue_sec",
                                    "longest_customer_story_sec", "talking_speed_wpm",
                                    "patience_sec", "question_rate")},
    ))
    db.query(CallTopic).filter(CallTopic.call_id == call.id).delete()
    for dt in result.get("detected_topics", []):
        if db.get(Topic, dt.get("topic_id")):
            db.add(CallTopic(call_id=call.id, topic_id=dt["topic_id"],
                             mentions=dt.get("mentions", 1),
                             first_mention_sec=dt.get("first_mention_sec", 0)))
    db.query(CallScore).filter(CallScore.call_id == call.id).delete()
    for s in result.get("scores", []):
        if db.get(Playbook, s.get("playbook_id")):
            db.add(CallScore(call_id=call.id, playbook_id=s["playbook_id"],
                             overall=float(s.get("overall", 0)),
                             criteria=s.get("criteria", []),
                             coaching=s.get("coaching", "")))
    call.status = "completed"
    call.error = None
    db.commit()
    log.info("Call %s completed", call.id)


def poll_ringcentral(db) -> int:
    """Pilot mode: pull new recorded calls from the call log (no webhook needed)."""
    rc = RingCentralClient()
    records = rc.backfill_call_log(days=1)
    added = 0
    for r in records:
        if not r["rc_session_id"]:
            continue
        if db.query(Call).filter(Call.rc_session_id == r["rc_session_id"]).first():
            continue
        from ..models import User
        host = (db.query(User).filter(User.rc_extension_id == r["extension_id"]).first()
                if r["extension_id"] else None)
        direction = "outbound" if r["direction"].startswith("out") else "inbound"
        started = datetime.utcnow()
        if r["started_at"]:
            try:
                started = datetime.fromisoformat(
                    r["started_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                pass
        db.add(Call(
            host_id=host.id if host else None,
            direction=direction,
            activity_type=("Outbound - Acquisition" if direction == "outbound"
                           else "Inbound - Call From Customer"),
            from_number=r["from_number"], to_number=r["to_number"],
            started_at=started, duration_sec=r["duration_sec"], status="queued",
            rc_session_id=r["rc_session_id"], rc_recording_id=r["rc_recording_id"],
        ))
        added += 1
    if added:
        db.commit()
        log.info("Poller queued %d new calls", added)
    return added


def retention_purge(db) -> None:
    if settings.retention_days <= 0:
        return
    import os
    cutoff = datetime.utcnow() - timedelta(days=settings.retention_days)
    from ..models import Comment, ListenEvent
    old = db.query(Call).filter(Call.started_at < cutoff).all()
    for c in old:
        if c.audio_path and os.path.exists(c.audio_path):
            try:
                os.remove(c.audio_path)
            except OSError:
                pass
        db.query(Comment).filter(Comment.call_id == c.id).delete()
        db.query(ListenEvent).filter(ListenEvent.call_id == c.id).delete()
        db.delete(c)
    if old:
        db.commit()
        log.info("Retention purge removed %d calls", len(old))


def maybe_weekly_reports(db) -> None:
    """Each Monday, generate last week's coaching profile reports per team."""
    now = datetime.utcnow()
    if now.weekday() != 0:
        return
    end = datetime(now.year, now.month, now.day)
    start = end - timedelta(days=7)
    exists = db.query(Report).filter(Report.period_start == start,
                                     Report.report_type == "coaching_profiles").first()
    if exists:
        return
    from ..services.reports import generate_coaching_report
    try:
        generate_coaching_report(db, start, end, None)
        log.info("Weekly coaching report generated")
    except Exception:
        log.exception("Weekly report generation failed")


def run_forever() -> None:
    Base.metadata.create_all(bind=engine)
    log.info("Worker started (demo_mode=%s)", settings.demo_mode)
    last_housekeeping = datetime.min
    last_poll = datetime.min
    while True:
        db = SessionLocal()
        try:
            if (settings.rc_poll_minutes > 0 and settings.ringcentral_client_id
                    and datetime.utcnow() - last_poll
                    > timedelta(minutes=settings.rc_poll_minutes)):
                try:
                    poll_ringcentral(db)
                except Exception:
                    log.exception("RingCentral poll failed")
                last_poll = datetime.utcnow()
            call = (db.query(Call).filter(Call.status == "queued")
                    .order_by(Call.started_at).first())
            if call:
                try:
                    process_call(db, call)
                except Exception as e:
                    log.exception("Call %s failed", call.id)
                    db.rollback()
                    call = db.get(Call, call.id)
                    call.status = "failed"
                    call.error = str(e)[:2000]
                    db.commit()
            if datetime.utcnow() - last_housekeeping > timedelta(hours=1):
                retention_purge(db)
                maybe_weekly_reports(db)
                last_housekeeping = datetime.utcnow()
        finally:
            db.close()
        if not call:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_forever()
