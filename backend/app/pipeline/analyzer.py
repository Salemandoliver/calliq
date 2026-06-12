"""LLM analysis of a transcribed call using the Claude API.

One structured call produces: summary, action items, key points, themes,
topic detection, playbook scoring with timestamped evidence, and coaching notes.
"""
import json
import logging

import httpx

from ..config import settings

log = logging.getLogger("calliq.analyzer")

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def _format_transcript(turns: list[dict], rep_name: str, max_chars: int = 60000) -> str:
    lines = []
    for t in turns:
        mm, ss = divmod(int(t["start_sec"]), 60)
        who = rep_name if t["speaker"] == "rep" else "Customer"
        lines.append(f"[{mm:02d}:{ss:02d}] {who}: {t['text']}")
    text = "\n".join(lines)
    return text[:max_chars]


def _claude(system: str, user: str, model: str, max_tokens: int = 4000) -> str:
    resp = httpx.post(
        ANTHROPIC_URL,
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


def _extract_json(text: str) -> dict:
    """Tolerant JSON extraction (Claude sometimes wraps in ```json fences)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


def analyze_call(turns: list[dict], rep_name: str, activity_type: str,
                 playbooks: list[dict], topics: list[dict],
                 ai_context: str = "") -> dict:
    """playbooks: [{id, name, description, criteria:[{key,name,description,weight}]}]
    topics: [{id, name, keywords}]
    Returns {analysis:{...}, topic_ids:[{topic_id, mentions, first_mention_sec}],
             scores:[{playbook_id, overall, criteria:[...], coaching}]}"""
    transcript = _format_transcript(turns, rep_name)

    system = (
        "You are a sales call quality analyst for BT Local Business Oxford & Bucks, "
        "a UK telecom call centre selling BT broadband, phone lines, mobile and security "
        "products to small businesses in Oxfordshire, Buckinghamshire and Hertfordshire. "
        "You analyse call transcripts and return STRICT JSON only — no prose outside JSON. "
        "Be specific, cite real moments from the call, use UK English. "
        + (f"\nOrganisation context: {ai_context}" if ai_context else "")
    )

    playbook_desc = json.dumps([
        {"playbook_id": p["id"], "name": p["name"], "description": p["description"],
         "criteria": p["criteria"]}
        for p in playbooks
    ], indent=1)
    topics_desc = json.dumps([{"topic_id": t["id"], "name": t["name"],
                               "keywords": t["keywords"]} for t in topics])

    user = f"""Analyse this {activity_type} call. Rep: {rep_name}.

TRANSCRIPT (timestamps are mm:ss from call start):
{transcript}

SCORING PLAYBOOKS (score every criterion of every playbook listed, 1-5 integers,
where 1=missing entirely, 3=partially done, 5=excellent):
{playbook_desc}

TOPICS to detect (only include topics genuinely discussed):
{topics_desc}

Return JSON exactly in this shape:
{{
 "summary_intro": "one sentence describing the call",
 "summary_points": ["5-8 bullet points of what happened"],
 "action_items": [{{"owner": "Customer|{rep_name}", "text": "..."}}],
 "key_points": [{{"heading": "topic heading", "points": ["..."]}}],
 "themes": [{{"name": "...", "description": "..."}}],
 "sentiment": "positive|neutral|negative",
 "detected_topics": [{{"topic_id": 1, "mentions": 3, "first_mention_sec": 120}}],
 "scores": [
   {{"playbook_id": 1, "overall": 2.6,
     "criteria": [{{"key": "...", "name": "...", "score": 2,
       "feedback": "2-4 sentences: what the rep did, what was missing",
       "evidence": [{{"speaker": "{rep_name}|Customer", "at_sec": 0}}]}}],
     "coaching": "A short coaching paragraph for the rep: 2 strengths, 2 improvements, phrased constructively."
   }}
 ]
}}
"overall" is the weighted mean of criterion scores to 1 decimal. Only score playbooks
whose activity types match this call; if none match, score the most relevant single playbook."""

    raw = _claude(system, user, settings.claude_call_model, max_tokens=4000)
    return _extract_json(raw)


def generate_weekly_report_md(team_summaries: str) -> str:
    """Sonnet-written weekly coaching profile report (markdown)."""
    system = ("You are a sales coaching analyst writing a weekly coaching profile report "
              "for managers at BT Local Business Oxford & Bucks. UK English. Markdown. "
              "Be concrete and actionable, reference the data given, no invented numbers.")
    user = f"""Write a weekly coaching profile report from this data.

{team_summaries}

Structure:
# Weekly Coaching Profiles
## Team overview (volumes, average scores, engagement trends)
## Per-rep profiles (for each rep: 2-3 sentence profile, strengths, focus areas, suggested coaching action)
## Recommended team coaching session topic for next week (pick the weakest common skill)
Keep it under 1200 words."""
    return _claude(system, user, settings.claude_report_model, max_tokens=8000)
