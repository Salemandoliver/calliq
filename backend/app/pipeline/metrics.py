"""Engagement metrics computed deterministically from the diarized transcript.
These mirror Jiminny's engagement stats: talk ratio, longest monologue,
longest customer story, talking speed, patience, question rate."""
import re


def compute_metrics(turns: list[dict]) -> dict:
    """turns: [{speaker:'rep'|'customer', start_sec, end_sec, text}] sorted by start."""
    if not turns:
        return {}
    rep_time = sum(t["end_sec"] - t["start_sec"] for t in turns if t["speaker"] == "rep")
    cust_time = sum(t["end_sec"] - t["start_sec"] for t in turns if t["speaker"] == "customer")
    total_talk = rep_time + cust_time or 1.0

    # Longest contiguous run per speaker (monologue / customer story)
    def longest_run(speaker: str) -> float:
        best = cur = 0.0
        for t in turns:
            if t["speaker"] == speaker:
                cur += t["end_sec"] - t["start_sec"]
                best = max(best, cur)
            else:
                # short interjections (<2s) don't break a monologue
                if t["end_sec"] - t["start_sec"] >= 2.0:
                    cur = 0.0
        return best

    # Patience: average silence between customer finishing and rep starting
    gaps = []
    for prev, nxt in zip(turns, turns[1:]):
        if prev["speaker"] == "customer" and nxt["speaker"] == "rep":
            gap = nxt["start_sec"] - prev["end_sec"]
            if 0 <= gap <= 10:
                gaps.append(gap)

    rep_words = sum(len(t["text"].split()) for t in turns if t["speaker"] == "rep")
    rep_minutes = rep_time / 60 or 1.0
    questions = sum(len(re.findall(r"\?", t["text"]))
                    for t in turns if t["speaker"] == "rep")

    return {
        "talk_ratio": round(100 * rep_time / total_talk, 1),
        "longest_monologue_sec": round(longest_run("rep"), 1),
        "longest_customer_story_sec": round(longest_run("customer"), 1),
        "talking_speed_wpm": round(rep_words / rep_minutes) if rep_time > 5 else 0,
        "patience_sec": round(sum(gaps) / len(gaps), 2) if gaps else 0.0,
        "question_rate": float(questions),
    }
