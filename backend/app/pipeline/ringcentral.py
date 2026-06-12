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
