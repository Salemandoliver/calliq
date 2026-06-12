import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, Spinner, EmptyState, Modal } from "../components/ui.jsx";
import { ACTIVITY_TYPES } from "../utils";
import { PlusIcon, TrashIcon, EditIcon, XIcon } from "../components/Icons.jsx";

const SECTIONS = [
  ["general", "General"],
  ["users", "Users"],
  ["teams", "Teams"],
  ["topics", "Topics"],
  ["playbooks", "Playbooks & Frameworks"],
  ["vocabulary", "Vocabulary"],
  ["privacy", "Privacy"],
];

const ROLE_COLORS = { recorder: "#14b8a6", analyst: "#9c27b0", admin: "#e91e63" };

/* ---------------- General ---------------- */
function GeneralSection() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [aiContext, setAiContext] = useState("");
  const [retention, setRetention] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/api/admin/settings")
      .then((d) => {
        setSettings(d || {});
        const ctx = d?.ai_context;
        setAiContext(typeof ctx === "string" ? ctx : ctx?.text || "");
        const ret = d?.retention;
        setRetention(typeof ret === "number" ? ret : ret?.days ?? "");
      })
      .catch((e) => {
        setSettings({});
        toast(e.message, "error");
      });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/admin/settings/ai_context", { text: aiContext });
      if (retention !== "" && !isNaN(Number(retention))) {
        await api.put("/api/admin/settings/retention", { days: Number(retention) });
      }
      toast("Settings saved", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (settings === null) return <Spinner />;
  return (
    <div className="card">
      <h3 className="card-title">General</h3>
      <label className="field">
        <span>Organisation</span>
        <input className="input" value="BT Local Business Oxford & Bucks" disabled />
      </label>
      <label className="field">
        <span>AI context (used to ground summaries &amp; scoring)</span>
        <textarea
          className="input"
          rows={6}
          value={aiContext}
          onChange={(e) => setAiContext(e.target.value)}
          placeholder="Describe your products, market and what good calls look like…"
        />
      </label>
      <label className="field" style={{ maxWidth: 240 }}>
        <span>Recording retention (days)</span>
        <input
          className="input"
          type="number"
          min="1"
          value={retention}
          onChange={(e) => setRetention(e.target.value)}
        />
      </label>
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

/* ---------------- Users ---------------- */
function UserModal({ user, teams, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !user?.id;
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    role: user?.role || "recorder",
    job_title: user?.job_title || "",
    team_id: user?.team_id ?? "",
    active: user?.active !== false,
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        role: form.role,
        job_title: form.job_title,
        team_id: form.team_id === "" ? null : Number(form.team_id),
        active: form.active,
      };
      if (form.password) payload.password = form.password;
      if (isNew) {
        await api.post("/api/admin/users", { ...payload, email: form.email });
        toast("User invited", "success");
      } else {
        await api.patch(`/api/admin/users/${user.id}`, payload);
        toast("User updated", "success");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? "Invite user" : `Edit ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name || (isNew && !form.email)}>
            {saving ? "Saving…" : isNew ? "Invite" : "Save"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" value={form.email} disabled={!isNew} onChange={(e) => set("email", e.target.value)} />
      </label>
      <div className="flex" style={{ gap: 12, alignItems: "flex-start" }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Role</span>
          <select className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="recorder">Recorder</option>
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Team</span>
          <select className="input" value={form.team_id} onChange={(e) => set("team_id", e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Job title</span>
        <input className="input" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
      </label>
      <label className="field">
        <span>{isNew ? "Initial password" : "Reset password (leave blank to keep)"}</span>
        <input className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
      </label>
      <label className="flex" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        <span>Active</span>
      </label>
    </Modal>
  );
}

function UsersSection({ teams }) {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (new) | user

  const load = () => {
    api
      .get("/api/admin/users")
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch((e) => {
        setUsers([]);
        toast(e.message, "error");
      });
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        !q ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.job_title || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  const roleCounts = useMemo(() => {
    const c = { recorder: 0, analyst: 0, admin: 0 };
    (users || []).forEach((u) => {
      if (c[u.role] != null) c[u.role]++;
    });
    return c;
  }, [users]);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || "—";

  if (users === null) return <Spinner />;

  const donutData = Object.entries(roleCounts).map(([role, value]) => ({
    name: role,
    value,
    color: ROLE_COLORS[role],
  }));
  const hasUsers = donutData.some((d) => d.value > 0);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 className="card-title">Roles</h3>
        <div className="flex" style={{ gap: 26, flexWrap: "wrap" }}>
          <div style={{ width: 160, height: 150, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hasUsers ? donutData : [{ name: "None", value: 1, color: "#e5e7eb" }]}
                  dataKey="value"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={hasUsers ? 3 : 0}
                  stroke="none"
                >
                  {(hasUsers ? donutData : [{ color: "#e5e7eb" }]).map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                {hasUsers && <Tooltip />}
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <strong style={{ fontSize: 20 }}>{users.length}</strong>
            </div>
          </div>
          {Object.entries(roleCounts).map(([role, n]) => (
            <div key={role} className="flex" style={{ gap: 8 }}>
              <span className="dot" style={{ background: ROLE_COLORS[role], width: 12, height: 12 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{n}</div>
                <div className="small muted" style={{ textTransform: "capitalize" }}>{role}{n === 1 ? "" : "s"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <PlusIcon size={14} /> Invite User
          </button>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="👥" title="No users found" />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Team</th>
                <th>Job title</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="flex">
                      <Avatar name={u.name} color={u.avatar_color} size={28} />
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                    </span>
                  </td>
                  <td className="small muted">{u.email}</td>
                  <td className="small">{teamName(u.team_id)}</td>
                  <td className="small">{u.job_title || "—"}</td>
                  <td>
                    <span className="chip" style={{ textTransform: "capitalize", background: `${ROLE_COLORS[u.role] || "#9ca3af"}22`, color: ROLE_COLORS[u.role] || "#6b7280", fontWeight: 600 }}>
                      {u.role}
                    </span>
                  </td>
                  <td className="small">{u.active === false ? <span className="faint">Inactive</span> : <span style={{ color: "var(--green)", fontWeight: 600 }}>Active</span>}</td>
                  <td>
                    <button className="icon-btn" onClick={() => setEditing(u)} aria-label="Edit">
                      <EditIcon size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing !== null && (
        <UserModal user={editing.id ? editing : null} teams={teams} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </>
  );
}

/* ---------------- Teams ---------------- */
function TeamsSection({ teams, reloadTeams }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/admin/teams", { name: name.trim() });
      setName("");
      reloadTeams();
      toast("Team created", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete team "${t.name}"?`)) return;
    try {
      await api.del(`/api/admin/teams/${t.id}`);
      reloadTeams();
      toast("Team deleted", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">Teams</h3>
      <div className="flex" style={{ marginBottom: 16, maxWidth: 420 }}>
        <input className="input" placeholder="New team name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" onClick={add} disabled={busy || !name.trim()}>
          <PlusIcon size={14} /> Add
        </button>
      </div>
      {teams.length === 0 ? (
        <EmptyState icon="🧑‍🤝‍🧑" title="No teams yet" />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>
                  <button className="icon-btn" onClick={() => remove(t)} aria-label="Delete">
                    <TrashIcon size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------- Topics ---------------- */
function TopicModal({ topic, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !topic?.id;
  const [name, setName] = useState(topic?.name || "");
  const [color, setColor] = useState(topic?.color || "#e91e63");
  const [active, setActive] = useState(topic?.active !== false);
  const [keywords, setKeywords] = useState(topic?.keywords || []);
  const [kw, setKw] = useState("");
  const [saving, setSaving] = useState(false);

  const addKw = () => {
    const v = kw.trim();
    if (v && !keywords.includes(v)) setKeywords((k) => [...k, v]);
    setKw("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { name, keywords, color, active };
      if (isNew) await api.post("/api/admin/topics", payload);
      else await api.patch(`/api/admin/topics/${topic.id}`, payload);
      toast(isNew ? "Topic created" : "Topic updated", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? "New topic" : `Edit ${topic.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex" style={{ gap: 12, alignItems: "flex-start" }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Colour</span>
          <input type="color" className="input" style={{ width: 60, height: 38, padding: 3 }} value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Keywords (Enter to add)</span>
        <input
          className="input"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKw();
            }
          }}
          placeholder="e.g. fibre, broadband speed…"
        />
      </label>
      <div className="flex" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        {keywords.map((k) => (
          <span className="chip" key={k}>
            {k}
            <button className="x" onClick={() => setKeywords((ks) => ks.filter((x) => x !== k))}>
              <XIcon size={11} />
            </button>
          </span>
        ))}
      </div>
      <label className="flex" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Active</span>
      </label>
    </Modal>
  );
}

function TopicsSection() {
  const toast = useToast();
  const [topics, setTopics] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => {
    api
      .get("/api/admin/topics")
      .then((d) => setTopics(Array.isArray(d) ? d : []))
      .catch((e) => {
        setTopics([]);
        toast(e.message, "error");
      });
  };
  useEffect(load, []);

  const remove = async (t) => {
    if (!window.confirm(`Delete topic "${t.name}"?`)) return;
    try {
      await api.del(`/api/admin/topics/${t.id}`);
      load();
      toast("Topic deleted", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (topics === null) return <Spinner />;
  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ margin: 0 }}>Topics</h3>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <PlusIcon size={14} /> New topic
        </button>
      </div>
      {topics.length === 0 ? (
        <EmptyState icon="🏷️" title="No topics configured" />
      ) : (
        topics.map((t) => (
          <div className="leader-row" key={t.id}>
            <span className="dot" style={{ background: t.color || "#9ca3af", width: 13, height: 13 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {t.name} {t.active === false && <span className="small faint">(inactive)</span>}
              </div>
              <div className="flex" style={{ flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {(t.keywords || []).map((k) => (
                  <span key={k} className="chip" style={{ fontSize: 11 }}>{k}</span>
                ))}
              </div>
            </div>
            <button className="icon-btn" onClick={() => setEditing(t)} aria-label="Edit"><EditIcon size={15} /></button>
            <button className="icon-btn" onClick={() => remove(t)} aria-label="Delete"><TrashIcon size={15} /></button>
          </div>
        ))
      )}
      {editing !== null && (
        <TopicModal topic={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}

/* ---------------- Playbooks ---------------- */
function PlaybookModal({ playbook, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !playbook?.id;
  const [name, setName] = useState(playbook?.name || "");
  const [description, setDescription] = useState(playbook?.description || "");
  const [activityTypes, setActivityTypes] = useState(playbook?.activity_types || []);
  const [criteria, setCriteria] = useState(
    (playbook?.criteria || []).map((c) => ({ ...c })) || []
  );
  const [active, setActive] = useState(playbook?.active !== false);
  const [saving, setSaving] = useState(false);

  const toggleType = (t) =>
    setActivityTypes((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));

  const setCrit = (i, k, v) =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  const addCrit = () =>
    setCriteria((cs) => [...cs, { key: `criterion_${cs.length + 1}`, name: "", description: "", weight: 1 }]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        activity_types: activityTypes,
        criteria: criteria
          .filter((c) => c.name.trim())
          .map((c, i) => ({
            key: c.key || c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `criterion_${i + 1}`,
            name: c.name,
            description: c.description || "",
            weight: Number(c.weight) || 1,
          })),
        active,
      };
      if (isNew) await api.post("/api/admin/playbooks", payload);
      else await api.patch(`/api/admin/playbooks/${playbook.id}`, payload);
      toast(isNew ? "Playbook created" : "Playbook updated", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? "New playbook" : `Edit ${playbook.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field">
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 6 }}>
          Applies to activity types
        </span>
        <div className="flex" style={{ flexWrap: "wrap" }}>
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              onClick={() => toggleType(t)}
              style={{
                cursor: "pointer",
                border: "1px solid",
                borderColor: activityTypes.includes(t) ? "var(--accent)" : "var(--border)",
                background: activityTypes.includes(t) ? "rgba(233,30,99,0.1)" : "#fff",
                color: activityTypes.includes(t) ? "var(--accent)" : "var(--text-soft)",
                fontWeight: 600,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 6 }}>
          Criteria
        </span>
        {criteria.map((c, i) => (
          <div className="criteria-row" key={i}>
            <input className="input" style={{ flex: 1 }} placeholder="Name" value={c.name} onChange={(e) => setCrit(i, "name", e.target.value)} />
            <input className="input" style={{ flex: 2 }} placeholder="Description" value={c.description || ""} onChange={(e) => setCrit(i, "description", e.target.value)} />
            <input className="input" style={{ width: 70 }} type="number" min="0" step="0.5" title="Weight" value={c.weight} onChange={(e) => setCrit(i, "weight", e.target.value)} />
            <button className="icon-btn" onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove">
              <TrashIcon size={15} />
            </button>
          </div>
        ))}
        <button className="btn btn-outline btn-sm" onClick={addCrit}>
          <PlusIcon size={13} /> Add criterion
        </button>
      </div>
      <label className="flex" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Active</span>
      </label>
    </Modal>
  );
}

function PlaybooksSection() {
  const toast = useToast();
  const [playbooks, setPlaybooks] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => {
    api
      .get("/api/admin/playbooks")
      .then((d) => setPlaybooks(Array.isArray(d) ? d : []))
      .catch((e) => {
        setPlaybooks([]);
        toast(e.message, "error");
      });
  };
  useEffect(load, []);

  const remove = async (p) => {
    if (!window.confirm(`Delete playbook "${p.name}"?`)) return;
    try {
      await api.del(`/api/admin/playbooks/${p.id}`);
      load();
      toast("Playbook deleted", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (playbooks === null) return <Spinner />;
  return (
    <>
      <div className="spread" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Playbooks &amp; Frameworks</h3>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <PlusIcon size={14} /> New playbook
        </button>
      </div>
      {playbooks.length === 0 ? (
        <div className="card"><EmptyState icon="📘" title="No playbooks yet" /></div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {playbooks.map((p) => (
            <div className="card" key={p.id}>
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {p.name} {p.active === false && <span className="small faint">(inactive)</span>}
                  </div>
                  <div className="muted small">{p.description}</div>
                </div>
                <div className="flex">
                  <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Edit"><EditIcon size={15} /></button>
                  <button className="icon-btn" onClick={() => remove(p)} aria-label="Delete"><TrashIcon size={15} /></button>
                </div>
              </div>
              <div className="flex" style={{ flexWrap: "wrap", margin: "10px 0" }}>
                {(p.activity_types || []).map((t) => (
                  <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>
                ))}
              </div>
              <table className="data">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Description</th>
                    <th style={{ width: 80 }}>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {(p.criteria || []).map((c) => (
                    <tr key={c.key}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td className="small muted">{c.description}</td>
                      <td>{c.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <PlaybookModal playbook={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </>
  );
}

/* ---------------- Vocabulary ---------------- */
function VocabularySection() {
  const toast = useToast();
  const [terms, setTerms] = useState(null);
  const [term, setTerm] = useState("");

  const load = () => {
    api
      .get("/api/admin/vocabulary")
      .then((d) => setTerms(Array.isArray(d) ? d : []))
      .catch((e) => {
        setTerms([]);
        toast(e.message, "error");
      });
  };
  useEffect(load, []);

  const add = async () => {
    if (!term.trim()) return;
    try {
      await api.post("/api/admin/vocabulary", { term: term.trim() });
      setTerm("");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const remove = async (t) => {
    try {
      await api.del(`/api/admin/vocabulary/${t.id}`);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (terms === null) return <Spinner />;
  return (
    <div className="card">
      <h3 className="card-title">Vocabulary</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Custom terms that improve transcription accuracy (product names, jargon, acronyms).
      </p>
      <div className="flex" style={{ marginBottom: 16, maxWidth: 420 }}>
        <input
          className="input"
          placeholder="Add a term, e.g. EE Broadband…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-primary" onClick={add} disabled={!term.trim()}>
          <PlusIcon size={14} /> Add
        </button>
      </div>
      {terms.length === 0 ? (
        <EmptyState icon="🗣️" title="No vocabulary terms" />
      ) : (
        <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
          {terms.map((t) => (
            <span className="tag" key={t.id ?? t.term}>
              {t.term ?? String(t)}
              <button className="x" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-soft)", display: "flex", padding: 0 }} onClick={() => remove(t)} aria-label="Delete">
                <XIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Privacy ---------------- */
function PrivacySection() {
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const erase = async () => {
    if (!phone.trim()) return;
    if (!window.confirm(`Permanently erase all data for ${phone}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/gdpr/erase?phone=${encodeURIComponent(phone.trim())}`);
      toast("Erasure complete", "success");
      setPhone("");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">Privacy — GDPR erasure</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Erase all recordings, transcripts and analytics associated with a phone number. This action is permanent.
      </p>
      <div className="flex" style={{ maxWidth: 420 }}>
        <input className="input" placeholder="+44 1865 000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn btn-danger" onClick={erase} disabled={busy || !phone.trim()}>
          {busy ? "Erasing…" : "Erase"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Settings() {
  const toast = useToast();
  const [section, setSection] = useState("general");
  const [teams, setTeams] = useState([]);

  const reloadTeams = () => {
    api
      .get("/api/admin/teams")
      .then((d) => setTeams(Array.isArray(d) ? d : []))
      .catch((e) => toast(e.message, "error"));
  };
  useEffect(reloadTeams, []);

  return (
    <div className="page">
      <div style={{ marginBottom: 18 }}>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">BT Local Business Oxford &amp; Bucks workspace configuration.</p>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav card" style={{ padding: 10 }}>
          {SECTIONS.map(([k, label]) => (
            <button key={k} className={section === k ? "active" : ""} onClick={() => setSection(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {section === "general" && <GeneralSection />}
          {section === "users" && <UsersSection teams={teams} />}
          {section === "teams" && <TeamsSection teams={teams} reloadTeams={reloadTeams} />}
          {section === "topics" && <TopicsSection />}
          {section === "playbooks" && <PlaybooksSection />}
          {section === "vocabulary" && <VocabularySection />}
          {section === "privacy" && <PrivacySection />}
        </div>
      </div>
    </div>
  );
}
