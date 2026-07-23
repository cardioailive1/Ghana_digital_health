// ============================================================
// useApi — authenticated fetch wrapper
// Attaches JWT, handles 401 (auto-logout), 429 (retry)
// SOC 2 CC7: request IDs on every call for traceability
// ============================================================
import { useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const RETRY_DELAYS = [5, 15, 30, 60]; // seconds

export function useApi() {
  const { token, logout } = useAuth();
  const retryCount = useRef(0);

  const apiFetch = useCallback(async (url, options = {}, onRetryStatus = null) => {
    const reqId = crypto.randomUUID();
    const headers = {
      "Content-Type": "application/json",
      "X-Request-ID": reqId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const config = { credentials: "include", ...options, headers };

    let attempt = 0;
    while (attempt <= RETRY_DELAYS.length) {
      const res = await fetch(url, config);

      // ── 401: session expired — force logout ───────────────
      if (res.status === 401) {
        logout();
        throw Object.assign(new Error("Session expired"), { code: "SESSION_EXPIRED" });
      }

      // ── 429 / 529: rate limited — retry with back-off ─────
      if (res.status === 429 || res.status === 529) {
        if (attempt >= RETRY_DELAYS.length) {
          throw Object.assign(
            new Error(`Rate limited after ${RETRY_DELAYS.length} retries`),
            { code: "RATE_LIMITED" }
          );
        }
        const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        const delay = retryAfter > 0 ? retryAfter : RETRY_DELAYS[attempt];
        if (onRetryStatus) onRetryStatus({ attempt: attempt + 1, delay, maxRetries: RETRY_DELAYS.length });
        await new Promise(r => setTimeout(r, delay * 1000));
        attempt++;
        continue;
      }

      // ── Non-OK responses ──────────────────────────────────
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        throw Object.assign(
          new Error(errBody?.error?.message || `HTTP ${res.status}`),
          { status: res.status, reqId }
        );
      }

      retryCount.current = 0;
      return res;
    }
  }, [token, logout]);

  // Convenience wrappers
  const get  = useCallback((url, opts) => apiFetch(url, { ...opts, method: "GET" }), [apiFetch]);
  const post = useCallback((url, body, opts, onRetry) =>
    apiFetch(url, { ...opts, method: "POST", body: JSON.stringify(body) }, onRetry), [apiFetch]);
  const put  = useCallback((url, body, opts) =>
    apiFetch(url, { ...opts, method: "PUT",  body: JSON.stringify(body) }), [apiFetch]);
  const del  = useCallback((url, opts) => apiFetch(url, { ...opts, method: "DELETE" }), [apiFetch]);

  return { apiFetch, get, post, put, del };
}
