"""RingCentral integration: JWT auth, recording download, webhook subscription setup,
and historical backfill from the call log."""
import logging
import os
from datetime import datetime, timedelta

import httpx

from ..config import settings

log = logging.getLogger("calliq.ringcentral")


class RingCentralClient:
    def __init__(self):
        self.base = settings.ringcentral_server_url
        self._token: str | None = None
        self._token_expiry = datetime.min

    def _auth(self) -> str:
        if self._token and datetime.utcnow() < self._token_expiry:
            return self._token
        resp = httpx.post(
            f"{self.base}/restapi/oauth/token",
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                  "assertion": settings.ringcentral_jwt},
            auth=(settings.ringcentral_client_id, settings.ringcentral_client_secret),
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expiry = datetime.utcnow() + timedelta(seconds=data["expires_in"] - 60)
        return self._token

    def _get(self, path: str, **kwargs) -> httpx.Response:
        r = httpx.get(f"{self.base}{path}",
                      headers={"Authorization": f"Bearer {self._auth()}"},
                      timeout=120, **kwargs)
        r.raise_for_status()
        return r

    def download_recording(self, recording_id: str, dest_dir: str) -> str:
        """Download recording content to an mp3 file; returns local path."""
        os.makedirs(dest_dir, exist_ok=True)
        r = self._get(f"/restapi/v1.0/account/~/recording/{recording_id}/content")
        path = os.path.join(dest_dir, f"rc_{recording_id}.mp3")
        with open(path, "wb") as f:
            f.write(r.content)
        return path

    def setup_subscription(self, webhook_url: str) -> dict:
        """Create the webhook subscription for telephony session events with recordings.
        Run once at deployment (see scripts/setup_ringcentral.py)."""
        r = httpx.post(
            f"{self.base}/restapi/v1.0/subscription",
            headers={"Authorization": f"Bearer {self._auth()}"},
            json={
                "eventFilters": [
                    "/restapi/v1.0/account/~/telephony/sessions?withRecordings=true",
                ],
                "deliveryMode": {"transportType": "WebHook", "address": webhook_url},
                "expiresIn": 630720000,  # max
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def backfill_call_log(self, days: int = 30) -> list[dict]:
        """Fetch recent recorded calls from the call log for initial backfill."""
        date_from = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        out, page = [], 1
        while True:
            r = self._get("/restapi/v1.0/account/~/call-log",
                          params={"withRecording": "true", "dateFrom": date_from,
                                  "perPage": 250, "page": page, "view": "Detailed"})
            data = r.json()
            for rec in data.get("records", []):
                if not rec.get("recording"):
                    continue
                out.append({
                    "rc_session_id": rec.get("telephonySessionId") or rec.get("sessionId"),
                    "rc_recording_id": str(rec["recording"]["id"]),
                    "direction": rec.get("direction", "Outbound").lower(),
                    "from_number": (rec.get("from") or {}).get("phoneNumber", ""),
                    "to_number": (rec.get("to") or {}).get("phoneNumber", ""),
                    "started_at": rec.get("startTime"),
                    "duration_sec": rec.get("duration", 0),
                    "extension_id": str(((rec.get("extension") or {}).get("id")) or ""),
                })
            nav = data.get("navigation", {})
            if not nav.get("nextPage"):
                break
            page += 1
        return out


def queue_backfill(db, days: int) -> int:
    """Queue historical recorded calls for processing. Shared by the setup script
    and the admin API endpoint."""
    from datetime import datetime as _dt
    from ..models import Call, User
    rc = RingCentralClient()
    added = 0
    for r in rc.backfill_call_log(days):
        if not r["rc_session_id"]:
            continue
        if db.query(Call).filter(Call.rc_session_id == r["rc_session_id"]).first():
            continue
        host = (db.query(User).filter(User.rc_extension_id == r["extension_id"]).first()
                if r["extension_id"] else None)
        direction = "outbound" if r["direction"].startswith("out") else "inbound"
        started = _dt.utcnow()
        if r["started_at"]:
            try:
                started = _dt.fromisoformat(
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
    return added
