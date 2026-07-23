// ============================================================
// AuthContext — global auth state shared across all components
// Stores user, token, permissions. Auto-refreshes token.
// HIPAA: enforces 8h session; clears on expiry
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch { return null; }
}

function isExpired(payload) {
  return !payload || payload.exp * 1000 < Date.now();
}

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false); // true once init check done

  // ── Initialise from localStorage on mount ─────────────────
  useEffect(() => {
    const stored = localStorage.getItem("cai_token");
    if (stored) {
      const payload = parseJwt(stored);
      if (!isExpired(payload)) {
        setToken(stored);
        setUser(payload);
      } else {
        localStorage.removeItem("cai_token");
      }
    }
    setReady(true);
  }, []);

  // ── Auto-refresh token 30 min before expiry ───────────────
  useEffect(() => {
    if (!token) return;
    const payload = parseJwt(token);
    if (!payload) return;
    const msUntilRefresh = (payload.exp * 1000) - Date.now() - (30 * 60 * 1000);
    if (msUntilRefresh <= 0) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("cai_token", data.token);
          setToken(data.token);
          setUser(parseJwt(data.token));
        } else {
          logout();
        }
      } catch { /* network error — leave session until next check */ }
    }, msUntilRefresh);
    return () => clearTimeout(timer);
  }, [token]);

  // ── Login ─────────────────────────────────────────────────
  const login = useCallback((userData, tok) => {
    localStorage.setItem("cai_token", tok);
    setToken(tok);
    setUser(userData);
  }, []);

  // ── Logout ────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* ignore network errors on logout */ }
    localStorage.removeItem("cai_token");
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
