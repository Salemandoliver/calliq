import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, ScoreChip, Skeleton, EmptyState, Modal } from "../components/ui.jsx";
import { formatDuration, relativeDate, callTitle, ACTIVITY_TYPES } from "../utils";
import {
  HeartIcon,
  ShareIcon,
  CommentIcon,
  HeadphonesIcon,
  XIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "../components/Icons.jsx";

const EMPTY_FILTERS = {
  team_id: "",
  host_id: "",
  customer: "",
  transcript: "",
  said_by: "",
  topic_id: "",
  activity_type: "",
  direction: "",
  min_minutes: "",
  max_minutes: "",
  min_score: "",
  max_score: "",
  period_days: "",
};

const PAGE_SIZE = 16;

function buildQuery(filters, page, sort) {
  const p = new URLSearchParams();
  p.set("page", page);
  p.set("page_size", PAGE_SIZE);
  p.set("sort", sort);
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v != null) p.set(k, v);
  });
  return p.toString();
}

function CallCard({ call, onOpen }) {
  return (
    <div className="card call-card" onClick={onOpen}>
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {call.customer_name || "Unknown customer"}
          </div>
          <div className="small muted">{callTitle(call)}</div>
        </div>
        {call.overall_score != null && <ScoreChip score={call.overall_score} size={30} />}
      </div>
      <div className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{call.activity_type}</div>
      <div className="flex">
        <Avatar name={call.host?.name} color={call.host?.avatar_color} size={28} />
        <div className="small" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {call.host?.name || "Unknown host"}
          </div>
          <div className="faint">
            {relativeDate(call.started_at)} · {formatDuration(call.duration_sec)}
          </div>
        </div>
      </div>
      {call.topics && call.topics.length > 0 && (
        <div className="flex" style={{ flexWrap: "wrap", gap: 4 }}>
          {call.topics.slice(0, 3).map((t) => (
            <span key={t.topic_id} className="chip" style={{ fontSize: 11 }}>
              <span className="dot" style={{ background: t.color, width: 7, height: 7 }} />
              {t.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex" style={{ gap: 14, marginTop: "auto", paddingTop: 4 }}>
        <span className="counter"><HeartIcon size={14} /> {call.likes ?? 0}</span>
        <span className="counter"><ShareIcon size={14} /> {call.shares ?? 0}</span>
        <span className="counter"><CommentIcon size={14} /> {call.comments ?? 0}</span>
        <span className="counter"><HeadphonesIcon size={14} /> {call.plays ?? 0}</span>
      </div>
    </div>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("recent");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [topics, setTopics] = useState([]);
  const [saved, setSaved] = useState([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const debounceRef = useRef(null);
  const savedRef = useRef(null);

  // option sources (best-effort: admin endpoints may 403 for non-admins)
  useEffect(() => {
    api.get("/api/admin/teams").then((d) => setTeams(Array.isArray(d) ? d : [])).catch(() => {});
    api
      .get("/api/admin/users")
      .then((d) => setHosts((Array.isArray(d) ? d : []).filter((u) => u.active !== false)))
      .catch(() => {
        // fallback: derive hosts from engagement insights
        api
          .get("/api/insights/engagement?days=365")
          .then((d) => setHosts((d?.reps || []).map((r) => r.user).filter(Boolean)))
          .catch(() => {});
      });
    api
      .get("/api/admin/topics")
      .then((d) => setTopics(Array.isArray(d) ? d : []))
      .catch(() => {
        api
          .get("/api/insights/topics?days=365")
          .then((d) => setTopics((Array.isArray(d) ? d : []).map((t) => t.topic).filter(Boolean)))
          .catch(() => {});
      });
    loadSaved();
  }, []);

  const loadSaved = () => {
    api
      .get("/api/calls/saved-searches/mine")
      .then((d) => setSaved(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  useEffect(() => {
    const close = (e) => {
      if (savedRef.current && !savedRef.current.contains(e.target)) setSavedOpen(false);
    };
    if (savedOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [savedOpen]);

  // fetch calls (debounced for text inputs)
  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api
        .get(`/api/calls?${buildQuery(filters, page, sort)}`)
        .then((d) => setData(d))
        .catch((e) => {
          toast(e.message, "error");
          setData({ items: [], total: 0 });
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [filters, page, sort]);

  const setF = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const activePills = useMemo(() => {
    const labels = {
      team_id: (v) => `Team: ${teams.find((t) => String(t.id) === String(v))?.name || v}`,
      host_id: (v) => `Host: ${hosts.find((h) => String(h.id) === String(v))?.name || v}`,
      customer: (v) => `Customer: ${v}`,
      transcript: (v) => `Transcript: "${v}"`,
      said_by: (v) => `Said by: ${v}`,
      topic_id: (v) => `Topic: ${topics.find((t) => String(t.id) === String(v))?.name || v}`,
      activity_type: (v) => v,
      direction: (v) => `Direction: ${v}`,
      min_minutes: (v) => `Min ${v}m`,
      max_minutes: (v) => `Max ${v}m`,
      min_score: (v) => `Score ≥ ${v}`,
      max_score: (v) => `Score ≤ ${v}`,
      period_days: (v) => `Last ${v} days`,
    };
    return Object.entries(filters)
      .filter(([, v]) => v !== "" && v != null)
      .map(([k, v]) => ({ key: k, label: labels[k] ? labels[k](v) : `${k}: ${v}` }));
  }, [filters, teams, hosts, topics]);

  const saveSearch = async () => {
    if (!saveName.trim()) return;
    try {
      await api.post("/api/calls/saved-searches", { name: saveName.trim(), params: filters });
      toast("Search saved", "success");
      setSaveModal(false);
      setSaveName("");
      loadSaved();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const applySaved = (s) => {
    setFilters({ ...EMPTY_FILTERS, ...(s.params || {}) });
    setPage(1);
    setSavedOpen(false);
  };

  const deleteSaved = async (id, e) => {
    e.stopPropagation();
    try {
      await api.del(`/api/calls/saved-searches/${id}`);
      loadSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">{loading && data == null ? "…" : `${total.toLocaleString()} activities`}</h1>
          <p className="page-sub">Search and filter every recorded call.</p>
        </div>
        <div className="flex">
          <div style={{ position: "relative" }} ref={savedRef}>
            <button className="btn btn-outline" onClick={() => setSavedOpen((o) => !o)}>
              <BookmarkIcon size={15} /> Saved searches
            </button>
            {savedOpen && (
              <div
                className="card"
                style={{ position: "absolute", right: 0, top: 42, width: 260, zIndex: 60, padding: 8 }}
              >
                {saved.length === 0 ? (
                  <div className="small muted" style={{ padding: 10 }}>No saved searches yet.</div>
                ) : (
                  saved.map((s) => (
                    <div
                      key={s.id}
                      className="spread"
                      style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
                      onClick={() => applySaved(s)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f5f7")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                      <button className="icon-btn" onClick={(e) => deleteSaved(s.id, e)} aria-label="Delete">
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setSaveModal(true)}>
            Save Search
          </button>
          <select className="input" style={{ width: 160 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Most recent</option>
            <option value="duration">Longest duration</option>
            <option value="plays">Most played</option>
          </select>
        </div>
      </div>

      {activePills.length > 0 && (
        <div className="flex" style={{ flexWrap: "wrap", marginBottom: 14 }}>
          {activePills.map((p) => (
            <span key={p.key} className="filter-pill">
              {p.label}
              <button className="x" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }} onClick={() => setF(p.key, "")}>
                <XIcon size={12} />
              </button>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
            Clear all
          </button>
        </div>
      )}

      <div className="library-layout">
        <aside className="filter-side card">
          <h3 className="card-title">Filters</h3>
          <label className="field">
            <span>Team</span>
            <select className="input" value={filters.team_id} onChange={(e) => setF("team_id", e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Host</span>
            <select className="input" value={filters.host_id} onChange={(e) => setF("host_id", e.target.value)}>
              <option value="">Anyone</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Customer</span>
            <input className="input" value={filters.customer} placeholder="Customer name…" onChange={(e) => setF("customer", e.target.value)} />
          </label>
          <label className="field">
            <span>Transcript contains</span>
            <input className="input" value={filters.transcript} placeholder="e.g. broadband" onChange={(e) => setF("transcript", e.target.value)} />
          </label>
          <label className="field">
            <span>Said by</span>
            <select className="input" value={filters.said_by} onChange={(e) => setF("said_by", e.target.value)}>
              <option value="">Anyone</option>
              <option value="rep">Rep</option>
              <option value="customer">Customer</option>
            </select>
          </label>
          <label className="field">
            <span>Topic</span>
            <select className="input" value={filters.topic_id} onChange={(e) => setF("topic_id", e.target.value)}>
              <option value="">Any topic</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Activity type</span>
            <select className="input" value={filters.activity_type} onChange={(e) => setF("activity_type", e.target.value)}>
              <option value="">All types</option>
              {ACTIVITY_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="field" style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 4 }}>
              Duration (minutes)
            </span>
            <div className="flex">
              <input className="input" type="number" min="0" placeholder="Min" value={filters.min_minutes} onChange={(e) => setF("min_minutes", e.target.value)} />
              <input className="input" type="number" min="0" placeholder="Max" value={filters.max_minutes} onChange={(e) => setF("max_minutes", e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ display: "block", marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 4 }}>
              AI score
            </span>
            <div className="flex">
              <input className="input" type="number" min="1" max="5" step="0.5" placeholder="Min" value={filters.min_score} onChange={(e) => setF("min_score", e.target.value)} />
              <input className="input" type="number" min="1" max="5" step="0.5" placeholder="Max" value={filters.max_score} onChange={(e) => setF("max_score", e.target.value)} />
            </div>
          </div>
          <label className="field">
            <span>Period</span>
            <select className="input" value={filters.period_days} onChange={(e) => setF("period_days", e.target.value)}>
              <option value="">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="call-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} h={180} style={{ borderRadius: 10 }} />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="card">
              <EmptyState icon="🔍" title="No calls match these filters" sub="Try widening your search." />
            </div>
          ) : (
            <>
              <div className="call-grid">
                {data.items.map((c) => (
                  <CallCard key={c.id} call={c} onOpen={() => navigate(`/calls/${c.id}`)} />
                ))}
              </div>
              <div className="pagination">
                <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeftIcon size={17} />
                </button>
                <span className="small muted">
                  Page {page} of {totalPages}
                </span>
                <button className="icon-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRightIcon size={17} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {saveModal && (
        <Modal
          title="Save this search"
          onClose={() => setSaveModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setSaveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSearch} disabled={!saveName.trim()}>Save</button>
            </>
          }
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Long acquisition calls" autoFocus />
          </label>
          <div className="small muted">Saves the current filter set so you can re-apply it in one click.</div>
        </Modal>
      )}
    </div>
  );
}
