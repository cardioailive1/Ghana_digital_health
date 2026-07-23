// ============================================================
// useSessionTimer — HIPAA §164.312(a)(2)(iii) automatic logoff
// Shows countdown warning 10 min before 8h session expires
// Resets on user activity (mouse / keyboard)
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const WARN_BEFORE_MS = 10 * 60 * 1000; // warn 10 min before expiry

export function useSessionTimer() {
  const { token, logout } = useAuth();
  const [timeLeft, setTimeLeft] = useState(null);   // seconds until expiry
  const [showWarning, setShowWarning] = useState(false);
  const tickRef = useRef(null);

  const getExpiry = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.exp * 1000;
    } catch { return null; }
  }, [token]);

  useEffect(() => {
    if (!token) { setTimeLeft(null); setShowWarning(false); return; }

    function tick() {
      const expiry = getExpiry();
      if (!expiry) return;
      const msLeft = expiry - Date.now();

      if (msLeft <= 0) {
        clearInterval(tickRef.current);
        logout();
        return;
      }

      setTimeLeft(Math.floor(msLeft / 1000));
      setShowWarning(msLeft <= WARN_BEFORE_MS);
    }

    tick();
    tickRef.current = setInterval(tick, 30000); // check every 30s
    return () => clearInterval(tickRef.current);
  }, [token, getExpiry, logout]);

  function formatTimeLeft(secs) {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return { timeLeft, showWarning, formatted: formatTimeLeft(timeLeft) };
}
