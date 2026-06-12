import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Avatar } from "./ui.jsx";
import { clearAuth } from "../api";
import {
  SearchIcon,
  HomeIcon,
  PlayCircleIcon,
  InsightsIcon,
  CoachingIcon,
  ReportsIcon,
  SettingsIcon,
  LogoutIcon,
} from "./Icons.jsx";

export default function Sidebar({ user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const popRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const logout = () => {
    clearAuth();
    navigate("/login");
  };

  const link = (to, label, Icon, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}>
      <Icon size={21} />
      <span className="sidebar-tip">{label}</span>
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo" title="CallIQ">
        IQ
      </NavLink>
      <nav className="sidebar-nav">
        {link("/library", "Search & Library", SearchIcon)}
        {link("/", "Home", HomeIcon, true)}
        {link("/recordings", "Recordings", PlayCircleIcon)}
        {link("/insights", "Insights", InsightsIcon)}
        {link("/insights/coaching", "Coaching", CoachingIcon)}
        {link("/reports", "AI Reports", ReportsIcon)}
      </nav>
      <div className="sidebar-bottom">
        {user?.role === "admin" && link("/settings", "Settings", SettingsIcon)}
        <button
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Account"
        >
          <Avatar name={user?.name} color={user?.avatar_color} size={36} />
        </button>
      </div>
      {menuOpen && (
        <div className="user-pop" ref={popRef}>
          <div className="name">{user?.name}</div>
          <div className="email">{user?.email}</div>
          <div className="small muted" style={{ marginBottom: 10, textTransform: "capitalize" }}>
            Role: {user?.role}
          </div>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            <LogoutIcon size={14} /> Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
