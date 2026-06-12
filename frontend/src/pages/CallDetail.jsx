import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import api, { fetchBlobUrl } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, ScoreChip, Spinner, EmptyState } from "../components/ui.jsx";
import { formatDuration, relativeDate, mmss, callTitle } from "../utils";
import {
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  HeartIcon,
  HeadphonesIcon,
  CommentIcon,
} from "../components/Icons.jsx";

function highlight(text, query) {
  if (!query) return text;
  const idx = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let pos = lower.indexOf(q);
  while (pos !== -1) {
    idx.push(pos);
    pos = lower.indexOf(q, pos + q.length);
  }
  if (!idx.length) return text;
  const parts = [];
  let last = 0;
  idx.forEach((i, n) => {
    parts.push(text.slice(last, i));
    parts.push(<mark key={n}>{text.slice(i, i + query.length)}</mark>);
    last = i + query.length;
  });
  parts.push(text.slice(last));
  return parts;
}

function MetricBar({ label, value, display, max = 100, suffix = "" }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <div className="metric-row">
      <div className="spread small">
        <span className="muted" style={{ fontWeight: 600 }}>{label}</span>
        <strong>{display != null ? display : `${value}${suffix}`}</strong>
      </div>
      <div className="metric-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CallDetail() {
  const { id } = useParams();
  const { user } = useOutletContext();
  const toast = useToast();
  const [call, setCall] = useState(null);
  const [error, setError] = useState("");
  const [leftTab, setLeftTab] = useState("flashback");
  const [rightTab, setRightTab] = useState("scoring");
  const [search, setSearch] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioMissing, setAudioMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [liked, setLiked] = useState(false);
  const [flashTurn, setFlashTurn] = useState(null);
  const audioRef = useRef(null);
  const listenedRef = useRef(false);
  const transcriptRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setCall(null);
    setError("");
    setAudioUrl(null);
    setAudioMissing(false);
    listenedRef.current = false;
    api
      .get(`/api/calls/${id}`)
      .then((d) => {
        if (cancelled) return;
        setCall(d);
      })
      .catch((e) => !cancelled && setError(e.message));
    api
      .get(`/api/calls/${id}/comments`)
      .then((d) => !cancelled && setComments(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetchBlobUrl(`/api/calls/${id}/audio`)
      .then((url) => !cancelled && setAudioUrl(url))
      .catch(() => !cancelled && setAudioMissing(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const duration = call?.duration_sec || audioDuration || 1;

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      if (!listenedRef.current) {
        listenedRef.current = true;
        api.post(`/api/calls/${id}/listen`).catch(() => {});
      }
    } else {
      a.pause();
    }
  };

  const seekTo = (sec) => {
    const a = audioRef.current;
    if (a && audioUrl) {
      a.currentTime = sec;
      setCurrentTime(sec);
    } else {
      setCurrentTime(sec);
    }
  };

  const jumpToTurn = (atSec) => {
    setLeftTab("transcript");
    seekTo(atSec);
    const turns = call?.turns || [];
    const target = turns.find((t) => atSec >= t.start_sec && atSec <= t.end_sec) ||
      turns.reduce((best, t) => (Math.abs(t.start_sec - atSec) < Math.abs((best?.start_sec ?? Infinity) - atSec) ? t : best), null);
    if (target) {
      setFlashTurn(target.id);
      setTimeout(() => {
        const el = document.getElementById(`turn-${target.id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      setTimeout(() => setFlashTurn(null), 2200);
    }
  };

  const like = async () => {
    try {
      await api.post(`/api/calls/${id}/like`);
      setLiked(true);
      setCall((c) => (c ? { ...c, likes: (c.likes || 0) + (liked ? 0 : 1) } : c));
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.post(`/api/calls/${id}/comments`, {
        body: newComment.trim(),
        at_sec: Math.round(currentTime),
      });
      setNewComment("");
      const d = await api.get(`/api/calls/${id}/comments`);
      setComments(Array.isArray(d) ? d : []);
      toast("Comment added", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const filteredTurns = useMemo(() => {
    const turns = call?.turns || [];
    if (!search.trim()) return turns;
    return turns; // keep all, highlight matches
  }, [call, search]);

  const matchCount = useMemo(() => {
    if (!search.trim() || !call?.turns) return 0;
    const q = search.toLowerCase();
    return call.turns.filter((t) => t.text.toLowerCase().includes(q)).length;
  }, [call, search]);

  if (error) {
    return (
      <div className="page">
        <div className="card"><EmptyState icon="⚠️" title="Could not load call" sub={error} /></div>
      </div>
    );
  }
  if (!call) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }

  const analysis = call.analysis || {};
  const scores = call.scores || [];

  return (
    <div className="page">
      {/* header */}
      <div className="card spread" style={{ marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
        <div className="flex" style={{ gap: 14 }}>
          <Avatar name={call.host?.name} color={call.host?.avatar_color} size={46} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{callTitle(call)}</div>
            <div className="muted small">
              {call.customer_name || "Unknown customer"} · {call.activity_type} · {relativeDate(call.started_at)} ·{" "}
              {formatDuration(call.duration_sec)} · hosted by {call.host?.name || "unknown"}
            </div>
          </div>
        </div>
        <div className="flex" style={{ gap: 14 }}>
          <button className="btn btn-outline btn-sm" onClick={like} style={liked ? { color: "var(--accent)" } : {}}>
            <HeartIcon size={14} filled={liked} /> {call.likes ?? 0}
          </button>
          <span className="counter"><HeadphonesIcon size={15} /> {call.plays ?? 0} plays</span>
          <span className="counter"><CommentIcon size={15} /> {comments.length}</span>
          {call.overall_score != null && <ScoreChip score={call.overall_score} size={38} />}
        </div>
      </div>

      <div className="call-layout">
        {/* LEFT */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="tabs" style={{ padding: "0 14px" }}>
            {[
              ["flashback", "Flashback"],
              ["transcript", "Transcript"],
              ["themes", "Themes"],
              ["statistics", "Statistics"],
            ].map(([k, label]) => (
              <button key={k} className={"tab" + (leftTab === k ? " active" : "")} onClick={() => setLeftTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ padding: 18, maxHeight: "72vh", overflowY: "auto" }} ref={transcriptRef}>
            {leftTab === "flashback" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
                  <h3 className="card-title">Summary</h3>
                  {analysis.summary_intro && <p style={{ marginTop: 0 }}>{analysis.summary_intro}</p>}
                  {analysis.summary_points?.length ? (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                      {analysis.summary_points.map((p, i) => (
                        <li key={i} style={{ marginBottom: 5 }}>{p}</li>
                      ))}
                    </ul>
                  ) : (
                    !analysis.summary_intro && <div className="muted small">No summary available.</div>
                  )}
                </div>
                <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
                  <h3 className="card-title">Action Items</h3>
                  {analysis.action_items?.length ? (
                    analysis.action_items.map((a, i) => (
                      <div className="flex" key={i} style={{ alignItems: "flex-start", padding: "6px 0" }}>
                        <span style={{ color: "var(--green)", flexShrink: 0, paddingTop: 1 }}>
                          <CheckCircleIcon size={17} />
                        </span>
                        <span>
                          <strong>{a.owner}:</strong> {a.text}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="muted small">No action items detected.</div>
                  )}
                </div>
                <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
                  <h3 className="card-title">Key points</h3>
                  {analysis.key_points?.length ? (
                    analysis.key_points.map((kp, i) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{kp.heading}</div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {(kp.points || []).map((p, j) => (
                            <li key={j} style={{ marginBottom: 3 }}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <div className="muted small">No key points available.</div>
                  )}
                </div>
              </div>
            )}

            {leftTab === "transcript" && (
              <div>
                <div className="flex" style={{ marginBottom: 12 }}>
                  <input
                    className="input"
                    placeholder="Search transcript…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <span className="small muted" style={{ whiteSpace: "nowrap" }}>
                      {matchCount} match{matchCount === 1 ? "" : "es"}
                    </span>
                  )}
                </div>
                {filteredTurns.length === 0 ? (
                  <EmptyState icon="📝" title="No transcript available" />
                ) : (
                  filteredTurns.map((t) => (
                    <div
                      key={t.id}
                      id={`turn-${t.id}`}
                      className={`turn ${t.speaker}${flashTurn === t.id ? " flash" : ""}`}
                      onClick={() => seekTo(t.start_sec)}
                      title="Click to seek audio"
                    >
                      <span className="t">{mmss(t.start_sec)}</span>
                      <div>
                        <div className="speaker">{t.speaker_name || (t.speaker === "rep" ? "Rep" : "Customer")}</div>
                        <div>{highlight(t.text, search.trim())}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {leftTab === "themes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {analysis.themes?.length ? (
                  analysis.themes.map((th, i) => (
                    <div key={i} className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{th.name}</div>
                      <div className="muted">{th.description}</div>
                    </div>
                  ))
                ) : (
                  <EmptyState icon="🧩" title="No themes detected" />
                )}
              </div>
            )}

            {leftTab === "statistics" && (
              <div>
                <MetricBar label="Talk ratio (rep)" value={Math.round((analysis.talk_ratio || 0) * (analysis.talk_ratio > 1 ? 1 : 100))} display={`${Math.round((analysis.talk_ratio || 0) * (analysis.talk_ratio > 1 ? 1 : 100))}%`} max={100} />
                <MetricBar label="Longest monologue" value={analysis.longest_monologue_sec || 0} display={formatDuration(analysis.longest_monologue_sec || 0)} max={Math.max(300, analysis.longest_monologue_sec || 0)} />
                <MetricBar label="Longest customer story" value={analysis.longest_customer_story_sec || 0} display={formatDuration(analysis.longest_customer_story_sec || 0)} max={Math.max(300, analysis.longest_customer_story_sec || 0)} />
                <MetricBar label="Talking speed" value={analysis.talking_speed_wpm || 0} display={`${Math.round(analysis.talking_speed_wpm || 0)} wpm`} max={250} />
                <MetricBar label="Patience" value={analysis.patience_sec || 0} display={`${Number(analysis.patience_sec || 0).toFixed(1)}s`} max={5} />
                <MetricBar label="Question rate" value={analysis.question_rate || 0} display={`${Number(analysis.question_rate || 0).toFixed(1)} / call`} max={Math.max(20, analysis.question_rate || 0)} />
                {analysis.sentiment && (
                  <div className="metric-row">
                    <div className="spread small">
                      <span className="muted" style={{ fontWeight: 600 }}>Sentiment</span>
                      <strong style={{ textTransform: "capitalize" }}>{analysis.sentiment}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <h3 className="card-title">Recording</h3>
            {audioMissing ? (
              <div className="small muted" style={{ background: "#f8f9fb", borderRadius: 8, padding: "10px 12px" }}>
                🎙️ Audio not available in demo mode — the timeline below still maps the conversation.
              </div>
            ) : !audioUrl ? (
              <div className="small muted">Loading audio…</div>
            ) : (
              <>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                  onLoadedMetadata={(e) => setAudioDuration(e.target.duration)}
                  onEnded={() => setPlaying(false)}
                />
                <div className="audio-bar">
                  <button
                    className="btn btn-primary"
                    style={{ width: 40, height: 40, borderRadius: "50%", padding: 0, justifyContent: "center" }}
                    onClick={togglePlay}
                    aria-label={playing ? "Pause" : "Play"}
                  >
                    {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                  </button>
                  <span className="small muted" style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(currentTime)}</span>
                  <input
                    className="audio-range"
                    type="range"
                    min={0}
                    max={duration}
                    step={1}
                    value={Math.min(currentTime, duration)}
                    onChange={(e) => seekTo(Number(e.target.value))}
                  />
                  <span className="small muted" style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(duration)}</span>
                </div>
              </>
            )}
            {/* timeline strip */}
            {call.turns?.length > 0 && (
              <>
                <div
                  className="timeline-strip"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const frac = (e.clientX - rect.left) / rect.width;
                    jumpToTurn(frac * duration);
                  }}
                  title="Click to jump"
                >
                  {call.turns.map((t) => (
                    <div
                      key={t.id}
                      className={`timeline-seg ${t.speaker}`}
                      style={{
                        left: `${(t.start_sec / duration) * 100}%`,
                        width: `${Math.max(0.4, ((t.end_sec - t.start_sec) / duration) * 100)}%`,
                      }}
                    />
                  ))}
                  <div className="timeline-cursor" style={{ left: `${Math.min(100, (currentTime / duration) * 100)}%` }} />
                </div>
                <div className="flex small muted" style={{ marginTop: 8, gap: 16 }}>
                  <span className="flex" style={{ gap: 5 }}>
                    <span className="dot" style={{ background: "var(--accent)" }} /> {call.host?.name || "Rep"}
                  </span>
                  <span className="flex" style={{ gap: 5 }}>
                    <span className="dot" style={{ background: "#0ea5e9" }} /> {call.customer_name || "Customer"}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="tabs" style={{ padding: "0 14px" }}>
              <button className={"tab" + (rightTab === "scoring" ? " active" : "")} onClick={() => setRightTab("scoring")}>
                AI Call Scoring
              </button>
              <button className={"tab" + (rightTab === "coaching" ? " active" : "")} onClick={() => setRightTab("coaching")}>
                Coaching
              </button>
            </div>
            <div style={{ padding: 18, maxHeight: "60vh", overflowY: "auto" }}>
              {rightTab === "scoring" &&
                (scores.length === 0 ? (
                  <EmptyState icon="🤖" title="Not scored yet" sub="AI scoring runs after the call is analysed." />
                ) : (
                  scores.map((s) => (
                    <div key={s.id} style={{ marginBottom: 20 }}>
                      <div className="flex" style={{ marginBottom: 14 }}>
                        <ScoreChip score={s.overall} size={42} />
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Playbook scoring</div>
                      </div>
                      {(s.criteria || []).map((c) => (
                        <div key={c.key} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f0f1f3" }}>
                          <div className="flex" style={{ marginBottom: 6 }}>
                            <ScoreChip score={c.score} size={26} />
                            <strong>{c.name}</strong>
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>{c.feedback}</div>
                          {c.evidence?.length > 0 && (
                            <div className="flex" style={{ flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                              {c.evidence.map((ev, i) => (
                                <button key={i} className="evidence-link" onClick={() => jumpToTurn(ev.at_sec)}>
                                  {ev.speaker} at {mmss(ev.at_sec)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                ))}

              {rightTab === "coaching" && (
                <div>
                  {scores.filter((s) => s.coaching).length === 0 ? (
                    <div className="muted small" style={{ marginBottom: 14 }}>No coaching notes from AI yet.</div>
                  ) : (
                    scores
                      .filter((s) => s.coaching)
                      .map((s) => (
                        <div
                          key={s.id}
                          style={{
                            background: "linear-gradient(135deg, rgba(233,30,99,0.06), rgba(156,39,176,0.06))",
                            borderRadius: 10,
                            padding: 14,
                            marginBottom: 16,
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>🎯 AI coaching</div>
                          <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{s.coaching}</div>
                        </div>
                      ))
                  )}
                  <h4 style={{ margin: "0 0 8px" }}>Comments</h4>
                  {comments.length === 0 ? (
                    <div className="muted small" style={{ marginBottom: 10 }}>No comments yet — start the conversation.</div>
                  ) : (
                    comments.map((cm) => (
                      <div className="comment-row" key={cm.id}>
                        <Avatar name={cm.user?.name || cm.author?.name || "?"} color={cm.user?.avatar_color || cm.author?.avatar_color} size={30} />
                        <div style={{ flex: 1 }}>
                          <div className="small">
                            <strong>{cm.user?.name || cm.author?.name || "Someone"}</strong>{" "}
                            {cm.at_sec != null && (
                              <button className="evidence-link" onClick={() => jumpToTurn(cm.at_sec)}>
                                @ {mmss(cm.at_sec)}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 13.5 }}>{cm.body}</div>
                          {cm.created_at && <div className="small faint">{relativeDate(cm.created_at)}</div>}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="flex" style={{ marginTop: 12, alignItems: "flex-start" }}>
                    <Avatar name={user?.name} color={user?.avatar_color} size={30} />
                    <textarea
                      className="input"
                      rows={2}
                      placeholder={`Comment at ${mmss(currentTime)}…`}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                  </div>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={addComment} disabled={!newComment.trim()}>
                      Add comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
