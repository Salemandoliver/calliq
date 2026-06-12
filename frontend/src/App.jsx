import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { getToken, getStoredUser } from "./api";
import { ToastProvider } from "./components/Toast.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Library from "./pages/Library.jsx";
import CallDetail from "./pages/CallDetail.jsx";
import Insights from "./pages/Insights.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";

function ProtectedLayout() {
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <main className="app-content">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}

function AdminOnly({ children }) {
  const user = getStoredUser();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/recordings" element={<Navigate to="/library" replace />} />
            <Route path="/calls/:id" element={<CallDetail />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/insights/:tab" element={<Insights />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="/settings"
              element={
                <AdminOnly>
                  <Settings />
                </AdminOnly>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
